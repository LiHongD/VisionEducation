// All authorization happens here. Role switches in the UI do not grant access.
type Identity = { userId: string; email: string; displayName: string } | null;
type DB = { prepare(sql: string): any; batch(statements: any[]): Promise<any[]> };
type Context = { db: DB; user: Identity; teacherEmails: string; allowGuests: boolean };
class ApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status=status; } }
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const json = (value: unknown, status=200) => Response.json(value, {status, headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const str = (value: unknown, max: number, min=0) => { if(typeof value!=='string'||value.trim().length<min||value.trim().length>max) fail(400,`文字长度须为 ${min}–${max} 字。`); return (value as string).trim(); };
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x=>x.toString(16).padStart(2,'0')).join('');
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), x=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x%32]).join('');
const hash = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), x=>x.toString(16).padStart(2,'0')).join('');
async function body(req: Request) {
  if(!req.headers.get('content-type')?.includes('application/json')) fail(415,'请提交 JSON 数据。');
  const reader=req.body?.getReader(); if(!reader) fail(400,'缺少提交内容。');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader!.read();if(done)break;size+=value.length;if(size>96*1024){await reader!.cancel();fail(413,'提交内容过大，请保留最近的实践记录。')}chunks.push(value)}
  const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length}
  try{const parsed=JSON.parse(new TextDecoder().decode(data));if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')fail(400,'提交格式不正确。');return parsed}catch{fail(400,'提交格式不正确。')}
}
function isTeacher(ctx:Context){return !!ctx.user && ctx.teacherEmails.split(',').map(x=>x.trim().toLowerCase()).includes(ctx.user.email.toLowerCase());}
function teacher(ctx:Context){if(!ctx.user)fail(401,'请先登录教师账号。');if(!isTeacher(ctx))fail(403,'此账号没有教师权限。');return ctx.user!;}
async function owned(ctx:Context,id:string){const u=teacher(ctx);const c=await ctx.db.prepare('SELECT * FROM classrooms WHERE id = ? AND owner_id = ?').bind(id,u.userId).first();if(!c)fail(404,'未找到你管理的课堂。');return c;}
async function member(ctx:Context,req:Request){const t=req.headers.get('X-Classroom-Token');if(!t||!/^[a-f0-9]{64}$/.test(t))fail(401,'请先凭课堂码加入课堂。');const m=await ctx.db.prepare('SELECT m.*, c.name AS class_name, c.is_open FROM members m JOIN classrooms c ON c.id=m.class_id WHERE m.token_hash = ?').bind(await hash(t!)).first();if(!m)fail(401,'课堂身份已失效，请重新加入。');return m;}
function evidence(input:any,lesson:number){
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'缺少实践记录。');
  const result:any={};
  const arr=(key:string,max:number)=>{const v=input[key];if(!Array.isArray(v)||v.length>max)fail(400,'实践记录格式或数量不正确。');result[key]=v;return v;};
  if(lesson===1){const a=arr('viewed',3);if(![0,1,2].every(i=>a.includes(i)))fail(400,'请先观察全部三种招式。');}
  if(lesson===2){const j=arr('joints',17),s=arr('snapshots',3);if(new Set(j.filter((n:number)=>Number.isInteger(n)&&n>=0&&n<17)).size<6||!s.length)fail(400,'请查看六个关节并保存快照。');for(const snap of s){if(!Array.isArray(snap.keypoints)||snap.keypoints.length!==17)fail(400,'快照需要17个关键点。');for(const p of snap.keypoints)if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1)fail(400,'关键点坐标应在0–1之间。');}}
  if(lesson===3){if(arr('labels',4).length!==4)fail(400,'请完成四个样本标注。');arr('annotations',3);}
  if(lesson===4){const r=arr('runs',10);if(new Set(r.map((x:any)=>x.threshold)).size<2||r.some((x:any)=>!Number.isFinite(x.threshold)||x.threshold<.1||x.threshold>.9))fail(400,'请完成两组不同阈值的验证。');}
  if(lesson===5){result.sequenceOK=input.sequenceOK;const d=arr('directions',2);if(input.sequenceOK!==true||!['forward','reverse'].every(v=>d.includes(v)))fail(400,'请完成排序并观察正放、倒放。');}
  if(lesson===6){result.test=input.test;const q=arr('quiz',3);if(!input.test||!Number.isFinite(input.test.threshold)||![1,0,2].every((v,i)=>q[i]===v))fail(400,'请完成独立测试与迁移问题。');}
  const encoded=JSON.stringify(result);if(encoded.length>65000)fail(413,'实践记录过大。');return encoded;
}
export async function classroomApi(req:Request,ctx:Context):Promise<Response>{
  try{
    const url=new URL(req.url),path=url.pathname.replace(/^\/api\/classroom\/?/,'').replace(/\/$/,''),method=req.method;
    if(!['GET','POST','PATCH'].includes(method))fail(405,'不支持此操作。');
    if(method!=='GET'){
      const origin=req.headers.get('origin');
      if(!origin||origin!==url.origin)fail(403,'请从本站提交。');
    }
    if(path==='session'&&method==='GET')return json({user:ctx.user?{displayName:ctx.user.displayName}:null,isTeacher:isTeacher(ctx),allowGuests:ctx.allowGuests});
    if(path==='classes'&&method==='GET'){
      const u=teacher(ctx);const rows=await ctx.db.prepare('SELECT c.*, (SELECT COUNT(*) FROM members m WHERE m.class_id=c.id) AS member_count, (SELECT COUNT(*) FROM submissions s WHERE s.class_id=c.id) AS submission_count FROM classrooms c WHERE owner_id = ? ORDER BY created_at DESC LIMIT 50').bind(u.userId).all();return json({classes:rows.results});
    }
    if(path==='classes'&&method==='POST'){
      const u=teacher(ctx),b=await body(req),name=str(b.name,60,2),id=uuid(),joinCode=code();
      const count=await ctx.db.prepare('SELECT COUNT(*) AS n FROM classrooms WHERE owner_id=?').bind(u.userId).first();if(count.n>=50)fail(409,'当前最多管理50个课堂。');
      await ctx.db.prepare('INSERT INTO classrooms(id,owner_id,name,join_code,is_open,created_at) VALUES(?,?,?,?,1,?)').bind(id,u.userId,name,joinCode,now()).run();return json({classroom:{id,name,join_code:joinCode,is_open:1}},201);
    }
    const classMatch=path.match(/^classes\/([\w-]+)$/);
    if(classMatch&&method==='PATCH'){
      const c=await owned(ctx,classMatch[1]),b=await body(req);
      if(typeof b.isOpen!=='boolean')fail(400,'请设置课堂是否开放。');
      await ctx.db.prepare('UPDATE classrooms SET is_open=? WHERE id=?').bind(b.isOpen?1:0,c.id).run();return json({ok:true});
    }
    if(path==='join'&&method==='POST'){
      if(!ctx.allowGuests&&!ctx.user)fail(401,'请先登录。');
      const b=await body(req),joinCode=str(b.code,8,8).toUpperCase(),name=str(b.name,32,1),number=str(b.number??'',24);
      const c=await ctx.db.prepare('SELECT id,name,is_open FROM classrooms WHERE join_code=?').bind(joinCode).first();if(!c)fail(404,'课堂码不正确，请向老师确认。');if(!c.is_open)fail(409,'该课堂已停止接收，请联系教师。');
      const token=randomToken(),id=uuid();
      const insert=await ctx.db.prepare('INSERT INTO members(id,class_id,display_name,student_number,token_hash,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM members WHERE class_id=?) < 200').bind(id,c.id,name,number,await hash(token),now(),c.id).run();
      if(insert.meta?.changes===0)fail(409,'课堂已达200人，请联系教师创建新课堂。');
      return json({token,member:{id,display_name:name,student_number:number},classroom:{id:c.id,name:c.name,is_open:c.is_open}},201);
    }
    if(path==='mine'&&method==='GET'){
      const m=await member(ctx,req),rows=await ctx.db.prepare('SELECT id,lesson,answer,revision,reviewed_revision,feedback,featured,submitted_at FROM submissions WHERE member_id=? ORDER BY lesson').bind(m.id).all();
      return json({member:{id:m.id,display_name:m.display_name,student_number:m.student_number},classroom:{id:m.class_id,name:m.class_name,is_open:m.is_open},submissions:rows.results});
    }
    if(path==='submit'&&method==='POST'){
      const m=await member(ctx,req);if(!m.is_open)fail(409,'教师已结束收件，暂时无法提交。');
      const b=await body(req),lesson=Number(b.lesson);if(!Number.isInteger(lesson)||lesson<1||lesson>6)fail(400,'无效课时。');
      const answer=str(b.answer,5000,20),proof=evidence(b.evidence,lesson);
      await ctx.db.prepare('INSERT INTO submissions(id,class_id,member_id,lesson,answer,evidence,submitted_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(member_id,lesson) DO UPDATE SET answer=excluded.answer,evidence=excluded.evidence,submitted_at=excluded.submitted_at,revision=submissions.revision+1,reviewed_revision=0,feedback=\'\',featured=0').bind(uuid(),m.class_id,m.id,lesson,answer,proof,now()).run();
      const result=await ctx.db.prepare('SELECT id,lesson,revision,submitted_at FROM submissions WHERE member_id=? AND lesson=?').bind(m.id,lesson).first();return json({submission:result});
    }
    if(path==='inbox'&&method==='GET'){
      const c=await owned(ctx,url.searchParams.get('classId')||'');const lesson=Number(url.searchParams.get('lesson')||0),filter=url.searchParams.get('filter')||'all',search=(url.searchParams.get('search')||'').slice(0,60),offset=Math.max(0,Math.min(10000,Number(url.searchParams.get('offset'))||0));
      const clauses=['s.class_id=?'],args:any[]=[c.id];
      if(lesson>=1&&lesson<=6){clauses.push('s.lesson=?');args.push(lesson)}
      if(filter==='pending')clauses.push('s.reviewed_revision<s.revision');
      if(filter==='featured')clauses.push('s.featured=1');
      if(search){clauses.push('(instr(m.display_name,?)>0 OR instr(m.student_number,?)>0)');args.push(search,search)}
      const where=clauses.join(' AND '),rows=await ctx.db.prepare(`SELECT s.id,s.member_id,s.lesson,s.revision,s.reviewed_revision,s.featured,s.submitted_at,substr(s.answer,1,120) AS preview,m.display_name,m.student_number FROM submissions s JOIN members m ON m.id=s.member_id WHERE ${where} ORDER BY s.submitted_at DESC,s.id LIMIT 60 OFFSET ?`).bind(...args,offset).all();
      const total=await ctx.db.prepare(`SELECT COUNT(*) AS n FROM submissions s JOIN members m ON m.id=s.member_id WHERE ${where}`).bind(...args).first();
      const stats=await ctx.db.prepare('SELECT COUNT(*) AS total,COUNT(DISTINCT member_id) AS submitted_members,COALESCE(SUM(CASE WHEN reviewed_revision<revision THEN 1 ELSE 0 END),0) AS pending,COALESCE(SUM(featured),0) AS featured FROM submissions WHERE class_id=?').bind(c.id).first();
      const roster=await ctx.db.prepare('SELECT COUNT(*) AS n FROM members WHERE class_id=?').bind(c.id).first();
      return json({classroom:{id:c.id,name:c.name,join_code:c.join_code,is_open:c.is_open},submissions:rows.results,total:total.n,offset,stats:{...stats,members:roster.n}});
    }
    const subMatch=path.match(/^submissions\/([\w-]+)$/);
    if(subMatch){
      teacher(ctx);const s=await ctx.db.prepare('SELECT s.*,m.display_name,m.student_number FROM submissions s JOIN members m ON m.id=s.member_id JOIN classrooms c ON c.id=s.class_id WHERE s.id=? AND c.owner_id=?').bind(subMatch[1],ctx.user!.userId).first();if(!s)fail(404,'答卷不存在或无访问权限。');
      if(method==='GET')return json({submission:{...s,evidence:JSON.parse(s.evidence)}});
      if(method==='PATCH'){
        const b=await body(req);if(Number(b.revision)!==s.revision)fail(409,'学生已更新答案，请重新打开后再点评。');
        if(b.featured!==undefined&&typeof b.featured!=='boolean')fail(400,'展示状态不正确。');
        const featured=b.featured===undefined?s.featured:(b.featured?1:0),feedback=b.feedback===undefined?s.feedback:str(b.feedback,2000),reviewed=b.reviewed===true?s.revision:s.reviewed_revision;
        const r=await ctx.db.prepare('UPDATE submissions SET featured=?,feedback=?,reviewed_revision=? WHERE id=? AND revision=?').bind(featured,feedback,reviewed,s.id,s.revision).run();if(r.meta?.changes===0)fail(409,'答案刚刚更新，请刷新后重试。');return json({ok:true});
      }
    }
    if(path==='showcase'&&method==='GET'){
      const c=await owned(ctx,url.searchParams.get('classId')||''),lesson=Number(url.searchParams.get('lesson')||0);
      const rows=await ctx.db.prepare('SELECT s.id,s.lesson,s.answer,s.evidence,s.feedback,s.revision,m.display_name FROM submissions s JOIN members m ON m.id=s.member_id WHERE s.class_id=? AND s.featured=1 AND (?=0 OR s.lesson=?) ORDER BY s.lesson,s.submitted_at LIMIT 100').bind(c.id,lesson,lesson).all();
      return json({classroom:{name:c.name},submissions:rows.results.map((s:any)=>({...s,evidence:JSON.parse(s.evidence)}))});
    }
    return fail(404,'接口不存在。');
  }catch(error){if(error instanceof ApiError)return json({error:error.message},error.status);console.error('Classroom API error',error instanceof Error?error.message:'unknown');return json({error:'服务暂时不可用，请稍后重试。你的本地草稿仍然保留。'},503)}
}
