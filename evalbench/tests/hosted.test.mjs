import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleApi } from '../server/api.mjs';
import { stats, gate } from '../web/core.js';

function database() {
  const sql = new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  function prepare(query, args = []) {
    return {
      bind(...values) { return prepare(query, values); },
      async first() { return sql.prepare(query).get(...args) || null; },
      async all() { return { results: sql.prepare(query).all(...args) }; },
      runSync() { const r = sql.prepare(query).run(...args); return { success:true,meta:{changes:Number(r.changes)} }; },
      async run() { return this.runSync(); },
    };
  }
  return { prepare, async batch(statements) { sql.exec('BEGIN');try { const r=[];for(const s of statements)r.push(s.runSync());sql.exec('COMMIT');return r; }catch(e){sql.exec('ROLLBACK');throw e;} }, close(){sql.close();} };
}
const request = (path, method='GET', data, origin) => new Request('https://eval.test'+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{})},body:data?JSON.stringify(data):undefined});
async function call(env,path,method,data,options) { const res=await handleApi(request(path,method,data),env,options);return {status:res.status,data:await res.json()}; }

test('hosted full synthetic lifecycle: queue → per-answer D1 persistence → resume → grades → reviews → JSON/CSV → archive/restore',async()=>{
 const DB=database(),env={DB};
 try {
  const id=crypto.randomUUID();
  const created=await call(env,'/api/runs','POST',{id,provider:'synthetic',name:'Independent server verification'});
  assert.equal(created.status,201);assert.equal(created.data.run.progress.total,16);assert.equal(created.data.run.progress.done,0);
  const duplicate=await call(env,'/api/runs','POST',{id,provider:'synthetic'});assert.equal(duplicate.status,200);
  const step=await call(env,`/api/runs/${id}/advance`,'POST',{});assert.equal(step.data.run.progress.done,1);
  // Fresh request has no in-memory run state and reads the already persisted answer.
  const resumed=await call(env,`/api/runs/${id}`);assert.equal(resumed.data.run.progress.done,1);
  await Promise.all([0,1].map(async()=>{while(true){const r=await call(env,`/api/runs/${id}/advance`,'POST',{});assert.equal(r.status,200);if(r.data.run.status==='completed')return;}}));
  const result=(await call(env,`/api/runs/${id}`)).data.run;
  assert.equal(stats(result,'a').passed,4);assert.equal(stats(result,'b').passed,5);assert.equal(gate(result,60).regressions,2);assert.equal(result.progress.done,16);
  const exhausted=await call(env,`/api/runs/${id}/advance`,'POST',{});assert.equal(exhausted.data.run.progress.done,16);
  await call(env,`/api/runs/${id}`,'PATCH',{caseId:'regress_exact',review:{winner:'a',note:'Keep exact casing'}});
  await call(env,`/api/runs/${id}`,'PATCH',{caseId:'regress_exact',review:{note:'Updated note'}});
  const saved=(await call(env,`/api/runs/${id}`)).data.run;assert.deepEqual(saved.reviews.regress_exact,{winner:'a',note:'Updated note'});
  const exported=await handleApi(request(`/api/runs/${id}/export?format=json`),env);const archive=await exported.json();assert.equal(archive.summary.b.rate,0.625);assert.equal(archive.reviews.regress_exact.winner,'a');assert.match(exported.headers.get('content-disposition'),/attachment/);
  const csv=await (await handleApi(request(`/api/runs/${id}/export?format=csv`),env)).text();assert.equal(csv.split('\r\n').length,9);assert.match(csv,/Keep exact|Updated note/);
  const list=(await call(env,'/api/runs')).data.runs;assert.equal(list[0].stub,true);assert.equal(list[0].results,undefined);assert.equal(list[0].summary.b.rate,0.625);
  await call(env,`/api/runs/${id}`,'PATCH',{archived:true});assert.equal((await call(env,'/api/runs')).data.runs.length,0);assert.equal((await call(env,`/api/runs/${id}`)).status,404);
  assert.equal((await call(env,'/api/runs?archived=1')).data.runs.length,1);
  await call(env,`/api/runs/${id}`,'PATCH',{archived:false});assert.equal((await call(env,'/api/runs')).data.runs.length,1);
 }finally{DB.close();}
});

test('model adapter sends server secret only upstream; errors and usage survive independent requests',async()=>{
 const DB=database(),env={DB,EVAL_API_KEY:'server-secret',EVAL_API_URL:'https://provider.example/chat'};
 const cases=[{id:'one',vars:{q:'Answer yes'},rules:[{type:'contains',value:'yes'}]}];
 const prompts={a:{name:'A',model:'model-a',text:'{{q}}'},b:{name:'B',model:'model-b',text:'{{q}}'}};
 const id=crypto.randomUUID();let calls=0;
 const fetchImpl=async(url,opts)=>{calls++;assert.equal(String(url),'https://provider.example/chat');assert.equal(opts.headers.Authorization,'Bearer server-secret');const body=JSON.parse(opts.body);assert.equal(body.max_completion_tokens,64);assert.equal(body.messages[0].content,'Answer yes');if(body.model==='model-b')return new Response('private provider details',{status:429});return Response.json({id:'real-response-id',choices:[{message:{content:'yes'},finish_reason:'stop'}],usage:{prompt_tokens:5,completion_tokens:1,total_tokens:6}});};
 try{
  assert.equal((await call(env,'/api/runs','POST',{id,provider:'model',cases,prompts,maxTokens:64})).status,201);
  await call(env,`/api/runs/${id}/advance`,'POST',{}, {fetchImpl});await call(env,`/api/runs/${id}/advance`,'POST',{}, {fetchImpl});await call(env,`/api/runs/${id}/advance`,'POST',{}, {fetchImpl});
  const r=(await call(env,`/api/runs/${id}`)).data.run;assert.equal(calls,2);assert.equal(r.results.one.a.responseId,'real-response-id');assert.equal(r.results.one.a.usage.total_tokens,6);assert.equal(r.results.one.b.error,'Provider HTTP 429');assert.equal(gate(r,0).state,'pending');assert.doesNotMatch(JSON.stringify(r),/server-secret|private provider details/);
 }finally{DB.close();}
});

test('hosted API rejects cross-origin writes, missing key, invalid JSON, unknown variables and unrecognized run IDs',async()=>{
 const DB=database(),env={DB};try{
  const cross=await handleApi(request('/api/runs','POST',{id:crypto.randomUUID(),provider:'synthetic'},'https://evil.example'),env);assert.equal(cross.status,403);
  assert.equal((await call(env,'/api/runs','POST',{id:crypto.randomUUID(),provider:'model'})).status,503);
  assert.equal((await call(env,'/api/runs/not-a-uuid')).status,404);
  const bad=await handleApi(new Request('https://eval.test/api/runs',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),env);assert.equal(bad.status,400);
  const cases=[{id:'x',vars:{q:'ok'},rules:[]}],prompts={a:{text:'{{missing}}',model:'x'},b:{text:'{{q}}',model:'x'}};
  assert.equal((await call({...env,EVAL_API_KEY:'x'},'/api/runs','POST',{id:crypto.randomUUID(),provider:'model',cases,prompts})).status,400);
 }finally{DB.close();}
});
