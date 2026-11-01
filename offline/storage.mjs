import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, readFile, writeFile, rename, rm, cp } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function openStorage(dataDir, projectDir) {
  await mkdir(dataDir, { recursive: true });
  const sqlite = new DatabaseSync(join(dataDir, 'classroom.sqlite'));
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS offline_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const name of ['0000_tiresome_nova.sql', '0001_black_killraven.sql', '0002_angle_rules.sql']) {
    if (sqlite.prepare('SELECT name FROM offline_migrations WHERE name=?').get(name)) continue;
    const sql = await readFile(join(projectDir, 'drizzle', name), 'utf8');
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO offline_migrations VALUES (?,?)').run(name, new Date().toISOString());
      sqlite.exec('COMMIT');
    } catch (error) { sqlite.exec('ROLLBACK'); sqlite.close(); throw error; }
  }
  const db = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async run() { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; },
      };
    },
    async batch(items) {
      sqlite.exec('BEGIN IMMEDIATE');
      try { const result = []; for (const item of items) result.push(await item.run()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const modelDir = join(dataDir, 'models');
  await mkdir(modelDir, { recursive: true });
  function objectPath(key) {
    if (!/^[a-zA-Z0-9/_-]+\.json$/.test(key)) throw new Error('Invalid model storage key');
    const target = resolve(modelDir, key), rel = relative(modelDir, target);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Invalid model storage path');
    return target;
  }
  const bucket = {
    async put(key, value) {
      const target = objectPath(key), temporary = target + '.' + randomUUID() + '.tmp';
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(temporary, value, { flag: 'wx' });
      await rename(temporary, target);
    },
    async get(key) {
      try { const value = await readFile(objectPath(key), 'utf8'); return { async text() { return value; } }; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async delete(key) { await rm(objectPath(key), { force: true }); },
  };
  return {
    db, bucket,
    async backup() {
      const destination = join(dataDir, 'backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 6));
      await mkdir(destination, { recursive: true });
      await backup(sqlite, join(destination, 'classroom.sqlite'));
      await cp(modelDir, join(destination, 'models'), { recursive: true });
      await writeFile(join(destination, '说明.txt'), '此文件夹包含课堂数据库和已提交的模型。停止系统后，可将 classroom.sqlite 和 models 复制回 data 文件夹进行恢复。\n', 'utf8');
      return destination;
    },
    close() { sqlite.close(); },
  };
}
