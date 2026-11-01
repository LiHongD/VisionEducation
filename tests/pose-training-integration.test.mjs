import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const root=new URL('../public/pose-training/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');

test('pose training separates local annotations, model weights and notes by classroom member',()=>{
  const scope=draft=>{const context={window:{},location:{search:'?draft='+encodeURIComponent(draft)},URLSearchParams,crypto:{getRandomValues:values=>webcrypto.getRandomValues(values)}};vm.runInNewContext(read('scope.js'),context);return context.window.PoseStorage};
  const a=scope('actionlab-draft-student-a'),b=scope('actionlab-draft-student-b');
  for(const name of ['custom-v1','model-meta-v2','studentName','studentNotes'])assert.notEqual(a.localKey(name),b.localKey(name));
  assert.notEqual(a.modelURL,b.modelURL);assert.equal(a.modelURL,scope('actionlab-draft-student-a').modelURL);
  const escaped=scope('中文/<script>&?');assert.match(escaped.modelURL,/%/);assert(!escaped.modelURL.includes('<script>'));
  assert.match(a.newSampleId(),/^student-[a-f0-9]{16}$/);assert.notEqual(a.newSampleId(),a.newSampleId());
});

test('only the same-origin parent can pause the embedded training on lesson navigation',()=>{
  const parent={postMessage(){}},listeners={},state={running:true,stop:false,epoch:2},message={textContent:''};
  const context={window:{parent,PoseLab:{state}},parent,location:{origin:'http://school.local',search:'?embed=1'},URLSearchParams,
    document:{body:{classList:{add(){}},getBoundingClientRect:()=>({height:1000})},getElementById:()=>message},
    requestAnimationFrame:fn=>fn(),ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},addEventListener:(type,fn)=>listeners[type]=fn};
  vm.runInNewContext(read('frame-bridge.js'),context);
  const data={type:'actionlab-pose-training-visibility',visible:false};
  listeners.message({source:parent,origin:'http://unrelated.local',data});assert.equal(state.stop,false);
  listeners.message({source:{},origin:'http://school.local',data});assert.equal(state.stop,false);
  listeners.message({source:parent,origin:'http://school.local',data});assert.equal(state.stop,true);assert.match(message.textContent,/暂停并保存/);
});

test('the integrated classroom carries all real images and COCO labels without the former site',()=>{
  const dataset=JSON.parse(read('assets/dataset.json')),samples=dataset.samples;
  assert.equal(samples.length,1104);assert.equal(new Set(samples.map(s=>s.id)).size,1104);
  assert.equal(new Set(samples.map(s=>s.source.imageId)).size,1104,'an original image cannot cross splits');
  for(const [split,count]of [['train',1024],['valid',40],['test',40]])assert.equal(samples.filter(s=>s.split===split).length,count);
  for(const sample of samples){assert.equal(sample.keypoints.length,17);assert(existsSync(new URL(sample.image,root)));assert.equal(sample.source.license,'CC BY 2.0');assert.equal(sample.source.cocoSplit,sample.split==='train'?'train2017':'val2017');}
  for(const asset of ['assets/tf.min.js','assets/fflate.js','core.js','training.js','scope.js','frame-bridge.js'])assert(existsSync(new URL(asset,root)));
});
