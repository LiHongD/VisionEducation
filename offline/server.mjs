import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat, realpath } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces, hostname } from 'node:os';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { classroomApi } from '../lib/classroom-api.ts';
import { openStorage } from './storage.mjs';
import { APP_ID } from './identity.mjs';

export { APP_ID };
const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
const loopbackHost = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary', '.zip': 'application/zip', '.whl': 'application/zip', '.py': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const csp = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; frame-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";
function sameSecret(a, b) { const x = Buffer.from(a || ''), y = Buffer.from(b || ''); return x.length === y.length && timingSafeEqual(x, y); }
function localAddresses() { return Object.values(networkInterfaces()).flat().filter(x => x && !x.internal && x.family === 'IPv4' && !x.address.startsWith('198.18.')).map(x => x.address); }

async function teacherSession(dataDir) {
  // Cookies are shared across ports. Scope the name to this installation's data directory.
  const scope = process.platform === 'win32' ? dataDir.toLowerCase() : dataDir;
  const cookieName = 'visioneducation_teacher_' + createHash('sha256').update(scope).digest('hex').slice(0, 16);
  const path = join(dataDir, '.teacher-session.json');
  let value;
  try { value = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error('教师会话文件无法读取，请检查 data/.teacher-session.json。课堂数据库未改动。');
    value = { version: 1, secret: randomBytes(32).toString('hex') };
    try { await writeFile(path, JSON.stringify(value), { flag: 'wx', mode: 0o600 }); }
    catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; value = JSON.parse(await readFile(path, 'utf8')); }
  }
  if (value?.version !== 1 || typeof value.secret !== 'string' || !/^[a-f0-9]{64}$/.test(value.secret)) throw new Error('教师会话文件格式不正确，请通过备份检查 data/.teacher-session.json。');
  return { cookieName, teacherCookie: value.secret };
}

export async function startOfflineServer(options = {}) {
  const dataDir = resolve(options.dataDir || join(projectDir, '.offline-data'));
  const storage = await openStorage(dataDir, options.projectDir || projectDir);
  const publicDir = await realpath(join(options.projectDir || projectDir, 'public'));
  const bootstrapToken = randomBytes(32).toString('hex');
  const { cookieName, teacherCookie } = await teacherSession(dataDir);
  const instance = randomBytes(16).toString('hex');
  const teacher = { userId: 'visioneducation-local-teacher', email: 'teacher@visioneducation.local', displayName: '本机教师' };
  let port, closing = false, backupTask = null;
  const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  function isTeacher(req, url) {
    const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return loopback(req.socket.remoteAddress) && loopbackHost(url.hostname) && sameSecret(cookie, teacherCookie);
  }
  function isLauncher(req, url) { return loopback(req.socket.remoteAddress) && loopbackHost(url.hostname) && sameSecret(req.headers['x-launcher-token'], bootstrapToken); }
  const info = () => ({ appId: APP_ID, instance, port, studentUrls: localAddresses().map(ip => `http://${ip}:${port}/classroom#classroom`), teacherUrl: `http://127.0.0.1:${port}/classroom#teacher` });
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', hostname().toLowerCase(), ...localAddresses()]);
      if (!allowedHosts.has(url.hostname.toLowerCase())) { json(res, { error: '访问地址未获允许，请使用启动页显示的地址。' }, 421); return; }
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', csp);
      if (url.pathname === '/__local/health' && req.method === 'GET') { json(res, { appId: APP_ID, instance, ready: !closing }); return; }
      if (url.pathname === '/__local/teacher' && req.method === 'GET') {
        if (!loopback(req.socket.remoteAddress) || !loopbackHost(url.hostname) || !sameSecret(url.searchParams.get('key'), bootstrapToken)) { json(res, { error: '请在教师电脑上双击“启动系统”，打开教师端。' }, 403); return; }
        if (url.hostname !== '127.0.0.1') { res.writeHead(302, { Location: `http://127.0.0.1:${port}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' }); res.end(); return; }
        res.writeHead(302, { 'Set-Cookie': `${cookieName}=${teacherCookie}; HttpOnly; SameSite=Strict; Path=/`, Location: '/classroom#teacher', 'Cache-Control': 'no-store' }); res.end(); return;
      }
      if (url.pathname === '/__local/info' && req.method === 'GET') { json(res, { ...info(), isTeacher: isTeacher(req, url), ...(isTeacher(req, url) ? { dataDir } : {}) }); return; }
      if (url.pathname === '/__local/control' && req.method === 'GET') {
        if (!isTeacher(req, url)) { json(res, { error: '系统管理只在教师电脑通过启动器开放。' }, 403); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(await readFile(join(projectDir, 'offline/control.html'))); return;
      }
      if (['/__local/backup', '/__local/stop'].includes(url.pathname) && req.method === 'POST') {
        const originOK = req.headers.origin === url.origin;
        if (!(originOK && isTeacher(req, url)) && !isLauncher(req, url)) { json(res, { error: '仅教师电脑可执行此操作。' }, 403); return; }
        if (url.pathname.endsWith('/backup')) {
          backupTask ||= storage.backup().finally(() => { backupTask = null; });
          json(res, { ok: true, folder: await backupTask }); return;
        }
        json(res, { ok: true }); setImmediate(() => close()); return;
      }
      if (url.pathname.startsWith('/__local/')) { json(res, { error: '接口不存在。' }, 404); return; }
      if (url.pathname === '/signout-with-chatgpt') {
        res.writeHead(302, { 'Set-Cookie': `${cookieName}=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/`, Location: '/classroom#classroom', 'Cache-Control': 'no-store' }); res.end(); return;
      }
      if (url.pathname.startsWith('/signin-with-chatgpt')) { json(res, { error: '离线版无需 ChatGPT 登录。请在教师电脑双击“启动系统”。' }, 403); return; }
      if (url.pathname.startsWith('/api/classroom/')) {
        if (closing) { json(res, { error: '系统正在停止，请稍后重新启动。' }, 503); return; }
        const headers = new Headers(); for (const [key, value] of Object.entries(req.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
        const request = new Request(url, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
        const response = await classroomApi(request, { db: storage.db, bucket: storage.bucket, user: isTeacher(req, url) ? teacher : null, teacherEmails: teacher.email, allowGuests: true });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        if (response.body) await pipeline(Readable.fromWeb(response.body), res); else res.end(); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { json(res, { error: '不支持此操作。' }, 405); return; }
      let path = decodeURIComponent(url.pathname);
      if (['/', '/classroom', '/classroom/'].includes(path)) path = '/classroom.html';
      if (path.endsWith('/')) path += 'index.html';
      const parts = path.split('/');
      if (parts.some(x => x.startsWith('.') || x.includes('\\') || x.includes('\0'))) { json(res, { error: '文件不存在。' }, 404); return; }
      const offlineAsset = { '/offline-client.js': 'client.js', '/offline-crypto.js': 'crypto.js' }[path];
      let target = offlineAsset ? join(projectDir, 'offline', offlineAsset) : resolve(publicDir, '.' + path);
      if (!offlineAsset) {
        const rel = relative(publicDir, target); if (rel.startsWith('..') || isAbsolute(rel)) { json(res, { error: '文件不存在。' }, 404); return; }
      }
      try { target = await realpath(target); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') { json(res, { error: '文件不存在。' }, 404); return; } throw error; }
      if (!offlineAsset && (relative(publicDir, target).startsWith('..') || isAbsolute(relative(publicDir, target)))) { json(res, { error: '文件不存在。' }, 404); return; }
      const metadata = await stat(target); if (!metadata.isFile()) { json(res, { error: '文件不存在。' }, 404); return; }
      const etag = `W/"${metadata.size}-${Math.floor(metadata.mtimeMs)}-offline1"`;
      res.setHeader('Content-Type', mime[extname(target)] || 'application/octet-stream');
      res.setHeader('ETag', etag); res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      if (req.headers['if-none-match'] === etag) { res.writeHead(304); res.end(); return; }
      if (['/classroom.html', '/style.css', '/pose-lab-worker.js'].includes(path)) {
        let text = await readFile(target, 'utf8');
        if (path === '/style.css') text = text.replace(/@import\s+url\(['"]https:\/\/fonts\.googleapis\.com[^'"]+['"]\)\s*;/g, '');
        else if (path === '/pose-lab-worker.js') text = "importScripts('/offline-crypto.js');\n" + text;
        else text = text.replace('</body>', '<script src="/offline-client.js"></script></body>');
        res.setHeader('Content-Length', Buffer.byteLength(text)); res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : text); return;
      }
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        let start = 0, end = metadata.size - 1;
        if (match && (match[1] || match[2])) {
          if (!match[1]) start = Math.max(0, metadata.size - Number(match[2]));
          else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
        }
        if (!match || (!match[1] && !match[2]) || start > end || start >= metadata.size) { res.writeHead(416, { 'Content-Range': `bytes */${metadata.size}` }); res.end(); return; }
        res.writeHead(206, { 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${metadata.size}`, 'Accept-Ranges': 'bytes' });
        if (req.method === 'HEAD') res.end(); else await pipeline(createReadStream(target, { start, end }), res); return;
      }
      res.writeHead(200, { 'Content-Length': metadata.size, 'Accept-Ranges': 'bytes' });
      if (req.method === 'HEAD') res.end(); else await pipeline(createReadStream(target), res);
    } catch (error) {
      if (['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET', 'ABORT_ERR'].includes(error.code)) return;
      console.error('Local request failed:', error.message);
      if (!res.headersSent) json(res, { error: '本地服务暂时无法完成请求，请查看教师电脑 data/logs 中的日志。' }, 500); else res.destroy();
    }
  });
  server.headersTimeout = 15000; server.requestTimeout = 120000; server.keepAliveTimeout = 10000;
  async function close() {
    if (closing) return; closing = true;
    if (backupTask) await backupTask;
    await new Promise(resolveClose => { server.close(resolveClose); server.closeIdleConnections(); const timer = setTimeout(() => server.closeAllConnections(), 3000); timer.unref(); });
    storage.close();
  }
  try { await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(options.port ?? 8787, options.host || '0.0.0.0', resolveListen); }); }
  catch (error) { storage.close(); throw error; }
  port = server.address().port;
  return { ...info(), bootstrapToken, dataDir, teacherLaunchUrl: `http://127.0.0.1:${port}/__local/teacher?key=${bootstrapToken}`, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => args[args.indexOf(name) + 1];
  const started = await startOfflineServer({ port: args.includes('--port') ? Number(value('--port')) : 8787, dataDir: args.includes('--data-dir') ? value('--data-dir') : undefined });
  if (args.includes('--state-file')) await writeFile(value('--state-file'), JSON.stringify({ appId: APP_ID, pid: process.pid, port: started.port, instance: started.instance, bootstrapToken: started.bootstrapToken, dataDir: started.dataDir, projectDir }));
  console.log(`VisionEducation local server ready on port ${started.port}`);
  process.once('SIGTERM', () => started.close()); process.once('SIGINT', () => started.close());
}
