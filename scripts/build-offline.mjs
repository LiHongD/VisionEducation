import { readFile, writeFile, mkdir, cp, readdir, stat, mkdtemp } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { once } from 'node:events';
import './build-angle-studio.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '../output');
await mkdir(output, { recursive: true });
const bundle = await mkdtemp(join(output, 'VisionEducation-离线免安装-Windows-x64-'));
const app = join(bundle, 'app');
const runtime = process.argv.includes('--node') ? resolve(process.argv[process.argv.indexOf('--node') + 1]) : process.execPath;
const runtimeBytes = await readFile(runtime);
const runtimeHash = createHash('sha256').update(runtimeBytes).digest('hex');
const shasums = await readFile(join(root, 'offline/node-SHASUMS256.txt'), 'utf8');
const expected = shasums.split(/\r?\n/).find(x => /\s+win-x64\/node\.exe$/.test(x))?.split(/\s+/)[0];
if (!expected || runtimeHash !== expected) throw new Error('Node.js runtime does not match the official v24.14.1 win-x64 checksum. Pass the verified binary with --node.');
await mkdir(join(bundle, 'runtime'), { recursive: true });
await writeFile(join(bundle, 'runtime/node.exe'), runtimeBytes);
await cp(join(root, 'offline/node-LICENSE.txt'), join(bundle, 'runtime/LICENSE.txt'));
await mkdir(app, { recursive: true });
await cp(join(root, 'public'), join(app, 'public'), { recursive: true });
await cp(join(root, 'offline'), join(app, 'offline'), { recursive: true });
for (const dir of ['lib', 'drizzle']) await mkdir(join(app, dir), { recursive: true });
for (const name of ['classroom-api.ts', 'model-api.ts', 'classifier-benchmark.json','rule-api.ts','rule-evaluator.ts','stance-benchmark.json']) await cp(join(root, 'lib', name), join(app, 'lib', name));
for (const name of ['0000_tiresome_nova.sql', '0001_black_killraven.sql','0002_angle_rules.sql']) await cp(join(root, 'drizzle', name), join(app, 'drizzle', name));
await writeFile(join(app, 'package.json'), JSON.stringify({ name: 'visioneducation-offline', private: true, type: 'module', version: '1.0.0' }, null, 2));
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'CLASSROOM-GUIDE.md']) await cp(join(root, name), join(bundle, name));
await cp(join(root, 'docs/OFFLINE_PORTABLE.md'), join(bundle, '使用说明.md'));
await mkdir(join(bundle,'docs/stance-benchmark'),{recursive:true});
await cp(join(root,'docs/ANGLE_RULE_ASSESSMENT_DESIGN.md'),join(bundle,'docs/角度规则评测设计.md'));
for(const name of ['README.md','sources.json','rejected-candidates.json','baseline-report.json'])await cp(join(root,'data/stance-benchmark',name),join(bundle,'docs/stance-benchmark',name));
await mkdir(join(bundle, 'data'), { recursive: true });
await writeFile(join(bundle, 'data/请保留此文件夹.txt'), '此文件夹用于自动保存本地课堂、学生答卷、点评、模型与备份。请勿删除。\r\n', 'utf8');
for (const [name, action] of [['启动系统', 'start'], ['停止系统', 'stop'], ['备份数据', 'backup']]) {
  const cmd = `@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" --disable-warning=ExperimentalWarning "%~dp0app\\offline\\launcher.mjs" ${action}\r\nif errorlevel 1 (\r\n echo 操作未完成，请查看 data 文件夹中的启动错误.txt。\r\n pause\r\n)\r\n`;
  await writeFile(join(bundle, name + '.cmd'), cmd, 'utf8');
}
const vbs = 'Option Explicit\r\nDim fso, sh, root, command, rc\r\nSet fso = CreateObject("Scripting.FileSystemObject")\r\nSet sh = CreateObject("WScript.Shell")\r\nroot = fso.GetParentFolderName(WScript.ScriptFullName)\r\nsh.CurrentDirectory = root\r\ncommand = Chr(34) & root & "\\runtime\\node.exe" & Chr(34) & " --disable-warning=ExperimentalWarning " & Chr(34) & root & "\\app\\offline\\launcher.mjs" & Chr(34) & " start"\r\nrc = sh.Run(command, 0, True)\r\nIf rc <> 0 Then MsgBox "启动未完成，请查看 data 文件夹中的启动错误.txt，或双击启动系统.cmd。", 48, "行知实验室"\r\n';
await writeFile(join(bundle, '启动系统.vbs'), '\ufeff' + vbs, 'utf16le');
await writeFile(join(bundle, '先看这里.txt'), '行知实验室 · Windows 离线免安装版\r\n\r\n教师：双击“启动系统.vbs”，浏览器会自动打开教师工作台。\r\n如果机房禁用了脚本宿主，双击“启动系统.cmd”。\r\n学生：打开教师端顶部显示的学生访问地址，输入课堂码和姓名。\r\n结束：双击“停止系统.cmd”。\r\n备份：双击“备份数据.cmd”。\r\n\r\n不需要安装 Node.js、Python 或访问外网。\r\n请由学校管理员先将整套文件夹解压/拷贝到 Windows 10/11 64 位教师电脑，并允许此程序的机房局域网访问。\r\n保留 data 文件夹，它保存本地学习数据。不要直接在压缩包中运行。\r\n详见“使用说明.md”。\r\n', 'utf8');
async function files(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true }), result = [];
  for (const e of entries.sort((a,b) => a.name.localeCompare(b.name))) {
    const path = join(dir, e.name), name = prefix + e.name;
    if (e.isDirectory()) result.push(...await files(path, name + '/'));
    else if (e.isFile()) result.push({ path, name });
    else throw new Error('Only regular files are allowed in the portable bundle');
  }
  return result;
}
const inventory = [];
for (const file of await files(bundle)) { const bytes = await readFile(file.path); inventory.push({ path: file.name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }); }
await writeFile(join(bundle, '文件校验清单.json'), JSON.stringify({ version: '1.0.0', platform: 'Windows 10/11 x64', node: '24.14.1', runtimeSha256: runtimeHash, runtimeSource: 'https://nodejs.org/dist/v24.14.1/win-x64/node.exe', files: inventory }, null, 2));

// Small dependency-free ZIP writer. Build-time only; no installer is required.
const table = new Uint32Array(256); for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
function crc32(data){let c=0xffffffff;for(const byte of data)c=table[(c^byte)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const zipPath = bundle + '.zip', stream = createWriteStream(zipPath), central = []; let offset = 0;
stream.on('error', error => { console.error(error.message); process.exitCode = 1; });
async function put(bytes) { if (!stream.write(bytes)) await once(stream, 'drain'); offset += bytes.length; }
for (const file of await files(bundle)) {
  const bytes = await readFile(file.path), compressed = deflateRawSync(bytes, { level: 6 }), name = Buffer.from(file.name, 'utf8'), crc = crc32(bytes), start = offset;
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt16LE(0x800,6); header.writeUInt16LE(8,8); header.writeUInt16LE(0x21,12); header.writeUInt32LE(crc,14); header.writeUInt32LE(compressed.length,18); header.writeUInt32LE(bytes.length,22); header.writeUInt16LE(name.length,26);
  await put(header); await put(name); await put(compressed);
  const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20,4); record.writeUInt16LE(20,6); record.writeUInt16LE(0x800,8); record.writeUInt16LE(8,10); record.writeUInt16LE(0x21,14); record.writeUInt32LE(crc,16); record.writeUInt32LE(compressed.length,20); record.writeUInt32LE(bytes.length,24); record.writeUInt16LE(name.length,28); record.writeUInt32LE(start,42); central.push(Buffer.concat([record,name]));
}
const directoryOffset = offset; for (const record of central) await put(record);
const footer = Buffer.alloc(22); footer.writeUInt32LE(0x06054b50); footer.writeUInt16LE(central.length,8); footer.writeUInt16LE(central.length,10); footer.writeUInt32LE(offset-directoryOffset,12); footer.writeUInt32LE(directoryOffset,16); await put(footer);
const finished = once(stream, 'finish'); stream.end(); await finished;
const result = { bundle, zip: zipPath, files: central.length, zipBytes: (await stat(zipPath)).size, nodeSha256: runtimeHash };
await mkdir(join(root, 'outputs'), { recursive: true }); await writeFile(join(root, 'outputs/offline-package.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
