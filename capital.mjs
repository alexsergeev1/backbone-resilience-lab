import { investments } from './portfolio.mjs';

const element=id=>document.getElementById(id);
const form=element('capitalForm');
const status=element('capitalStatus');
const run=element('capitalRun');
const worker=new Worker(new URL('./capital-worker.mjs',import.meta.url),{type:'module'});
const names=new Map(investments.map(project=>[project.id,project.name]));
const number=value=>value.toFixed(1);
const percent=value=>number(value*100)+'%';
let current;

function drawFrontier(points) {
  const canvas=element('frontier'), ctx=canvas.getContext('2d');
  const left=66,right=canvas.width-30,top=24,bottom=canvas.height-32;
  const maxCost=Math.max(1,points.at(-1).cost);
  const maxScore=Math.max(1,points[0].score);
  const x=cost=>left+cost/maxCost*(right-left);
  const y=score=>bottom-score/maxScore*(bottom-top);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.font='13px monospace';
  ctx.fillStyle='#a9bdba';
  ctx.strokeStyle='#294045';
  ctx.lineWidth=1;
  for(let i=0;i<=4;i++) {
    const value=maxScore*i/4;
    const row=y(value);
    ctx.beginPath();
    ctx.moveTo(left,row);
    ctx.lineTo(right,row);
    ctx.stroke();
    ctx.fillText(number(value),8,row+4);
  }
  ctx.strokeStyle='#79efcf';
  ctx.lineWidth=3;
  ctx.beginPath();
  points.forEach(({cost,score},i)=>{
    if(i===0) ctx.moveTo(x(cost),y(score));
    else ctx.lineTo(x(cost),y(score));
  });
  ctx.stroke();
  for(const {cost,score} of points) {
    ctx.fillStyle='#79efcf';
    ctx.beginPath();
    ctx.arc(x(cost),y(score),4,0,2*Math.PI);
    ctx.fill();
    ctx.fillStyle='#a9bdba';
    ctx.fillText('$'+cost+'M',x(cost)-14,bottom+20);
  }
}

function render(result) {
  const {baseline,best,greedy}=result;
  const change=(before,after)=>before>0?(before-after)/before:0;
  element('capitalSpend').textContent='$'+best.cost+'M';
  element('capitalMean').textContent=percent(change(baseline.average,best.average));
  element('capitalTail').textContent=percent(change(baseline.tail,best.tail));
  element('capitalChoice').textContent='Selected upgrades: '+(best.ids.map(id=>names.get(id)).join(', ')||'none')
    +'. Evaluated '+result.evaluated+' feasible portfolios on '+result.train+' training scenarios.';
  const table=element('capitalTable');
  table.tHead.replaceChildren();
  const header=table.tHead.insertRow();
  for(const text of ['Portfolio','Spend','Mean loss','Worst 10%','Service below 90%']) {
    const cell=document.createElement('th');
    cell.scope='col';
    cell.textContent=text;
    header.append(cell);
  }
  const body=table.tBodies[0];
  body.replaceChildren();
  for(const [label,plan] of [['No investment',baseline],['Greedy per dollar',greedy],['Budget search',best]]) {
    const row=body.insertRow();
    for(const value of [label,'$'+plan.cost+'M',number(plan.average),number(plan.tail),percent(plan.below90)]) {
      row.insertCell().textContent=value;
    }
  }
  element('capitalResults').hidden=false;
  drawFrontier(result.frontier);
}

form.addEventListener('submit',event=>{
  event.preventDefault();
  run.disabled=true;
  element('capitalExport').disabled=true;
  status.textContent='Evaluating portfolios…';
  const config=Object.fromEntries([...new FormData(form)].map(([key,value])=>[key,Number(value)]));
  worker.postMessage(config);
});
worker.addEventListener('message',({data})=>{
  if('done' in data) {
    status.textContent='Evaluating '+data.done+' of '+data.total+' portfolios…';
    return;
  }
  run.disabled=false;
  if(data.error) { status.textContent=data.error; return; }
  current=data.result;
  render(current);
  element('capitalExport').disabled=false;
  status.textContent=current.holdout+' holdout scenarios evaluated.';
});
worker.addEventListener('error',()=>{
  run.disabled=false;
  status.textContent='The planning worker could not start. Reload from the HTTP server.';
});
element('capitalExport').addEventListener('click',()=>{
  if(!current) return;
  const lines=['portfolio,event,region,failed_links,weighted_loss,fraction_served'];
  for(const key of ['baseline','greedy','best']) {
    for(const row of current[key].rows) lines.push([key,row.id,row.zone,row.failed,row.loss,row.served].join(','));
  }
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='backbone-capital-holdout.csv';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
form.requestSubmit();
