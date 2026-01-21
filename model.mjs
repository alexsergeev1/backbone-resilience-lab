import { nodes as defaultNodes, links as defaultLinks } from './network.mjs';

export function route(network, failed, load = 1) {
  const { nodes, links } = network;
  const index = new Map(nodes.map((node,i) => [node.id,i]));
  const source = nodes.length;
  const sink = source + 1;
  const graph = Array.from({ length:sink+1 }, () => []);
  function add(from,to,capacity,cost) {
    const edge = { to, capacity, initial:capacity, cost, reverse:graph[to].length };
    graph[from].push(edge);
    graph[to].push({ to:from, capacity:0, initial:0, cost:-cost, reverse:graph[from].length-1 });
    return edge;
  }
  const demand = nodes.map(node => Math.round(node.demand*load));
  const priorityScale = 1 + links.reduce((sum,link) => sum+link.latency,0);
  const service = nodes.map((node,i) => {
    add(source,i,node.supply,0);
    return add(i,sink,demand[i],-node.priority*priorityScale);
  });
  const paths = links.map(link => {
    const a=index.get(link.a), b=index.get(link.b);
    const capacity = failed.has(link.id) ? 0 : link.capacity;
    return [add(a,b,capacity,link.latency),add(b,a,capacity,link.latency)];
  });
  let delivered=0;
  while (true) {
    const distance = Array(graph.length).fill(Infinity);
    const previous = Array(graph.length);
    distance[source]=0;
    for (let pass=0;pass<graph.length-1;pass++) {
      let changed=false;
      for (let from=0;from<graph.length;from++) {
        if (!Number.isFinite(distance[from])) continue;
        for (const edge of graph[from]) {
          if (edge.capacity<=0 || distance[from]+edge.cost>=distance[edge.to]) continue;
          distance[edge.to]=distance[from]+edge.cost;
          previous[edge.to]={ from,edge };
          changed=true;
        }
      }
      if (!changed) break;
    }
    if (!previous[sink]) break;
    let amount=Infinity;
    for(let to=sink;to!==source;to=previous[to].from) {
      amount=Math.min(amount,previous[to].edge.capacity);
    }
    for(let to=sink;to!==source;to=previous[to].from) {
      const {from,edge}=previous[to];
      edge.capacity-=amount;
      graph[to][edge.reverse].capacity+=amount;
    }
    delivered+=amount;
  }
  const cities=nodes.map((node,i) => ({
    ...node, requested:demand[i], delivered:service[i].initial-service[i].capacity,
  }));
  const weightedLoss=cities.reduce((sum,city) => sum+(city.requested-city.delivered)*city.priority,0);
  const flows=links.map((link,i) => {
    const [ab,ba]=paths[i];
    return {...link, failed:failed.has(link.id), flow:ab.initial-ab.capacity-ba.initial+ba.capacity};
  });
  return { cities, flows, delivered, requested:demand.reduce((a,b)=>a+b,0), weightedLoss };
}

export const backbone={ nodes:defaultNodes,links:defaultLinks };
export const HORIZON=14;

function options(jobs, active, restored, slots) {
  const available=jobs.map((_,i)=>i).filter(i=>!(restored&(1<<i)) && !active.some(job=>job.i===i));
  const result=[[]];
  for (let size=1;size<=Math.min(slots,available.length);size++) {
    function choose(start, picked) {
      if (picked.length===size) { result.push(picked); return; }
      for (let j=start;j<=available.length-(size-picked.length);j++) choose(j+1,[...picked,available[j]]);
    }
    choose(0,[]);
  }
  return result;
}

export function recovery(network, failed, config, strategy, sharedCache = new Map()) {
  const jobs=network.links.filter(link=>failed.has(link.id));
  if (jobs.length>10) throw new RangeError('Select up to ten failed links.');
  const full=(1<<jobs.length)-1;
  function snapshot(mask) {
    if (!sharedCache.has(mask)) {
      const down=new Set(jobs.filter((_,i)=>!(mask&(1<<i))).map(job=>job.id));
      sharedCache.set(mask,route(network,down,config.load));
    }
    return sharedCache.get(mask);
  }
  function advance(state, starts, hour) {
    const active=[...state.active,...starts.map(i=>({i,end:hour+jobs[i].hours}))];
    const done=active.filter(job=>job.end===hour+1);
    const mask=done.reduce((value,job)=>value|(1<<job.i),state.mask);
    return {
      mask,
      active:active.filter(job=>job.end>hour+1),
      score:state.score+snapshot(state.mask).weightedLoss,
      parent:state,
      starts,
      hour:hour+1,
    };
  }
  const start={mask:0,active:[],score:0,parent:null,starts:[],hour:0};
  let states=[start];
  for(let hour=0;hour<HORIZON;hour++) {
    const next=new Map();
    for(const state of states) {
      const slots=config.crews-state.active.length;
      const choices=options(jobs,state.active,state.mask,slots);
      if (strategy==='greedy') {
        const available=choices.filter(choice=>choice.length===1).map(([i])=>i);
        const rank=i=>(snapshot(state.mask).weightedLoss-snapshot(state.mask|(1<<i)).weightedLoss)/jobs[i].hours;
        available.sort((a,b)=>rank(b)-rank(a)||jobs[a].hours-jobs[b].hours||a-b);
        choices.splice(0,choices.length,available.slice(0,slots));
      }
      for(const choice of choices) {
        const candidate=advance(state,choice,hour);
        const key=candidate.mask+':'+candidate.active.map(job=>job.i+'@'+job.end).sort().join(',');
        const previous=next.get(key);
        if (!previous || candidate.score<previous.score) next.set(key,candidate);
      }
    }
    const rank=state=>{
      const loss=snapshot(state.mask).weightedLoss;
      const projected=state.active.reduce((mask,job)=>mask|(1<<job.i),state.mask);
      const remaining=jobs.filter((_,i)=>!(projected&(1<<i))).length;
      return state.score+0.8*loss+1.2*snapshot(projected).weightedLoss+0.001*remaining;
    };
    states=[...next.values()].sort((a,b)=>rank(a)-rank(b)).slice(0,config.width??24);
  }
  const repaired=state=>jobs.filter((_,i)=>state.mask&(1<<i)).length;
  const best=states.sort((a,b)=>a.score-b.score
    || snapshot(a.mask).weightedLoss-snapshot(b.mask).weightedLoss || repaired(b)-repaired(a))[0];
  const history=[];
  for(let state=best;state;state=state.parent) history.unshift(state);
  const schedule=history.flatMap(state=>state.starts.map(i=>({
    link:jobs[i], start:state.hour-1, end:state.hour-1+jobs[i].hours,
  })));
  return { score:best.score, schedule, complete:best.mask===full,
    history:history.map(state=>({hour:state.hour,mask:state.mask,...snapshot(state.mask)})) };
}

export function compare(failed,config) {
  const cache=new Map();
  const greedy=recovery(backbone,failed,config,'greedy',cache);
  const searched=recovery(backbone,failed,config,'beam',cache);
  const beam=searched.score<=greedy.score ? searched : greedy;
  return {greedy,beam,usedFallback:beam!==searched};
}

export function criticalLinks(failed,load) {
  const baseline=route(backbone,failed,load);
  return backbone.links.filter(link=>!failed.has(link.id)).map(link=>{
    const result=route(backbone,new Set([...failed,link.id]),load);
    return {link, lost:baseline.delivered-result.delivered, weighted:result.weightedLoss-baseline.weightedLoss};
  }).sort((a,b)=>b.weighted-a.weighted || b.lost-a.lost);
}
