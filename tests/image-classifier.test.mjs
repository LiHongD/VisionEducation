import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {config,train,validateModel,evaluate,forward,compressFeatures} from '../public/model-lab/core.js';
const root=new URL('../',import.meta.url),data=JSON.parse(readFileSync(new URL('public/model-lab-assets/samples.json',root))),benchmark=JSON.parse(readFileSync(new URL('lib/classifier-benchmark.json',root))),manifest=JSON.parse(readFileSync(new URL('public/model-lab-assets/manifest.json',root)));
test('real gradient training learns from images, is reproducible, and supports both classifier architectures',async()=>{
  const options={epochs:12,earlyStopping:false,hidden:0,perClass:20,learningRate:.01,seed:51};
  const a=await train(data.samples,options,data.backboneSha256),b=await train(data.samples,options,data.backboneSha256);
  assert.ok(a.history.at(-1).trainLoss<a.history[0].trainLoss);assert.ok(a.model.report.trainAccuracy>.8);assert.deepEqual(a.model.layers,b.model.layers);
  const loaded=validateModel(JSON.parse(JSON.stringify(a.model)),manifest.backboneSha256);assert.deepEqual(forward(a.model,data.samples[0].features),forward(loaded,data.samples[0].features));
  const c=await train(data.samples,{epochs:5,hidden:16,perClass:20},data.backboneSha256);assert.equal(c.model.layers.length,2);assert.equal(evaluate(c.model,benchmark.samples).total,60);
});
test('normalization uses training samples only; validation changes cannot leak into learned preprocessing',async()=>{
  const options={epochs:1,hidden:0,perClass:20,earlyStopping:false};const changed=structuredClone(data.samples);for(const s of changed)if(s.split==='validation')s.features=s.features.map(v=>v+20);
  const a=await train(data.samples,options,data.backboneSha256),b=await train(changed,options,data.backboneSha256);assert.deepEqual(a.model.scaler,b.model.scaler);assert.deepEqual(a.model.layers,b.model.layers);
});
test('strict model compatibility and finite shape checks reject unsupported or malformed uploads',async()=>{
  const {model}=await train(data.samples,{epochs:1,hidden:0,perClass:20},data.backboneSha256);
  for(const mutate of [m=>m.datasetId='other',m=>m.hidden=500,m=>m.layers[0].weights.pop(),m=>m.layers[0].bias[0]=NaN,m=>m.scaler.std[0]=0,m=>m.classes.reverse(),m=>m.backboneSha256='a'.repeat(64)]){const changed=structuredClone(model);mutate(changed);assert.throws(()=>validateModel(changed,manifest.backboneSha256))}
  assert.throws(()=>config({learningRate:0}));assert.throws(()=>config({epochs:121}));assert.throws(()=>config({batchSize:100}));assert.throws(()=>config({seed:1.5}));
});
test('training, validation, and server test have balanced classes and disjoint source groups and image hashes',()=>{
  const provenance=JSON.parse(readFileSync(new URL('docs/classifier-dataset-provenance.json',root)));const seenGroups=new Map(),seenHashes=new Set();
  for(const p of provenance){if(seenGroups.has(p.group))assert.equal(seenGroups.get(p.group),p.split);seenGroups.set(p.group,p.split);assert.ok(!seenHashes.has(p.sha256));seenHashes.add(p.sha256)}
  for(const [split,count]of [['train',60],['validation',15],['test',20]])for(let label=0;label<3;label++)assert.equal(provenance.filter(p=>p.split===split&&p.label===label).length,count);
  const publicIds=new Set(data.samples.map(s=>s.id));for(const s of benchmark.samples){assert.ok(!publicIds.has(s.id));for(const c of manifest.classes)assert.ok(!existsSync(new URL('public/model-lab-assets/images/'+c.id+'/'+s.id+'.jpg',root)))}
  for(const s of data.samples){assert.equal(s.features.length,256);assert.ok(s.features.every(Number.isFinite));assert.ok(existsSync(new URL('public'+s.image,root)))}
  assert.equal(createHash('sha256').update(readFileSync(new URL('public/model-lab-assets/mobilenetv2-features.onnx',root))).digest('hex'),manifest.backboneSha256);
});
test('feature compression has a stable signed projection and finite normalized output',()=>{const values=Array.from({length:1280},(_,i)=>(i%7)/7),out=compressFeatures(values);assert.equal(out.length,256);assert.ok(Math.abs(Math.hypot(...out)-16)<1e-5);assert.throws(()=>compressFeatures([1,2]));});
