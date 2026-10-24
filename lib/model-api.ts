import {validateModel,evaluate} from '../public/model-lab/core.js';
import benchmark from './classifier-benchmark.json' with {type:'json'};

const BENCHMARK='combat3-test-v1',MAX_ATTEMPTS=10;
type ModelContext={db:any;bucket?:any;user:any;teacherEmails:string;allowGuests:boolean};
type Auth={member:(ctx:any,request:Request)=>Promise<any>;owned:(ctx:any,id:string)=>Promise<any>;teacher:(ctx:any)=>any;fail:(status:number,message:string)=>never};
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function readModel(req:Request,auth:Auth){
  if(!req.headers.get('content-type')?.includes('application/json'))auth.fail(415,'模型必须为本站导出的 JSON 格式。');
  const reader=req.body?.getReader();if(!reader)auth.fail(400,'缺少模型文件。');
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader!.read();if(done)break;size+=value.length;if(size>768*1024){await reader!.cancel();auth.fail(413,'模型文件超过 768 KB。请使用本实验支持的小型分类器。')}chunks.push(value)}
  const bytes=new Uint8Array(size);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length}
  try{return validateModel(JSON.parse(new TextDecoder().decode(bytes)),benchmark.backboneSha256)}catch(error){auth.fail(400,error instanceof Error?error.message:'模型格式不正确。')}
}
async function checksum(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('')}
function metrics(row:any){return {...row,metrics:JSON.parse(row.metrics),hyperparameters:JSON.parse(row.hyperparameters)}}
async function board(ctx:ModelContext,classId:string,mineId:string|null){
  const rows=await ctx.db.prepare('SELECT e.id,e.member_id,e.model_name,e.correct,e.total,e.accuracy,e.metrics,e.hyperparameters,e.created_at,m.display_name FROM model_entries e JOIN members m ON m.id=e.member_id WHERE e.class_id=? AND e.benchmark_id=? ORDER BY e.correct DESC,e.created_at ASC,e.id ASC LIMIT 2000').bind(classId,BENCHMARK).all();
  const counts=new Map<string,number>();for(const r of rows.results)counts.set(r.member_id,(counts.get(r.member_id)||0)+1);
  const seen=new Set<string>();let rank=0,previous=-1;
  const best=rows.results.filter((r:any)=>{if(seen.has(r.member_id))return false;seen.add(r.member_id);return true}).map((r:any)=>{if(r.correct!==previous){rank++;previous=r.correct}const value=metrics(r);delete value.member_id;return{...value,rank,attempts:counts.get(r.member_id),isMine:r.member_id===mineId}});
  return{benchmarkId:BENCHMARK,datasetId:benchmark.datasetId,totalTestImages:benchmark.samples.length,classes:benchmark.classes,maxAttempts:MAX_ATTEMPTS,ranking:'每位同学取最佳测试准确率，同准确率并列排名。',rows:best};
}
export async function modelApi(req:Request,ctx:ModelContext,auth:Auth){
  const url=new URL(req.url),path=url.pathname.replace(/^\/api\/classroom\//,'').replace(/\/$/,''),method=req.method;
  if(path==='models/board'&&method==='GET'){
    const classId=url.searchParams.get('classId');
    if(classId){await auth.owned(ctx,classId);return json(await board(ctx,classId,null))}
    const m=await auth.member(ctx,req);return json(await board(ctx,m.class_id,m.id));
  }
  if(path==='models/mine'&&method==='GET'){
    const m=await auth.member(ctx,req),rows=await ctx.db.prepare('SELECT id,model_name,correct,total,accuracy,metrics,hyperparameters,created_at FROM model_entries WHERE member_id=? AND benchmark_id=? ORDER BY created_at DESC,id DESC LIMIT 10').bind(m.id,BENCHMARK).all();
    return json({benchmarkId:BENCHMARK,maxAttempts:MAX_ATTEMPTS,remaining:Math.max(0,MAX_ATTEMPTS-rows.results.length),entries:rows.results.map(metrics)});
  }
  if(path==='models/inbox'&&method==='GET'){
    const c=await auth.owned(ctx,url.searchParams.get('classId')||'');
    const rows=await ctx.db.prepare('SELECT e.id,e.model_name,e.member_id,e.correct,e.total,e.accuracy,e.metrics,e.hyperparameters,e.created_at,m.display_name FROM model_entries e JOIN members m ON m.id=e.member_id WHERE e.class_id=? AND e.benchmark_id=? ORDER BY e.created_at DESC,e.id DESC LIMIT 2000').bind(c.id,BENCHMARK).all();
    return json({benchmarkId:BENCHMARK,entries:rows.results.map(metrics)});
  }
  if(path==='models'&&method==='POST'){
    const m=await auth.member(ctx,req);if(!m.is_open)auth.fail(409,'教师已结束收件，暂不能上传模型。');
    if(!ctx.bucket)auth.fail(503,'模型文件存储尚未配置，请联系教师。');
    const model=await readModel(req,auth);let name='我的动作分类器';try{if(req.headers.get('X-Model-Name'))name=decodeURIComponent(req.headers.get('X-Model-Name')!).trim()}catch{auth.fail(400,'模型名称编码不正确。')}if(!name||name.length>60)auth.fail(400,'模型名称应为 1–60 字。');
    const digest=await checksum(JSON.stringify({hidden:model!.hidden,scaler:model!.scaler,layers:model!.layers,backbone:model!.backboneSha256}));
    const duplicate=await ctx.db.prepare('SELECT id FROM model_entries WHERE member_id=? AND benchmark_id=? AND model_digest=?').bind(m.id,BENCHMARK,digest).first();if(duplicate)auth.fail(409,'这个模型已经评测过，请调整参数并重新训练后提交。');
    const count=await ctx.db.prepare('SELECT COUNT(*) AS n FROM model_entries WHERE member_id=? AND benchmark_id=?').bind(m.id,BENCHMARK).first();if(count.n>=MAX_ATTEMPTS)auth.fail(409,'本次课堂的 10 次正式评测已用完，请用验证集比较实验。');
    const score=evaluate(model!,benchmark.samples),id=crypto.randomUUID(),key=`class-models/${m.class_id}/${m.id}/${id}.json`,createdAt=new Date().toISOString();
    await ctx.bucket.put(key,JSON.stringify(model),{httpMetadata:{contentType:'application/json'}});
    let result;
    try{result=await ctx.db.prepare('INSERT OR IGNORE INTO model_entries(id,class_id,member_id,benchmark_id,model_name,model_key,model_digest,correct,total,accuracy,metrics,hyperparameters,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM model_entries WHERE member_id=? AND benchmark_id=?) < ?').bind(id,m.class_id,m.id,BENCHMARK,name,key,digest,score.correct,score.total,score.accuracy,JSON.stringify(score),JSON.stringify(model!.training),createdAt,m.id,BENCHMARK,MAX_ATTEMPTS).run()}catch(error){await ctx.bucket.delete(key);throw error}
    if(!result.meta?.changes){await ctx.bucket.delete(key);auth.fail(409,'模型已提交或评测次数已满，请刷新记录。')}
    return json({entry:{id,model_name:name,metrics:score,hyperparameters:model!.training,created_at:createdAt},board:await board(ctx,m.class_id,m.id)},201);
  }
  const match=path.match(/^models\/([\w-]+)(\/retest)?$/);
  if(match){
    const entry=await ctx.db.prepare('SELECT e.*,c.owner_id FROM model_entries e JOIN classrooms c ON c.id=e.class_id WHERE e.id=?').bind(match[1]).first();
    if(!entry)auth.fail(404,'模型不存在或不可访问。');
    const wantsTeacher=url.searchParams.get('teacher')==='1'||!!match[2];
    if(wantsTeacher){await auth.owned(ctx,entry.class_id)}else{const m=await auth.member(ctx,req);if(m.id!==entry.member_id)auth.fail(404,'模型不存在或不可访问。')}
    if(!ctx.bucket)auth.fail(503,'模型文件存储不可用。');
    const object=await ctx.bucket.get(entry.model_key);if(!object)auth.fail(404,'模型文件未找到，请联系教师。');
    if(method==='GET'&&!match[2])return new Response(await object.text(),{headers:{'Content-Type':'application/json','Content-Disposition':`attachment; filename="action-model-${entry.id}.json"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    if(method==='POST'&&match[2]){
      let model;try{model=validateModel(JSON.parse(await object.text()),benchmark.backboneSha256)}catch{auth.fail(400,'存储的模型不兼容当前评测版本。')}
      const score=evaluate(model,benchmark.samples);await ctx.db.prepare('UPDATE model_entries SET correct=?,total=?,accuracy=?,metrics=? WHERE id=?').bind(score.correct,score.total,score.accuracy,JSON.stringify(score),entry.id).run();
      return json({metrics:score});
    }
  }
  auth.fail(404,'模型接口不存在。');
}
