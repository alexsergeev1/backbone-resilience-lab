import { backbone, route } from './model.mjs';

export const investments = [
  { id:'east-ring', name:'Northeast bypass', cost:8, link:{id:'bos-chi',a:'bos',b:'chi',capacity:35,latency:24,hours:4} },
  { id:'west-ring', name:'Pacific bypass', cost:8, link:{id:'sfo-den',a:'sfo',b:'den',capacity:38,latency:23,hours:4} },
  { id:'gulf-ring', name:'Gulf bypass', cost:7, link:{id:'mia-stl',a:'mia',b:'stl',capacity:32,latency:21,hours:4} },
  { id:'east-hardening', name:'Atlantic hardening', cost:6, harden:['iad-nyc','nyc-bos','iad-bos','chi-nyc'] },
  { id:'west-hardening', name:'Pacific hardening', cost:6, harden:['sea-pdx','pdx-sfo','sfo-lax','sea-slc'] },
  { id:'central-hardening', name:'Central hardening', cost:5, harden:['den-stl','den-dfw','dfw-stl','chi-stl'] },
  { id:'origin-headroom', name:'Origin headroom', cost:7, supply:['den','iad'], extra:30 },
  { id:'core-headroom', name:'Core capacity', cost:5, expand:['chi-iad','atl-iad','dfw-atl','slc-den'], extra:18 },
];

function generator(seed) {
  let state=seed>>>0;
  return ()=>{
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    return state/4294967296;
  };
}

const allLinks=[...backbone.links,...investments.flatMap(project=>project.link?[project.link]:[])];
const nodeById=new Map(backbone.nodes.map(node=>[node.id,node]));
const zone=x=>x<265?0:x<590?1:2;

export function events(seed,count,stress) {
  const random=generator(seed);
  return Array.from({length:count},(_,i)=>{
    const active=Math.floor(random()*3);
    const strength=(.45+random()*.55)*stress;
    const surge=[.9,1,1.1,1.2][Math.floor(random()*4)];
    const failures=Object.fromEntries(allLinks.map(link=>{
      const endpoints=[nodeById.get(link.a),nodeById.get(link.b)];
      const affected=endpoints.filter(node=>zone(node.x)===active).length;
      const probability=Math.min(.9,.025+strength*(affected===2?.65:affected===1?.34:.055));
      return [link.id,{draw:random(),probability}];
    }));
    return {id:i+1,zone:['Pacific','Central','Atlantic'][active],surge,failures};
  });
}

function portfolio(mask) {
  const projects=investments.filter((_,i)=>mask&(1<<i));
  const protectedLinks=new Set(projects.flatMap(project=>project.harden??[]));
  const links=[...backbone.links,...projects.flatMap(project=>project.link?[project.link]:[])].map(link=>{
    const extra=projects.reduce((sum,project)=>sum+(project.expand?.includes(link.id)?project.extra:0),0);
    return {...link,capacity:link.capacity+extra};
  });
  const nodes=backbone.nodes.map(node=>{
    const extra=projects.reduce((sum,project)=>sum+(project.supply?.includes(node.id)?project.extra:0),0);
    return {...node,supply:node.supply+extra};
  });
  return {mask,network:{nodes,links},protectedLinks,ids:projects.map(project=>project.id),
    cost:projects.reduce((sum,project)=>sum+project.cost,0)};
}

export function tailMean(values,fraction=.1) {
  const sorted=[...values].sort((a,b)=>b-a);
  const tail=sorted.slice(0,Math.max(1,Math.ceil(values.length*fraction)));
  return tail.reduce((sum,value)=>sum+value,0)/tail.length;
}

function evaluate(plan,samples,weight) {
  const cache=new Map();
  const rows=samples.map(sample=>{
    const failed=plan.network.links.filter(link=>{
      const {draw,probability}=sample.failures[link.id];
      return draw<probability*(plan.protectedLinks.has(link.id)?.28:1);
    }).map(link=>link.id);
    const key=sample.surge+':'+failed.join(',');
    if(!cache.has(key)) {
      const result=route(plan.network,new Set(failed),sample.surge);
      cache.set(key,{loss:result.weightedLoss,served:result.delivered/result.requested});
    }
    return {id:sample.id,zone:sample.zone,failed:failed.length,...cache.get(key)};
  });
  const average=rows.reduce((sum,row)=>sum+row.loss,0)/rows.length;
  const tail=tailMean(rows.map(row=>row.loss));
  const below90=rows.filter(row=>row.served<.9).length/rows.length;
  return {average,tail,below90,score:(1-weight)*average+weight*tail,rows};
}

export function planCapital({budget,weight,seed,stress},notify=()=>{},counts={train:48,holdout:96}) {
  const train=events(seed,counts.train,stress);
  const holdout=events(seed^0x9e3779b9,counts.holdout,stress);
  const candidates=Array.from({length:1<<investments.length},(_,mask)=>portfolio(mask))
    .filter(plan=>plan.cost<=budget);
  const ranked=candidates.map((plan,i)=>{
    const {score,average,tail}=evaluate(plan,train,weight);
    if(i%12===0) notify(i,candidates.length);
    return {plan,score,average,tail};
  }).sort((a,b)=>a.score-b.score || a.plan.cost-b.plan.cost || a.plan.mask-b.plan.mask);
  const best=ranked[0];
  const byMask=new Map(ranked.map(candidate=>[candidate.plan.mask,candidate]));
  let greedy=byMask.get(0);
  while(true) {
    const next=investments.map((_,i)=>greedy.plan.mask&(1<<i)?null:byMask.get(greedy.plan.mask|(1<<i)))
      .filter(candidate=>candidate&&candidate.score<greedy.score)
      .sort((a,b)=>(greedy.score-b.score)/(b.plan.cost-greedy.plan.cost)
        -(greedy.score-a.score)/(a.plan.cost-greedy.plan.cost))[0];
    if(!next) break;
    greedy=next;
  }
  const frontier=[];
  let bestScore=Infinity;
  for(let spend=0;spend<=budget;spend++) {
    const candidate=ranked.find(entry=>entry.plan.cost===spend);
    if(candidate&&candidate.score<bestScore) {
      bestScore=candidate.score;
      frontier.push({cost:spend,score:candidate.score});
    }
  }
  function summarize(candidate) {
    return {ids:candidate.plan.ids,cost:candidate.plan.cost,training:candidate.score,
      ...evaluate(candidate.plan,holdout,weight)};
  }
  return {evaluated:candidates.length,train:counts.train,holdout:counts.holdout,frontier,
    baseline:summarize(byMask.get(0)),best:summarize(best),greedy:summarize(greedy)};
}
