import {evaluateRules,validateSubmission,RULE_CLASSES} from './rule-evaluator.ts';
import benchmark from './stance-benchmark.json' with {type:'json'};
type Auth={member:(ctx:any,req:Request)=>Promise<any>;owned:(ctx:any,id:string)=>Promise<any>;fail:(status:number,message:string)=>never};
const json=(value:any,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const MAX=50;
async function read(req:Request,auth:Auth){
  if(!req.headers.get('content-type')?.includes('application/json'))auth.fail(415,'请提交规则 JSON。');
  const reader=req.body?.getReader();if(!reader)auth.fail(400,'缺少规则。');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const r=await reader!.read();if(r.done)break;size+=r.value.length;if(size>96*1024){await reader!.cancel();auth.fail(413,'规则超过 96 KB，请减少无关动作或条件。');}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  try{return validateSubmission(JSON.parse(new TextDecoder().decode(bytes)));}catch(e){auth.fail(400,e instanceof Error?e.message:'规则格式不正确。');}
}
function entry(row:any,detail=false){const value={...row,metrics:JSON.parse(row.metrics)};if(detail){value.rules=JSON.parse(row.rules);value.mapping=JSON.parse(row.mapping);}else{delete value.rules;delete value.mapping;delete value.metrics.samples;}return value;}
function summary(){return {id:benchmark.id,digest:benchmark.digest,total:benchmark.samples.length,classes:RULE_CLASSES,keypointThreshold:benchmark.keypointThreshold,sources:benchmark.sources,description:'统一验证集；冲突、未匹配和信息不足均计入总数且不算正确。每次提交保留独立快照。'};}
async function board(ctx:any,classId:string,mineId:string|null){
  const [roster,entries]=await Promise.all([
    ctx.db.prepare('SELECT id,display_name FROM members WHERE class_id=? ORDER BY created_at,id').bind(classId).all(),
    ctx.db.prepare("SELECT member_id,correct,total,accuracy,json_extract(metrics,'$.coverage') AS coverage,json_extract(metrics,'$.macroF1') AS macroF1,created_at,id FROM rule_entries WHERE class_id=? AND benchmark_id=? AND benchmark_digest=? ORDER BY correct DESC,created_at ASC,id ASC").bind(classId,benchmark.id,benchmark.digest).all()
  ]);
  const grouped=new Map<string,any>();
  for(const e of entries.results){
    const previous=grouped.get(e.member_id);
    if(!previous)grouped.set(e.member_id,{best:e,latest:e,attempts:1});
    else{previous.attempts++;if(e.created_at>previous.latest.created_at||(e.created_at===previous.latest.created_at&&e.id>previous.latest.id))previous.latest=e;}
  }
  const score=(e:any)=>e?{correct:e.correct,total:e.total,accuracy:e.accuracy,coverage:e.coverage,macroF1:e.macroF1,submittedAt:e.created_at}:null;
  const rows=roster.results.map((m:any)=>{const e=grouped.get(m.id);return{displayName:m.display_name,isMine:m.id===mineId,attempts:e?.attempts||0,best:score(e?.best),latest:score(e?.latest),rank:null as number|null};});
  // Stable ordering inside a tie is presentation only; it cannot change the rank.
  rows.sort((a:any,b:any)=>a.best&&b.best?b.best.correct-a.best.correct||a.best.submittedAt.localeCompare(b.best.submittedAt):a.best?-1:b.best?1:0);
  let previous=-1,rank=0,submitted=0;
  for(const r of rows){if(!r.best)continue;submitted++;if(r.best.correct!==previous){rank=submitted;previous=r.best.correct;}r.rank=rank;}
  return{benchmarkId:benchmark.id,benchmarkDigest:benchmark.digest,totalSamples:benchmark.samples.length,updatedAt:new Date().toISOString(),refreshSeconds:5,ranking:'按每组在当前验证集上的最高正确率排名，同分并列（1、1、3）；最新一次成绩单独展示，重新提交不会抹掉最高成绩。',totalGroups:rows.length,submittedGroups:submitted,rows};
}
export async function ruleApi(req:Request,ctx:any,auth:Auth){
  const url=new URL(req.url),path=url.pathname.replace(/^\/api\/classroom\//,'').replace(/\/$/,''),method=req.method;
  if(path==='rules/benchmark'&&method==='GET')return json({benchmark:summary()});
  if(path==='rules/board'&&method==='GET'){
    const classId=url.searchParams.get('classId');
    if(classId){await auth.owned(ctx,classId);return json(await board(ctx,classId,null));}
    const m=await auth.member(ctx,req);return json(await board(ctx,m.class_id,m.id));
  }
  if(path==='rules/mine'&&method==='GET'){
    const m=await auth.member(ctx,req),rows=await ctx.db.prepare('SELECT * FROM rule_entries WHERE member_id=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(m.id).all();
    return json({benchmark:summary(),maxAttempts:MAX,entries:rows.results.map((r:any)=>entry(r))});
  }
  if(path==='rules/inbox'&&method==='GET'){
    const c=await auth.owned(ctx,url.searchParams.get('classId')||'');
    const rows=await ctx.db.prepare('SELECT e.*,m.display_name,m.student_number FROM rule_entries e JOIN members m ON m.id=e.member_id WHERE e.class_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 10000').bind(c.id).all();
    return json({benchmark:summary(),entries:rows.results.map((r:any)=>entry(r))});
  }
  if(path==='rules'&&method==='POST'){
    const m=await auth.member(ctx,req);if(!m.is_open)auth.fail(409,'教师已结束收件，暂不能提交规则。');
    const clean=await read(req,auth),score=evaluateRules(clean,benchmark),id=crypto.randomUUID(),created=new Date().toISOString();
    // The browser cannot choose the dataset, submit scores, or replace an old snapshot.
    const inserted=await ctx.db.prepare('INSERT INTO rule_entries(id,class_id,member_id,benchmark_id,benchmark_digest,rules,mapping,metrics,correct,total,accuracy,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM rule_entries WHERE member_id=?) < ?').bind(id,m.class_id,m.id,benchmark.id,benchmark.digest,JSON.stringify(clean!.rules),JSON.stringify(clean!.mapping),JSON.stringify(score),score.correct,score.total,score.accuracy,created,m.id,MAX).run();
    if(!inserted.meta?.changes)auth.fail(409,'本课堂已保存 50 次规则提交，请先查看已有记录。');
    return json({entry:{id,created_at:created,rules:clean!.rules,mapping:clean!.mapping,metrics:score},benchmark:summary()},201);
  }
  const match=path.match(/^rules\/([\w-]+)$/);
  if(match&&method==='GET'){
    const row=await ctx.db.prepare('SELECT e.*,m.display_name,m.student_number FROM rule_entries e JOIN members m ON m.id=e.member_id WHERE e.id=?').bind(match[1]).first();
    if(!row)auth.fail(404,'规则不存在或无权访问。');
    if(url.searchParams.get('teacher')==='1')await auth.owned(ctx,row.class_id);else{const m=await auth.member(ctx,req);if(m.id!==row.member_id)auth.fail(404,'规则不存在或无权访问。');}
    return json({entry:entry(row,true),benchmark:summary()});
  }
  auth.fail(404,'规则接口不存在。');
}
