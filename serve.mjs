import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const types=new Map([['index.html','text/html'],['styles.css','text/css'],
  ...['app','network','model','worker','capital','capital-worker','portfolio'].map(name=>[name+'.mjs','text/javascript'])]);
const port=Number(process.env.PORT||8092);
createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!types.has(name)) { res.writeHead(404).end(); return; }
  try {
    const file=await readFile(new URL(name,import.meta.url));
    res.writeHead(200,{'Content-Type':types.get(name)+'; charset=utf-8'}).end(file);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port,'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
