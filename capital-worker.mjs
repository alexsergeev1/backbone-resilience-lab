import { planCapital } from './portfolio.mjs';

self.addEventListener('message',event=>{
  try {
    const result=planCapital(event.data,(done,total)=>self.postMessage({done,total}));
    self.postMessage({result});
  } catch(error) {
    self.postMessage({error:error.message});
  }
});
