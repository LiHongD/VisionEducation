import { readFile, writeFile, mkdir, open, rm } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { APP_ID } from './identity.mjs';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = basename(projectDir) === 'app';
const bundleDir = bundle ? dirname(projectDir) : projectDir;
const dataDir = process.env.VISION_EDUCATION_DATA || join(bundleDir, bundle ? 'data' : '.offline-data');
const stateFile = join(dataDir, '.server-state.json');
const noOpen = process.argv.includes('--no-open') || process.env.VISION_EDUCATION_NO_OPEN === '1';

async function existing() {
  try {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    if (state.dataDir !== resolve(dataDir) || state.projectDir !== projectDir) return null;
    if (state.appId !== APP_ID || !Number.isInteger(state.port) || state.port < 1024 || state.port > 65535 || !/^[a-f0-9]{64}$/.test(state.bootstrapToken)) return null;
    const response = await fetch(`http://127.0.0.1:${state.port}/__local/health`, { signal: AbortSignal.timeout(1200) });
    const health = await response.json();
    return health.ready && health.appId === APP_ID && health.instance === state.instance ? state : null;
  } catch { return null; }
}
function openURL(url) {
  if (noOpen) return;
  const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, windowsHide: true, stdio: 'ignore' });
  child.on('error', error => console.error('无法自动打开浏览器：' + error.message)); child.unref();
}
async function start() {
  let state = await existing();
  if (state) { openURL(`http://127.0.0.1:${state.port}/__local/teacher?key=${state.bootstrapToken}`); console.log(JSON.stringify({ reused: true, port: state.port })); return; }
  const lockFile = join(dataDir, '.startup.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); await lock.writeFile(JSON.stringify({ pid: process.pid, created: Date.now() })); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let locked = true;
    try { const value = JSON.parse(await readFile(lockFile, 'utf8')); if (!Number.isInteger(value.pid) || value.pid < 1 || !Number.isFinite(value.created)) locked = false; else { try { process.kill(value.pid, 0); } catch (e) { if (e.code === 'ESRCH') locked = false; } if (Date.now() - value.created > 60000) locked = false; } } catch { locked = false; }
    if (!locked) { await rm(lockFile, { force: true }); return start(); }
    for (let i = 0; i < 100; i++) { await delay(200); state = await existing(); if (state) { openURL(`http://127.0.0.1:${state.port}/__local/teacher?key=${state.bootstrapToken}`); console.log(JSON.stringify({ reused: true, port: state.port })); return; } }
    throw new Error('启动尚未完成，请查看 data/logs/server.log 后重试。');
  }
  try {
    await mkdir(join(dataDir, 'logs'), { recursive: true });
    for (let port = 8787; port <= 8807; port++) {
      const log = await open(join(dataDir, 'logs/server.log'), 'a');
      const marker = `Starting local server on port ${port} at ${Date.now()}`;
      await log.write('\n' + marker + '\n');
      const child = spawn(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', join(projectDir, 'offline/server.mjs'), '--port', String(port), '--data-dir', dataDir, '--state-file', stateFile], {
        cwd: projectDir, detached: true, windowsHide: true, stdio: ['ignore', log.fd, log.fd],
      });
      let error, exited = false; child.on('error', e => { error = e; exited = true; }); child.on('exit', () => { exited = true; }); child.unref(); await log.close();
      for (let i = 0; i < 100 && !exited; i++) {
        await delay(150); state = await existing();
        if (state?.pid === child.pid) {
          openURL(`http://127.0.0.1:${state.port}/__local/teacher?key=${state.bootstrapToken}`);
          console.log(JSON.stringify({ started: true, port: state.port })); return;
        }
      }
      if (error) throw error;
      if (!exited) { child.kill(); throw new Error('启动超时，请查看 data/logs/server.log。'); }
      const tail = (await readFile(join(dataDir, 'logs/server.log'), 'utf8')).split(marker).pop();
      if (!tail.includes('EADDRINUSE')) throw new Error('本地服务未能启动，请查看 data/logs/server.log。');
    }
    throw new Error('本机 8787–8807 端口均无法使用，请联系机房管理员。');
  } finally { await lock.close(); await rm(lockFile, { force: true }); }
}
async function manage(action) {
  const state = await existing(); if (!state) { console.log('系统尚未启动。'); return; }
  const response = await fetch(`http://127.0.0.1:${state.port}/__local/${action}`, { method: 'POST', headers: { 'X-Launcher-Token': state.bootstrapToken }, signal: AbortSignal.timeout(60000) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || '操作失败');
  if (action === 'backup' && result.folder) {
    console.log('备份已保存：' + result.folder);
    if (!noOpen) { const child = spawn('explorer.exe', [result.folder], { windowsHide: true, detached: true, stdio: 'ignore' }); child.unref(); }
  } else console.log('系统已停止，学习数据已保留。');
}
try {
  await mkdir(dataDir, { recursive: true });
  const action = process.argv[2] || 'start';
  if (action === 'start') await start();
  else if (['stop', 'backup'].includes(action)) await manage(action);
  else throw new Error('Unknown launcher command');
} catch (error) {
  const text = new Date().toISOString() + ' ' + error.message + '\n';
  await writeFile(join(dataDir, '启动错误.txt'), text, { flag: 'a' }).catch(() => {});
  console.error(error.message); process.exitCode = 1;
}
