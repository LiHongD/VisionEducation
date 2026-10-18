import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { classroomApi } from '../lib/classroom-api.ts';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_tiresome_nova.sql',import.meta.url),'utf8'));
  const db={prepare(sql){let values=[];return{bind(...args){values=args;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},async run(){const r=sqlite.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
  const base={db,teacherEmails:'teacher@example.test,other@example.test',allowGuests:true,user:null};
  const teacher={...base,user:{userId:'teacher-1',email:'teacher@example.test',displayName:'教师'}};
  async function call(path,{method='GET',data,token,ctx=base,origin='https://classroom.test'}={}){const request=new Request('https://classroom.test/api/classroom/'+path,{method,headers:{'Content-Type':'application/json',...(method!=='GET'?{Origin:origin}:{}),...(token?{'X-Classroom-Token':token}:{})},...(data?{body:JSON.stringify(data)}:{})});const response=await classroomApi(request,ctx);return{status:response.status,body:await response.json(),headers:response.headers}}
  return{sqlite,base,teacher,call};
}
test('guest submission → teacher review → selected showcase → resubmission, with authorization isolation',async()=>{
  const {sqlite,base,teacher,call}=fixture();
  assert.equal((await call('classes')).status,401);
  assert.equal((await call('classes',{method:'POST',data:{name:'伪造教师',role:'teacher'}})).status,401);
  const created=await call('classes',{method:'POST',ctx:teacher,data:{name:'七年级 · 实践课堂'}});
  assert.equal(created.status,201);const c=created.body.classroom;assert.match(c.join_code,/^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal((await call('join',{method:'POST',data:{code:'ZZZZZZZZ',name:'学生'}})).status,404);
  const joined=await call('join',{method:'POST',data:{code:c.join_code,name:'第三小组',number:'03'}});
  assert.equal(joined.status,201);const token=joined.body.token;
  const other=await call('join',{method:'POST',data:{code:c.join_code,name:'第三小组',number:'04'}});
  assert.notEqual(other.body.token,token);
  const answer='我们发现提膝时一只脚踝明显升高，弓步冲拳时两脚支撑，手腕向前伸出。';
  const first=await call('submit',{method:'POST',token,data:{lesson:1,answer,evidence:{viewed:[0,1,2]}}});
  assert.equal(first.status,200);assert.equal(first.body.submission.revision,1);const id=first.body.submission.id;
  const own=await call('mine',{token});assert.equal(own.body.submissions.length,1);assert.equal(own.headers.get('Cache-Control'),'no-store');
  assert.equal((await call('mine',{token:other.body.token})).body.submissions.length,0);
  assert.equal((await call('submissions/'+id,{token})).status,401);
  assert.equal((await call('inbox?classId='+c.id,{ctx:{...base,user:{userId:'teacher-2',email:'other@example.test',displayName:'其他教师'}}})).status,404);
  const inbox=await call('inbox?classId='+c.id,{ctx:teacher});assert.equal(inbox.body.stats.total,1);assert.equal(inbox.body.stats.members,2);
  const review=await call('submissions/'+id,{method:'PATCH',ctx:teacher,data:{revision:1,feedback:'观察到了上下肢区别，很好。',reviewed:true,featured:true}});assert.equal(review.status,200);
  assert.equal((await call('mine',{token})).body.submissions[0].feedback,'观察到了上下肢区别，很好。');
  assert.equal((await call('showcase?classId='+c.id,{ctx:teacher})).body.submissions.length,1);
  assert.equal((await call('showcase?classId='+c.id,{token})).status,401);
  const second=await call('submit',{method:'POST',token,data:{lesson:1,answer:answer+'我们还比较了膝盖。',evidence:{viewed:[0,1,2]}}});assert.equal(second.body.submission.revision,2);
  assert.equal((await call('showcase?classId='+c.id,{ctx:teacher})).body.submissions.length,0);
  assert.equal((await call('submissions/'+id,{method:'PATCH',ctx:teacher,data:{revision:1,feedback:'旧版点评',reviewed:true}})).status,409);
  assert.equal((await call('mine',{token})).body.submissions[0].feedback,'');
  await call('classes/'+c.id,{method:'PATCH',ctx:teacher,data:{isOpen:false}});
  assert.equal((await call('submit',{method:'POST',token,data:{lesson:1,answer,evidence:{viewed:[0,1,2]}}})).status,409);
  assert.equal((await call('join',{method:'POST',data:{code:c.join_code,name:'新同学'}})).status,409);
  assert.equal((await call('mine',{token})).status,200);
  sqlite.close();
});
test('validates origin, lesson evidence and request size; guest identities cannot become teachers',async()=>{
  const {sqlite,teacher,call}=fixture();
  assert.equal((await call('classes',{method:'POST',ctx:teacher,data:{name:'课堂'},origin:'https://evil.test'})).status,403);
  const c=(await call('classes',{method:'POST',ctx:teacher,data:{name:'测试课堂'}})).body.classroom;
  const token=(await call('join',{method:'POST',data:{code:c.join_code,name:'同学'}})).body.token;
  const answer='这是一段超过二十字的实践记录，用来检查服务端对提交内容的校验。';
  assert.equal((await call('submit',{method:'POST',token,data:{lesson:1,answer,evidence:{viewed:[0]}}})).status,400);
  assert.equal((await call('submit',{method:'POST',token,data:{lesson:2,answer,evidence:{joints:[1,2,3,4,5,6],snapshots:[]}}})).status,400);
  assert.equal((await call('submit',{method:'POST',token,data:{lesson:4,answer,evidence:{runs:[{threshold:.5},{threshold:.5}]}}})).status,400);
  assert.equal((await call('submit',{method:'POST',token,data:{lesson:7,answer,evidence:{}}})).status,400);
  assert.equal((await call('submit',{method:'POST',token,data:{lesson:1,answer:'a'.repeat(100000),evidence:{viewed:[0,1,2]}}})).status,413);
  assert.equal((await call('session',{token})).body.isTeacher,false);
  sqlite.close();
});

test('lesson 2 accepts complete microcourse evidence, rejects missing operations, and preserves the original 17-point path',async()=>{
 const {sqlite,teacher,call}=fixture();
 const c=(await call('classes',{method:'POST',ctx:teacher,data:{name:'高中微课'}})).body.classroom;
 const token=(await call('join',{method:'POST',data:{code:c.join_code,name:'微课测试组'}})).body.token;
 const answer='我用同侧肩肘腕的位置和肘角判断直臂举手，并用髋部的连续变化判断坐下站起。';
 const points=[[.594,.312],[.624,.426],[.647,.542],[.555,.536],[.563,.714],[.57,.892]].map(([x,y])=>({x,y}));
 const rules=['r1','r2'].flatMap(mode=>[0,1,2,3].map(sample=>({mode,sample,prediction:'forged'})));
 const micro={version:1,points,rules,directions:['forward','reverse'],sequence:true,quiz:[0,1,2]};
 const submit=evidence=>call('submit',{method:'POST',token,data:{lesson:2,answer,evidence}});
 assert.equal((await submit({micro15:{...micro,points:points.slice(1)}})).status,400);
 assert.equal((await submit({micro15:{...micro,points:points.map(p=>({...p,x:0}))}})).status,400);
 assert.equal((await submit({micro15:{...micro,rules:rules.slice(1)}})).status,400);
 assert.equal((await submit({micro15:{...micro,quiz:[2,1,0]}})).status,400);
 const r=await submit({micro15:micro});assert.equal(r.status,200);
 const received=(await call('submissions/'+r.body.submission.id,{ctx:teacher})).body.submission.evidence.micro15;
 assert.equal(received.rules.length,8);assert.equal(received.rules[2].prediction,true);assert.equal(received.rules[6].prediction,false);assert.equal(received.rules[3].prediction,null);
 assert.equal((await submit({joints:[5,7,9,11,13,15],snapshots:[{keypoints:Array.from({length:17},(_,id)=>({id,x:.5,y:.5}))}]})).status,200);
 sqlite.close();
});
