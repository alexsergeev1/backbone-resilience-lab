import { nodes, links, scenarios } from './network.mjs';

const element=id=>document.getElementById(id);
const byNode=new Map(nodes.map(node=>[node.id,node]));
const title=link=>byNode.get(link.a).name+' ↔ '+byNode.get(link.b).name;
const format=value=>Math.round(value).toLocaleString('en-US');
const percent=value=>(value*100).toFixed(1)+'%';
const palette={ mint:'#79efcf', amber:'#ffbe77', rose:'#ff8e98', pale:'#bdd9f1', dim:'#344e54' };
const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
let failed=new Set();
let version=0;
let output;
let busy=false;
const preset=element('preset');
const slider=element('hour');
const map=element('topology');

preset.replaceChildren(...Object.keys(scenarios).map(name=>new Option(name,name)),new Option('Custom','custom'));
element('link').replaceChildren(...links.map(link=>new Option(title(link),link.id)));

function table(id, headings, rows) {
  const target=element(id);
  target.tHead.replaceChildren();
  target.tBodies[0].replaceChildren();
  const header=target.tHead.insertRow();
  headings.forEach(text=>{
    const cell=document.createElement('th');
    cell.scope='col';
    cell.textContent=text;
    header.append(cell);
  });
  for(const row of rows) {
    const targetRow=target.tBodies[0].insertRow();
    row.forEach(value=>targetRow.insertCell().textContent=value);
  }
}

function line(ctx,x1,y1,x2,y2) {
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();
}

function drawMap(snapshot) {
  const ctx=map.getContext('2d');
  ctx.clearRect(0,0,map.width,map.height);
  ctx.lineWidth=1;
  ctx.strokeStyle='#14272c';
  for(let x=20;x<map.width;x+=30) line(ctx,x,0,x,map.height);
  for(let y=18;y<map.height;y+=30) line(ctx,0,y,map.width,y);
  for(const link of [...snapshot.flows].sort((a,b)=>Number(a.failed)-Number(b.failed))) {
    const a=byNode.get(link.a), b=byNode.get(link.b);
    ctx.strokeStyle=link.failed ? palette.rose : link.flow ? palette.mint : palette.dim;
    ctx.globalAlpha=link.failed ? .85 : link.flow ? .62 : .7;
    ctx.lineWidth=link.failed ? 2 : 1+Math.abs(link.flow)/14;
    ctx.setLineDash(link.failed ? [6,5] : []);
    line(ctx,a.x,a.y,b.x,b.y);
  }
  ctx.setLineDash([]);
  ctx.globalAlpha=1;
  ctx.font='600 14px Inter, system-ui';
  for(const city of snapshot.cities) {
    const color=city.delivered<city.requested ? palette.amber : city.supply ? palette.mint : palette.pale;
    ctx.beginPath();
    ctx.arc(city.x,city.y,city.supply ? 8 : 6,0,2*Math.PI);
    ctx.fillStyle=color;
    ctx.fill();
    ctx.strokeStyle='#0a1518';
    ctx.lineWidth=2;
    ctx.stroke();
    ctx.lineWidth=4;
    ctx.strokeText(city.name,city.x+10,city.y-9);
    ctx.fillStyle='#ecf6f4';
    ctx.fillText(city.name,city.x+10,city.y-9);
  }
}

function drawCurve(plans,hour) {
  const canvas=element('curve'), ctx=canvas.getContext('2d');
  const left=57,right=canvas.width-25,top=16,bottom=canvas.height-30;
  const points=plans.beam.history;
  const x=t=>left+t*(right-left)/(points.length-1);
  const y=fraction=>bottom-fraction*(bottom-top);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font='13px monospace';
  ctx.fillStyle='#a9bdba';
  ctx.lineWidth=1;
  for(const fraction of [0,.25,.5,.75,1]) {
    ctx.strokeStyle='#294045';
    line(ctx,left,y(fraction),right,y(fraction));
    ctx.fillText(Math.round(fraction*100)+'%',12,y(fraction)+4);
  }
  for(let t=0;t<points.length;t+=2) ctx.fillText(t+'h',x(t)-7,bottom+20);
  ctx.strokeStyle='#bdd9f1';
  line(ctx,x(hour),top,x(hour),bottom);
  for(const [plan,color] of [[plans.greedy,palette.amber],[plans.beam,palette.mint]]) {
    ctx.strokeStyle=color;
    ctx.lineWidth=3;
    ctx.beginPath();
    plan.history.forEach((point,t)=>{
      const value=y(point.delivered/point.requested);
      if(t===0) ctx.moveTo(x(t),value);
      else ctx.lineTo(x(t),value);
    });
    ctx.stroke();
  }
}

function assignCrews(schedule, count) {
  const crews=Array(count).fill(0);
  return schedule.map(job=>{
    const index=crews.findIndex(end=>end<=job.start);
    crews[index]=job.end;
    return {...job,crew:index+1};
  });
}

function render() {
  if(!output) return;
  const {plans,risks}=output;
  const hour=Number(slider.value);
  const selected=plans[element('strategy').value];
  const snapshot=selected.history[hour];
  element('hourValue').value=hour+'h';
  element('faultCount').textContent=snapshot.flows.filter(link=>link.failed).length+' links down · '+percent(snapshot.delivered/snapshot.requested)+' served';
  element('served').textContent=percent(selected.history[0].delivered/selected.history[0].requested);
  element('loss').textContent=format(selected.score);
  const saved=plans.greedy.score-plans.beam.score;
  element('gain').textContent=plans.greedy.score ? percent(saved/plans.greedy.score) : '0.0%';
  element('comparison').textContent='Beam search: '+format(plans.beam.score)+' weighted Gbps-hours unserved. Greedy: '+format(plans.greedy.score)+'.'
    +(plans.usedFallback ? ' The comparison keeps the greedy schedule because it scored better.' : '');
  drawMap(snapshot);
  drawCurve(plans,hour);
  const repairs=assignCrews(selected.schedule,output.crews);
  table('repairs',['Link','Crew','Start','End'],repairs.length
    ? repairs.map(job=>[title(job.link),job.crew,job.start+'h',job.end+'h'])
    : [['No repairs required','—','—','—']]);
  table('risks',['Link','Lost Gbps','Weighted loss'],risks.map(risk=>[title(risk.link),risk.lost,risk.weighted]));
  table('cities',['City','Priority','Requested Gbps','Served Gbps','Unserved Gbps'],
    snapshot.cities.map(city=>[city.name,city.priority,city.requested,city.delivered,city.requested-city.delivered]));
}

function calculate() {
  busy=true;
  element('run').disabled=true;
  element('export').disabled=true;
  element('status').textContent='Planning restoration…';
  worker.postMessage({version:++version,failed:[...failed],
    config:{load:Number(element('load').value),crews:Number(element('crews').value),width:32}});
}

function loadPreset() {
  if(preset.value==='custom') return;
  failed=new Set(scenarios[preset.value]);
  slider.value=0;
  calculate();
}

function toggle(id) {
  if(failed.has(id)) failed.delete(id);
  else if(failed.size<10) failed.add(id);
  else {
    element('status').textContent='Up to 10 simultaneous link failures.';
    return;
  }
  preset.value='custom';
  slider.value=0;
  calculate();
}

worker.addEventListener('message',event=>{
  if(event.data.version!==version) return;
  busy=false;
  element('run').disabled=false;
  if(event.data.error) { element('status').textContent=event.data.error; return; }
  output=event.data;
  element('export').disabled=false;
  render();
  element('status').textContent=failed.size+' initial failures. Plans ready.';
});
worker.addEventListener('error',()=>{
  busy=false;
  element('run').disabled=false;
  element('status').textContent='The planning worker could not start. Reload from the local HTTP server.';
});
preset.addEventListener('change',loadPreset);
element('run').addEventListener('click',calculate);
element('toggle').addEventListener('click',()=>toggle(element('link').value));
element('load').addEventListener('change',calculate);
element('crews').addEventListener('change',calculate);
element('strategy').addEventListener('change',()=>{if(!busy) render();});
slider.addEventListener('input',()=>{if(!busy) render();});
map.addEventListener('click',event=>{
  const bounds=map.getBoundingClientRect();
  const x=(event.clientX-bounds.left)*map.width/bounds.width;
  const y=(event.clientY-bounds.top)*map.height/bounds.height;
  let nearest;
  let distance=11;
  for(const link of links) {
    const a=byNode.get(link.a),b=byNode.get(link.b);
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy);
    if(t<.07||t>.93) continue;
    const offset=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    if(offset<distance) { nearest=link; distance=offset; }
  }
  if(nearest) { element('link').value=nearest.id; toggle(nearest.id); }
});
element('export').addEventListener('click',()=>{
  if(!output||busy) return;
  const selected=element('strategy').value;
  const schedule=assignCrews(output.plans[selected].schedule,output.crews);
  const csv=['strategy,link,crew,start_hour,end_hour',...schedule.map(job=>[selected,job.link.id,job.crew,job.start,job.end].join(','))].join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='backbone-repair-plan.csv';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
loadPreset();
