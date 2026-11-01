import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startOfflineServer} from '../offline/server.mjs';
import {classroomApi} from '../lib/classroom-api.ts';
import {evaluateRules,normalizeKeypoints,validateSubmission} from '../lib/rule-evaluator.ts';
import benchmark from '../lib/stance-benchmark.json' with {type:'json'};
const A=globalThis.AngleRules,defaults=()=>({rules:A.defaultRules(),mapping:{horse:'horse',bow:'bow'}});
function sample(id,label,left,right,low=[]){
  const k=Array.from({length:17},()=>[0,0,.99]);
  for(const [hip,knee,ankle,x,degrees] of [[11,13,15,2,left],[12,14,16,6,right]]){const r=degrees*Math.PI/180;k[hip]=[x,2,.99];k[knee]=[x,3,.99];k[ankle]=[x+Math.sin(r),3-Math.cos(r),.99];}
  for(const i of low)k[i][2]=.1;
  return{id,label,width:10,height:8,keypoints:k,sourceId:'test',sourcePage:'https://example.test'};
}
test('angle assessment is isotropic, conservative with unknowns, and scores all outcomes',()=>{
  const set={id:'test',digest:'fixed',keypointThreshold:.5,samples:[sample('h','horse',100,120),sample('b','bow',90,175),sample('n','horse',180,180),sample('u','bow',90,175,[13])]};
  const m=evaluateRules(defaults(),set);
  assert.equal(m.correct,2);assert.equal(m.total,4);assert.equal(m.accuracy,.5);assert.equal(m.coverage,.5);
  assert.deepEqual(m.confusion,[[1,0,0,1,0],[0,1,0,0,1]]);assert.equal(m.macroF1,2/3);
  assert(Math.abs(m.samples[0].leftKnee-100)<1e-8);
  const original=normalizeKeypoints(set.samples[0],.5),resized={...set.samples[0],width:300,height:240,keypoints:set.samples[0].keypoints.map(([x,y,c])=>[x*30+2,y*30+3,c])};
  const transformed=normalizeKeypoints(resized,.5);assert(Math.abs(A.measure(original,[11,13,15]).angle-A.measure(transformed,[11,13,15]).angle)<1e-8);
  const conflict=defaults();for(const a of conflict.rules.actions)a.groups=[{id:'g',conditions:[{id:'c',label:'膝角',points:[11,13,15],op:'gte',value:0}]}];
  const cm=evaluateRules(conflict,set);assert.equal(cm.counts.conflict,3);assert.equal(cm.accuracy,0);assert.equal(cm.coverage,0);
  const partial=defaults();partial.rules.actions[0].groups=[{id:'g',conditions:[{id:'c',label:'左膝',points:[11,13,15],op:'gte',value:0}]}];partial.rules.actions[1].groups=[{id:'g',conditions:[{id:'c',label:'右膝',points:[12,14,16],op:'gte',value:0}]}];
  assert.equal(evaluateRules(partial,{...set,samples:[sample('u','horse',100,100,[14])]}).counts.insufficient,1);
  assert.throws(()=>validateSubmission({rules:A.defaultRules(),mapping:{horse:'horse',bow:'horse'}}));
  const empty=defaults();empty.rules.actions[0].groups=[];assert.throws(()=>validateSubmission(empty));
});
test('frozen benchmark has unique reviewed real-photo provenance and a verifiable digest',()=>{
  const {digest,...value}=benchmark;
  const canonical=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(canonical):Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  assert.equal(createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'),digest);
  assert(benchmark.samples.filter(s=>s.label==='horse').length>=6);assert(benchmark.samples.filter(s=>s.label==='bow').length>=6);
  assert.equal(new Set(benchmark.samples.map(s=>s.imageSha256)).size,benchmark.samples.length);
  for(const s of benchmark.samples){assert.equal(s.keypoints.length,17);assert.match(s.sourcePage,/^https:\/\//);assert.equal(s.imageSha256.length,64);for(const p of s.keypoints){assert.equal(p.length,3);assert(p.every(Number.isFinite));assert(p[2]>=0&&p[2]<=1);}}
});
function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const db={prepare(sql){let values=[];return{bind(...v){values=v;return this;},async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){return{results:sqlite.prepare(sql).all(...values)};},async run(){return{meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}};}};}};
  const base={db,user:null,teacherEmails:'teacher@example.test,other@example.test',allowGuests:true},teacher={...base,user:{userId:'t1',email:'teacher@example.test',displayName:'教师'}},other={...base,user:{userId:'t2',email:'other@example.test',displayName:'另一教师'}};
  async function call(path,{method='GET',data,token,ctx=base,origin='https://classroom.test'}={}){const r=await classroomApi(new Request('https://classroom.test/api/classroom/'+path,{method,headers:{'Content-Type':'application/json',...(method!=='GET'?{Origin:origin}:{}),...(token?{'X-Classroom-Token':token}:{})},...(data?{body:JSON.stringify(data)}:{})}),ctx);return{status:r.status,body:await r.json()};}
  return{sqlite,call,teacher,other};
}
test('44 students submit rules: server scores, immutable history, owner isolation and closed classrooms',async t=>{
  const {sqlite,call,teacher,other}=fixture();t.after(()=>sqlite.close());
  const c=(await call('classes',{method:'POST',ctx:teacher,data:{name:'规则检验班'}})).body.classroom;
  const students=await Promise.all(Array.from({length:44},(_,i)=>call('join',{method:'POST',data:{code:c.join_code,name:'规则同学'+i}})));
  const first=await Promise.all(students.map(s=>call('rules',{method:'POST',token:s.body.token,data:{...defaults(),metrics:{accuracy:1},benchmark:{samples:[]}}})));
  assert(first.every(r=>r.status===201));const expected=evaluateRules(defaults(),benchmark);
  for(const r of first){assert.equal(r.body.entry.metrics.accuracy,expected.accuracy);assert.equal(r.body.entry.metrics.benchmarkDigest,benchmark.digest);}
  assert.deepEqual(first[0].body.entry.rules,A.defaultRules());
  const id=first[0].body.entry.id,token=students[0].body.token,otherToken=students[1].body.token;
  assert.equal((await call('rules/'+id,{token:otherToken})).status,404);
  assert.equal((await call('rules/'+id+'?teacher=1',{token})).status,401);
  assert.equal((await call('rules/'+id+'?teacher=1',{ctx:other})).status,404);
  const detail=await call('rules/'+id+'?teacher=1',{ctx:teacher});assert.equal(detail.status,200);assert.deepEqual(detail.body.entry.rules,A.defaultRules());assert.equal(detail.body.entry.metrics.samples.length,benchmark.samples.length);
  const reflection='我们用两侧膝角区分马步与弓步，并从斜视误判中发现二维角度规则的局限。';
  assert.equal((await call('submit',{method:'POST',token,data:{lesson:4,answer:reflection,evidence:{ruleEntryId:first[1].body.entry.id}}})).status,400);
  assert.equal((await call('submit',{method:'POST',token,data:{lesson:4,answer:reflection,evidence:{ruleAssessment:{id,accuracy:1}}}})).status,400);
  const note=await call('submit',{method:'POST',token,data:{lesson:4,answer:reflection,evidence:{ruleEntryId:id}}});assert.equal(note.status,200);
  const proof=(await call('submissions/'+note.body.submission.id,{ctx:teacher})).body.submission.evidence;assert.equal(proof.ruleAssessment.id,id);assert.equal(proof.ruleAssessment.correct,expected.correct);assert(!('runs' in proof));
  assert.equal((await call('rules/inbox?classId='+c.id,{ctx:teacher})).body.entries.length,44);
  assert.equal((await call('rules/inbox?classId='+c.id,{token})).status,401);
  assert.equal((await call('rules/mine',{token})).body.entries.length,1);
  const changed=defaults();for(const a of changed.rules.actions)a.groups=[{id:'g',conditions:[{id:'c',label:'总满足',points:[11,13,15],op:'gte',value:0}]}];
  assert.equal((await call('rules',{method:'POST',token,data:changed})).status,201);assert.equal((await call('rules/mine',{token})).body.entries.length,2);
  assert.equal((await call('rules/'+id,{token})).body.entry.metrics.accuracy,expected.accuracy);
  const invalid=defaults();invalid.rules.actions[0].groups[0].conditions[0].value='155';assert.equal((await call('rules',{method:'POST',token,data:invalid})).status,400);
  assert.equal((await call('rules',{method:'POST',token,data:defaults(),origin:'https://evil.test'})).status,403);
  assert.equal((await call('rules',{method:'POST',token,data:{...defaults(),extra:'a'.repeat(100000)}})).status,413);
  await call('classes/'+c.id,{method:'PATCH',ctx:teacher,data:{isOpen:false}});assert.equal((await call('rules',{method:'POST',token,data:defaults()})).status,409);
  assert.equal((await call('rules/mine',{token})).status,200);
});

test('offline upgrade preserves old classroom; 44 real HTTP rule submissions survive restart',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'visioneducation-rules-upgrade-'));
  const old=new DatabaseSync(join(dir,'classroom.sqlite'));
  old.exec('CREATE TABLE offline_migrations(name TEXT PRIMARY KEY,applied_at TEXT NOT NULL)');
  for(const name of ['0000_tiresome_nova.sql','0001_black_killraven.sql']){old.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));old.prepare('INSERT INTO offline_migrations VALUES(?,?)').run(name,new Date().toISOString());}
  old.prepare('INSERT INTO classrooms(id,owner_id,name,join_code,is_open,created_at) VALUES(?,?,?,?,1,?)').run('old-class','visioneducation-local-teacher','升级前的课堂','HTTPTEST',new Date().toISOString());old.close();
  let server=await startOfflineServer({dataDir:dir,port:0,host:'127.0.0.1'});
  t.after(async()=>{await server.close();await rm(dir,{recursive:true,force:true});});
  let base=`http://127.0.0.1:${server.port}`;
  const cookie=(await fetch(server.teacherLaunchUrl,{redirect:'manual'})).headers.get('set-cookie').split(';')[0];
  const classes=await(await fetch(base+'/api/classroom/classes',{headers:{Cookie:cookie}})).json();assert.equal(classes.classes[0].name,'升级前的课堂');
  async function post(path,data,token){const r=await fetch(base+'/api/classroom/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...(token?{'X-Classroom-Token':token}:{})},body:JSON.stringify(data)});return{status:r.status,body:await r.json()};}
  const members=await Promise.all(Array.from({length:44},(_,i)=>post('join',{code:'HTTPTEST',name:'HTTP规则同学'+i})));
  const sent=await Promise.all(members.map(m=>post('rules',defaults(),m.body.token)));assert(sent.every(s=>s.status===201));
  const inbox=await(await fetch(base+'/api/classroom/rules/inbox?classId=old-class',{headers:{Cookie:cookie}})).json();assert.equal(inbox.entries.length,44);
  const studentBoard=await(await fetch(base+'/api/classroom/rules/board',{headers:{'X-Classroom-Token':members[0].body.token}})).json();assert.equal(studentBoard.submittedGroups,44);assert.equal(studentBoard.rows.filter(r=>r.isMine).length,1);assert(studentBoard.rows.every(r=>r.rank===1));
  await server.close();server=await startOfflineServer({dataDir:dir,port:0,host:'127.0.0.1'});base=`http://127.0.0.1:${server.port}`;
  const mine=await(await fetch(base+'/api/classroom/rules/mine',{headers:{'X-Classroom-Token':members[0].body.token}})).json();assert.equal(mine.entries[0].id,sent[0].body.entry.id);assert.equal(mine.entries[0].metrics.benchmarkDigest,benchmark.digest);
});

test('live classroom board uses each group best score, competition ties, latest score and classroom isolation',async t=>{
  const {sqlite,call,teacher,other}=fixture();t.after(()=>sqlite.close());
  assert.equal((await call('rules/board')).status,401);
  const c=(await call('classes',{method:'POST',ctx:teacher,data:{name:'实时排名班'}})).body.classroom;
  const people=[];for(const name of ['第一小组','第二小组','第三小组','等待提交组'])people.push((await call('join',{method:'POST',data:{code:c.join_code,name,number:'不应暴露学号'}})).body);
  const low=defaults();for(const action of low.rules.actions)action.groups=[{id:'g',conditions:[{id:'c',label:'宽泛条件',points:[11,13,15],op:'gte',value:0}]}];
  for(const i of [0,1])await call('rules',{method:'POST',token:people[i].token,data:defaults()});
  await call('rules',{method:'POST',token:people[2].token,data:low});
  await call('rules',{method:'POST',token:people[0].token,data:low});
  const b=(await call('rules/board',{token:people[0].token})).body;
  assert.equal(b.totalGroups,4);assert.equal(b.submittedGroups,3);assert.equal(b.refreshSeconds,5);assert.deepEqual(b.rows.map(r=>r.rank),[1,1,3,null]);
  const mine=b.rows.find(r=>r.isMine);assert.equal(mine.displayName,'第一小组');assert.equal(mine.best.correct,9);assert.equal(mine.latest.correct,0);assert.equal(mine.attempts,2);
  assert.equal(b.rows.filter(r=>r.isMine).length,1);assert(!JSON.stringify(b).includes('不应暴露学号'));
  for(const row of b.rows){assert(!('member_id' in row));assert(!('rules' in row));assert(!('token' in row));assert(!('student_number' in row));assert(!('id' in row));}
  const notSubmitted=(await call('rules/board',{token:people[3].token})).body.rows.find(r=>r.isMine);assert.equal(notSubmitted.rank,null);assert.equal(notSubmitted.latest,null);
  assert.equal((await call('rules/board?classId='+c.id,{token:people[0].token})).status,401);
  assert.equal((await call('rules/board?classId='+c.id,{ctx:other})).status,404);
  assert.equal((await call('rules/board?classId='+c.id,{ctx:teacher})).body.rows.length,4);
  const foreign=(await call('classes',{method:'POST',ctx:other,data:{name:'另一班'}})).body.classroom;
  const foreignToken=(await call('join',{method:'POST',data:{code:foreign.join_code,name:'另班小组'}})).body.token;
  assert.equal((await call('rules/board',{token:foreignToken})).body.rows.length,1);
  // Another group's improvement appears on the next poll without a new submission by this viewer.
  await call('rules',{method:'POST',token:people[2].token,data:defaults()});
  const updated=(await call('rules/board',{token:people[0].token})).body;assert.deepEqual(updated.rows.map(r=>r.rank),[1,1,1,null]);
  // Historical benchmark variants cannot be mixed into the current leaderboard.
  sqlite.prepare("UPDATE rule_entries SET benchmark_digest='previous-version' WHERE member_id=?").run(people[1].member.id);
  const isolated=(await call('rules/board',{token:people[0].token})).body;assert.equal(isolated.submittedGroups,2);assert.equal(isolated.rows.find(r=>r.displayName==='第二小组').rank,null);
  await call('classes/'+c.id,{method:'PATCH',ctx:teacher,data:{isOpen:false}});assert.equal((await call('rules/board',{token:people[0].token})).status,200);
});
