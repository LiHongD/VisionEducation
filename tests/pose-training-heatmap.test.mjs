import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../public/pose-training/'+p,import.meta.url),'utf8');
const context={console,process,require:createRequire(import.meta.url),setTimeout,clearTimeout,performance,TextEncoder,TextDecoder,URL,fetch};
vm.createContext(context);vm.runInContext(read('core.js'),context);const C=context.PoseCore;
const sample=(x=.3,y=.6)=>({keypoints:Array.from({length:17},()=>[x,y,2])});
test('Gaussian heatmaps decode the annotated position and omit unlabelled joints',()=>{
 const s=sample();s.keypoints[3]=[0,0,0];const t=C.heatmapTargets([s]);
 assert.equal(t.mask[3],0);assert.equal(t.mask[4],1);
 for(let j=0;j<17;j++){let sum=0;for(let p=0;p<1024;p++)sum+=t.values[p*17+j];assert(Math.abs(sum-(j===3?0:1))<1e-5)}
 const d=C.decodeHeatmaps(Float32Array.from(t.values,v=>Math.log(Math.max(1e-30,v))));
 assert(Math.abs(d.coords[0]-.3)<.001);assert(Math.abs(d.coords[1]-.6)<.001);
 // A flipped left shoulder must become a right shoulder, including its mask.
 assert.equal(C.FLIP[5],6);assert.equal(C.FLIP[6],5);
 assert.deepEqual(Array.from(C.FLIP,j=>C.FLIP[j]),Array.from({length:17},(_,j)=>j));
});
test('the no-image baseline is computed only from the supplied training labels',()=>{
 const tr=[sample(.2,.4),sample(.4,.6)],va=[sample(.9,.1)];
 const original=Array.from(C.heatmapPrior(tr));va[0].keypoints[0]=[.1,.9,2];
 assert.deepEqual(Array.from(C.heatmapPrior(tr)),original);
 const m=C.baselineMetrics(tr,[sample(.3,.5)]);assert(m.error<1e-5);assert.equal(m.pck,1);
});
test('real heatmap gradients update random convolution weights and survive a checkpoint round-trip',async()=>{
 vm.runInContext(read('assets/tf.min.js'),context);const tf=context.tf;
 await tf.setBackend('cpu');await tf.ready();const model=C.createModel(tf,42);
 assert.deepEqual(Array.from(model.inputs[0].shape),[null,128,128,3]);
 assert.deepEqual(Array.from(model.outputs[0].shape),[null,32,32,17]);
 const x=tf.randomUniform([1,128,128,3],0,1,'float32',7),t=C.heatmapTargets([sample()]),y=tf.tensor4d(t.values,[1,32,32,17]),mask=tf.tensor2d(t.mask,[1,17]),opt=tf.train.adam(.001);
 const variable=model.trainableWeights[0].val,before=Array.from(variable.dataSync());
 const loss=opt.minimize(()=>tf.tidy(()=>C.heatmapLoss(tf,model.apply(x,{training:true}),y,mask)),true,model.trainableWeights.map(w=>w.val));
 assert(Number.isFinite(loss.dataSync()[0]));assert(before.some((v,i)=>v!==variable.dataSync()[i]));
 let artifacts;await model.save(tf.io.withSaveHandler(async a=>{artifacts=a;return{modelArtifactsInfo:{dateSaved:new Date(),modelTopologyType:'JSON'}}}));
 const restored=await tf.loadLayersModel(tf.io.fromMemory(artifacts)),a=model.predict(x),b=restored.predict(x);
 assert.deepEqual(Array.from(a.dataSync()),Array.from(b.dataSync()));
 const zero=tf.zeros([1,17]),ignored=tf.tidy(()=>C.heatmapLoss(tf,a,y,zero));assert.equal(ignored.dataSync()[0],0);
 tf.dispose([x,y,mask,loss,a,b,zero,ignored]);opt.dispose();model.dispose();restored.dispose();
});
