import { compare, criticalLinks } from './model.mjs';

self.addEventListener('message',event=>{
  const { failed, config, version }=event.data;
  try {
    const outages=new Set(failed);
    const plans=compare(outages,config);
    self.postMessage({version,plans,crews:config.crews,risks:criticalLinks(outages,config.load).slice(0,8)});
  } catch(error) {
    self.postMessage({version,error:error.message});
  }
});
