import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { request } from 'node:http';
import { startOfflineServer } from '../offline/server.mjs';
import { train } from '../public/model-lab/core.js';

test('teacher sessions survive restart and independent installations do not overwrite each other', async t => {
  const aDir = await mkdtemp(join(tmpdir(), 'visioneducation-teacher-a-'));
  const bDir = await mkdtemp(join(tmpdir(), 'visioneducation-teacher-b-'));
  let a = await startOfflineServer({ dataDir: aDir, port: 0, host: '127.0.0.1' });
  let b = await startOfflineServer({ dataDir: bDir, port: 0, host: '127.0.0.1' });
  t.after(async () => { await a.close(); await b.close(); await rm(aDir, { recursive: true, force: true }); await rm(bDir, { recursive: true, force: true }); });
  const signIn = async server => {
    const r = await fetch(server.teacherLaunchUrl, { redirect: 'manual' }); assert.equal(r.status, 302);
    const full = r.headers.get('set-cookie'); assert(full.includes('HttpOnly')); assert(full.includes('SameSite=Strict'));
    return full.split(';')[0];
  };
  const ac = await signIn(a), bc = await signIn(b), aName = ac.split('=')[0], bName = bc.split('=')[0];
  assert.notEqual(aName, bName); assert.match(aName, /^visioneducation_teacher_[a-f0-9]{16}$/);
  const jar = `${ac}; ${bc}; visioneducation_teacher=obsolete`;
  const session = async (server,cookie) => (await fetch(`http://127.0.0.1:${server.port}/api/classroom/session`, { headers: { Cookie: cookie } })).json();
  assert.equal((await session(a,jar)).isTeacher, true); assert.equal((await session(b,jar)).isTeacher, true);
  assert.equal((await session(a,bc)).isTeacher, false); assert.equal((await session(b,ac)).isTeacher, false);
  const base = `http://127.0.0.1:${b.port}`;
  const created = await fetch(base+'/api/classroom/classes', { method: 'POST', headers: { Cookie: jar, Origin: base, 'Content-Type':'application/json' }, body: JSON.stringify({name:'重启后仍可读取的课堂'}) }); assert.equal(created.status,201);
  const classroom = (await created.json()).classroom;
  await a.close(); await b.close();
  a = await startOfflineServer({ dataDir:aDir, port:0, host:'127.0.0.1' });
  b = await startOfflineServer({ dataDir:bDir, port:0, host:'127.0.0.1' });
  assert.equal((await session(a,jar)).isTeacher,true); assert.equal((await session(b,jar)).isTeacher,true);
  const classes = await fetch(`http://127.0.0.1:${b.port}/api/classroom/classes`,{headers:{Cookie:jar}});assert.equal(classes.status,200);assert.equal((await classes.json()).classes[0].id,classroom.id);
  assert.equal((await fetch(`http://127.0.0.1:${b.port}/.teacher-session.json`)).status,404);
  assert.equal((await fetch(`http://127.0.0.1:${b.port}/data/.teacher-session.json`)).status,404);
  const signedOut = await fetch(`http://127.0.0.1:${a.port}/signout-with-chatgpt`,{redirect:'manual',headers:{Cookie:jar}});assert(signedOut.headers.get('set-cookie').startsWith(aName+'=;'));
  assert.equal((await session(b,bc)).isTeacher,true);
  await new Promise((resolve,reject)=>{const req=request(`http://127.0.0.1:${a.port}/__local/teacher?key=${a.bootstrapToken}`,{headers:{Host:`localhost:${a.port}`}},res=>{assert.equal(res.statusCode,302);assert(res.headers.location.startsWith(`http://127.0.0.1:${a.port}/__local/teacher?key=`));assert.equal(res.headers['set-cookie'],undefined);res.resume();res.on('end',resolve);});req.on('error',reject);req.end();});
  await new Promise((resolve,reject)=>{const req=request(`http://127.0.0.1:${a.port}/api/classroom/session`,{headers:{Cookie:jar,Host:`${hostname()}:${a.port}`}},res=>{const chunks=[];res.on('data',x=>chunks.push(x));res.on('end',()=>{assert.equal(JSON.parse(Buffer.concat(chunks)).isTeacher,false);resolve();});});req.on('error',reject);req.end();});
});

test('offline HTTP service: automatic database, 44 independent students, models, backup, and restart', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'visioneducation-offline-test-'));
  let server = await startOfflineServer({ dataDir, port: 0, host: '127.0.0.1' });
  t.after(async () => { await server.close(); await rm(dataDir, { recursive: true, force: true }); });
  let base = `http://127.0.0.1:${server.port}`;
  async function raw(path, headers) {
    return new Promise((resolve, reject) => { const req = request(base + path, { headers }, res => { const chunks = []; res.on('data', x => chunks.push(x)); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) })); }); req.on('error', reject); req.end(); });
  }
  const auth = await fetch(server.teacherLaunchUrl, { redirect: 'manual' });
  assert.equal(auth.status, 302); const cookie = auth.headers.get('set-cookie').split(';')[0];
  async function call(path, { method = 'GET', data, token, teacher = false, headers = {} } = {}) {
    const r = await fetch(base + '/api/classroom/' + path, { method, headers: { ...(teacher ? { Cookie: cookie } : {}), ...(token ? { 'X-Classroom-Token': token } : {}), ...(data ? { 'Content-Type': 'application/json', Origin: base } : {}), ...headers }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: r.status, body: await r.json() };
  }
  assert.equal((await call('session')).body.isTeacher, false);
  assert.equal((await call('session', { teacher: true })).body.isTeacher, true);
  const signedOut = await fetch(base + '/signout-with-chatgpt', { redirect: 'manual', headers: { Cookie: cookie } });
  assert.equal(signedOut.status, 302); assert(signedOut.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal((await raw('/api/classroom/session', { Cookie: cookie, Host: `${hostname()}:${server.port}` })).body.isTeacher, false);
  const created = await call('classes', { method: 'POST', teacher: true, data: { name: '44人离线课堂测试' } }); assert.equal(created.status, 201); const classroom = created.body.classroom;
  const joined = await Promise.all(Array.from({ length: 44 }, (_, i) => call('join', { method: 'POST', data: { code: classroom.join_code, name: `测试学生${i + 1}`, number: String(i + 1) } })));
  assert(joined.every(x => x.status === 201)); assert.equal(new Set(joined.map(x => x.body.token)).size, 44);
  const submitted = await Promise.all(joined.map((x, i) => call('submit', { method: 'POST', token: x.body.token, data: { lesson: 1, answer: `第${i + 1}位学生已观察三种动作，并比较了手腕、肩、膝盖和脚踝之间的位置变化。`, evidence: { viewed: [0, 1, 2] } } })));
  assert(submitted.every(x => x.status === 200));
  const own = await Promise.all(joined.map(x => call('mine', { token: x.body.token })));
  assert(own.every((x, i) => x.body.submissions.length === 1 && x.body.submissions[0].id === submitted[i].body.submission.id));
  const inbox = await call('inbox?classId=' + classroom.id, { teacher: true }); assert.equal(inbox.body.stats.members, 44); assert.equal(inbox.body.stats.total, 44);
  const samples = JSON.parse(await readFile(new URL('../public/model-lab-assets/samples.json', import.meta.url)));
  const model = (await train(samples.samples, { epochs: 2, hidden: 0, perClass: 20 }, samples.backboneSha256)).model;
  const uploaded = await call('models', { method: 'POST', token: joined[0].body.token, data: model }); assert.equal(uploaded.status, 201);
  const file = await fetch(base + '/api/classroom/models/' + uploaded.body.entry.id, { headers: { 'X-Classroom-Token': joined[0].body.token } }); assert.equal(file.status, 200); assert.deepEqual((await file.json()).layers, model.layers);
  assert.equal((await call('models/' + uploaded.body.entry.id, { token: joined[1].body.token })).status, 404);
  assert.equal((await call('models/board', { token: joined[0].body.token })).body.rows.length, 1);
  const backup = await fetch(base + '/__local/backup', { method: 'POST', headers: { Cookie: cookie, Origin: base } }); assert.equal(backup.status, 200); assert((await stat(join((await backup.json()).folder, 'classroom.sqlite'))).size > 0);
  assert.equal((await fetch(base + '/__local/stop', { method: 'POST', headers: { Origin: base } })).status, 403);
  assert.equal((await fetch(base + '/__local/teacher?key=wrong')).status, 403);
  assert.equal((await raw('/classroom', { Host: 'untrusted.example.test' })).status, 421);
  assert.equal((await fetch(base + '/data/classroom.sqlite')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e%5clib/classroom-api.ts')).status, 404);
  const css = await (await fetch(base + '/style.css')).text(); assert(!css.includes('fonts.googleapis.com')); assert(!css.startsWith('500;'));
  assert((await (await fetch(base + '/classroom')).text()).includes('/offline-client.js'));
  assert((await (await fetch(base + '/pose-lab-worker.js')).text()).startsWith("importScripts('/offline-crypto.js')"));
  const video = await fetch(base + '/micro15-assets/keypoints-explainer.mp4', { headers: { Range: 'bytes=0-15' } }); assert.equal(video.status, 206); assert.equal((await video.arrayBuffer()).byteLength, 16);
  await server.close(); server = await startOfflineServer({ dataDir, port: 0, host: '127.0.0.1' }); base = `http://127.0.0.1:${server.port}`;
  assert.equal((await call('mine', { token: joined[0].body.token })).body.submissions.length, 1);
  assert.equal((await call('models/mine', { token: joined[0].body.token })).body.entries.length, 1);
});

test('private-LAN SHA-256 fallback preserves package integrity without secure-context WebCrypto', async () => {
  const source = await readFile(new URL('../offline/crypto.js', import.meta.url), 'utf8');
  const context = { self: { crypto: {} }, DOMException }; runInNewContext(source, context);
  for (const bytes of [Buffer.alloc(0), Buffer.from('abc'), Buffer.from('中文与 Python 课堂'), randomBytes(63), randomBytes(64), randomBytes(65), randomBytes(1000000)]) {
    const actual = Buffer.from(await context.self.crypto.subtle.digest('SHA-256', bytes)).toString('hex');
    assert.equal(actual, createHash('sha256').update(bytes).digest('hex'));
  }
  await assert.rejects(context.self.crypto.subtle.digest('SHA-512', new Uint8Array()), /Only SHA-256/);
  const native = { digest() {} }, preserved = { self: { crypto: { subtle: native } } }; runInNewContext(source, preserved); assert.equal(preserved.self.crypto.subtle, native);
});
