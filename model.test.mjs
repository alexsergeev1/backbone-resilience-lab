import test from 'node:test';
import assert from 'node:assert/strict';
import { backbone, compare, criticalLinks, HORIZON, route } from './model.mjs';
import { scenarios } from './network.mjs';
import { events, investments, planCapital, tailMean } from './portfolio.mjs';

test('priority wins when demand competes for limited supply',()=>{
  const network={
    nodes:[
      {id:'s',supply:6,demand:0,priority:1},
      {id:'a',supply:0,demand:6,priority:1},
      {id:'b',supply:0,demand:6,priority:4},
    ],
    links:[
      {id:'sa',a:'s',b:'a',capacity:6,latency:1},
      {id:'sb',a:'s',b:'b',capacity:4,latency:8},
    ],
  };
  const result=route(network,new Set());
  assert.equal(result.delivered,6);
  assert.deepEqual(result.cities.map(city=>city.delivered),[0,2,4]);
  assert.equal(result.weightedLoss,12);
  assert.equal(route(network,new Set(['sa'])).delivered,4);
});

test('routing uses residual capacity to revise an earlier shortest path',()=>{
  const network={
    nodes:[
      {id:'s',supply:2,demand:0,priority:1},
      {id:'a',supply:0,demand:0,priority:1},
      {id:'b',supply:0,demand:0,priority:1},
      {id:'x',supply:0,demand:1,priority:4},
      {id:'y',supply:0,demand:1,priority:2},
    ],
    links:[
      {id:'sa',a:'s',b:'a',capacity:1,latency:1},
      {id:'sb',a:'s',b:'b',capacity:1,latency:1},
      {id:'ax',a:'a',b:'x',capacity:1,latency:1},
      {id:'ay',a:'a',b:'y',capacity:1,latency:1},
      {id:'bx',a:'b',b:'x',capacity:1,latency:4},
    ],
  };
  const result=route(network,new Set());
  assert.equal(result.delivered,2);
  assert.deepEqual(result.flows.map(link=>link.flow),[1,1,0,1,1]);
});

test('incident recovery respects capacity, crew limits and outage accounting',()=>{
  for(const name of ['Atlantic cuts','Western cascade']) {
    const failed=new Set(scenarios[name]);
    const { beam,greedy }=compare(failed,{load:1,crews:2,width:32});
    assert.ok(beam.score<greedy.score);
    for(const plan of [beam,greedy]) {
      assert.equal(plan.history.length,HORIZON+1);
      assert.equal(plan.complete,true);
      assert.equal(plan.score,plan.history.slice(0,-1).reduce((sum,hour)=>sum+hour.weightedLoss,0));
      assert.equal(plan.schedule.length,failed.size);
      for(const point of plan.history) {
        assert.ok(point.flows.every(link=>Math.abs(link.flow)<=link.capacity && (!link.failed||link.flow===0)));
        assert.equal(point.delivered,point.cities.reduce((sum,city)=>sum+city.delivered,0));
        assert.ok(plan.schedule.filter(job=>job.start<=point.hour&&point.hour<job.end).length<=2);
      }
    }
  }
});

test('an intact network serves nominal demand and contingency ranks exclude failures',()=>{
  const base=route(backbone,new Set());
  assert.equal(base.delivered,base.requested);
  const failed=new Set(scenarios['Atlantic cuts']);
  const ranked=criticalLinks(failed,1);
  assert.equal(ranked.length,backbone.links.length-failed.size);
  assert.ok(ranked.every(risk=>!failed.has(risk.link.id)));
  assert.ok(ranked[0].lost>0);
  assert.ok(ranked.every((risk,i)=>i===0||ranked[i-1].weighted>=risk.weighted));
});

test('regional stress uses common deterministic draws and measures worst-decile losses',()=>{
  assert.deepEqual(events(42,8,1),events(42,8,1));
  assert.notDeepEqual(events(42,8,1),events(43,8,1));
  assert.equal(tailMean([1,2,3,4,5,6,7,8,9,10,100]),55);
});

test('capital search obeys budget and keeps independent outcomes paired',()=>{
  const counts={train:10,holdout:12};
  const result=planCapital({budget:13,weight:.5,seed:42,stress:1},undefined,counts);
  const feasible=Array.from({length:1<<investments.length},(_,mask)=>investments
    .reduce((sum,project,i)=>sum+((mask&(1<<i))?project.cost:0),0)).filter(cost=>cost<=13);
  assert.equal(result.evaluated,feasible.length);
  assert.ok(result.best.cost<=13 && result.greedy.cost<=13);
  assert.ok(result.best.training<=result.greedy.training);
  assert.ok(result.frontier.every((entry,i)=>i===0||entry.score<result.frontier[i-1].score));
  for(const plan of [result.baseline,result.greedy,result.best]) {
    assert.equal(plan.rows.length,counts.holdout);
    assert.deepEqual(plan.rows.map(row=>[row.id,row.zone]),result.baseline.rows.map(row=>[row.id,row.zone]));
  }
  const zero=planCapital({budget:0,weight:1,seed:42,stress:1},undefined,counts);
  assert.equal(zero.evaluated,1);
  assert.deepEqual(zero.best,zero.baseline);
});
