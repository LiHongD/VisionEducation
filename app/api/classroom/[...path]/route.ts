import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import { classroomApi } from '../../../../lib/classroom-api';
export const dynamic = 'force-dynamic';
async function handle(request: Request) {
  const user=await getChatGPTUser();
  if(!env.DB)return Response.json({error:'课堂数据服务尚未配置，请联系教师。'},{status:503});
  return classroomApi(request,{db:env.DB,bucket:env.BUCKET,user,teacherEmails:env.TEACHER_EMAILS||'',allowGuests:env.ALLOW_GUEST_STUDENTS==='true'});
}
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
