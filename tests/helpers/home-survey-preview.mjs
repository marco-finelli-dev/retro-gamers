// Local-only visual fixture. Real Home + real survey handlers, in-memory adapters.
// All non-survey writes are blocked; no production vote or email can be sent.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadSurveyHarness } from './survey-harness.mjs';
import { state, reset } from './survey-backend.mjs';
const api = await loadSurveyHarness();
const key='home-amiga-platformer-2026';
let resetId;
http.createServer(async(req,res)=>{
 try {
  const path=req.url || '/';
  if(path.startsWith(`/api/community/surveys/${key}`)) {
    let scenario={};try {scenario=JSON.parse(await readFile('/tmp/rg-home-poll/scenario.json','utf8'));}catch{}
    if(scenario.reset !== resetId) {reset();resetId=scenario.reset;
      for(let i=0;i<(scenario.counts||[]).length;i++) for(let n=0;n<scenario.counts[i];n++) {
        const id=crypto.randomUUID();state.responses.push({id,survey_key:key,survey_language:'it',submitted_at:new Date().toISOString()});
        state.answers.push({id:crypto.randomUUID(),response_id:id,question_id:'next-review',option_id:state.documents[0].questions[0].options[i].optionId});
      }
    }
    state.fail=!!scenario.fail;state.documents.forEach(d=>d.status=scenario.closed?'closed':'open');
    if(scenario.missing) state.documents=[];
    if(scenario.delay) await new Promise(resolve=>setTimeout(resolve,scenario.delay));
    const values=new Map((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')));
    const cookies={get:name=>values.has(name)?{value:values.get(name)}:undefined,set:(name,value)=>{values.set(name,value);res.setHeader('Set-Cookie',`${name}=${value}; Path=/; HttpOnly; SameSite=Lax`);}};
    const url=new URL(path,'http://127.0.0.1:4327');let response;
    if(req.method==='POST') {state.posts++;let body='';for await(const chunk of req)body+=chunk;response=await api.post({params:{surveyKey:key},cookies,request:new Request(url,{method:'POST',body,headers:{'Content-Type':'application/json'}})});}
    else response=await api.get({params:{surveyKey:key},cookies,url});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const upstream=await fetch(`http://localhost:4321${path}`,{headers:{'accept-language':req.headers['accept-language']||'it'}});
  const headers=Object.fromEntries(upstream.headers);delete headers['content-encoding'];delete headers['content-length'];
  res.writeHead(upstream.status,headers);res.end(Buffer.from(await upstream.arrayBuffer()));
 } catch(error){res.writeHead(500);res.end(String(error));}
}).listen(4327,'127.0.0.1',()=>console.log('Isolated Home survey preview: http://127.0.0.1:4327'));
