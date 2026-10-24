import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Keep the complete rules tool isolated from the course's legacy global IDs/styles.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'tools/angle-studio');
const read=name=>readFileSync(path.join(source,name),'utf8');
let html=read('studio.html');
const parts={
  '/*__CSS__*/':read('studio.css')+'\n'+read('reference-pose.css')+'\n'+read('embedded.css'),
  '/*__COCO_ENGINE__*/':read('coco-input-engine.js'),
  '/*__RULE_ENGINE__*/':read('visual-rules-engine.js'),
  '/*__EXAMPLES__*/':read('demo-keypoints.json'),
  '/*__WORKER__*/':JSON.stringify(read('pose-worker.js')),
  '/*__APP__*/':read('hosted-runtime.js')+'\n'+read('studio.js')+'\n'+read('frame-bridge.js'),
};
for(const [marker,text] of Object.entries(parts)){
  if(!html.includes(marker))throw new Error('Missing template marker: '+marker);
  html=html.replace(marker,()=>text);
}
html=html.replace('<title>动作识别课堂', '<title>量势成规 · 动作识别课堂');
mkdirSync(path.join(root,'public/angle-studio'),{recursive:true});
writeFileSync(path.join(root,'public/angle-studio/index.html'),html);
console.log('Built the embedded angle studio using existing model/runtime assets.');
