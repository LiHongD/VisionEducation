/* global tf, PoseCore, PoseStorage */
'use strict';
function datasetSignature(){let h=2166136261;for(const ch of JSON.stringify(S.samples.map(s=>[s.id,s.split,s.keypoints])))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return h.toString(16);}
function readConfig(){
 const epochs=Number($('epochs').value),lr=Number($('learningRate').value),batch=Number($('batchSize').value),seed=Number($('seed').value);
 if(!Number.isInteger(epochs)||epochs<1||epochs>300)throw Error('训练轮数应为1～300。');
 if(!Number.isInteger(seed)||seed<1||seed>999999)throw Error('随机种子应为1～999999。');
 const all=S.samples.filter(s=>s.split==='train'),count=$('sampleCount').value==='all'?all.length:Math.min(Number($('sampleCount').value),all.length);
 if(count<2)throw Error('至少需要2张训练图片。');
 return{epochs,lr,batch,seed,augment:$('augment').checked,count,inputSize:C.INPUT_SIZE,heatmapSize:C.HEATMAP_SIZE,keypoints:17,selection:C.shuffle(all,seed).slice(0,count).map(s=>s.id),datasetSignature:datasetSignature()};
}
function selectedTraining(config=S.config){return config?config.selection.map(id=>S.samples.find(s=>s.id===id)).filter(Boolean):S.samples.filter(s=>s.split==='train');}
async function pack(samples){
 if(!samples.length)throw Error('这个集合没有有效样本。');
 const images=await Promise.all(samples.map(imageFor)),canvas=document.createElement('canvas');canvas.width=canvas.height=C.INPUT_SIZE;
 const ctx=canvas.getContext('2d'),xs=tf.tidy(()=>tf.stack(images.map(img=>{ctx.drawImage(img,0,0,C.INPUT_SIZE,C.INPUT_SIZE);return tf.browser.fromPixels(canvas,3).toFloat().div(255)}))),labels=C.heatmapTargets(samples);
 return{xs,ys:tf.tensor4d(labels.values,[samples.length,C.HEATMAP_SIZE,C.HEATMAP_SIZE,17]),mask:tf.tensor2d(labels.mask,[samples.length,17]),samples};
}
function disposePack(p){if(p)tf.dispose([p.xs,p.ys,p.mask]);}
async function evaluate(p){
 const coords=[],losses=[];
 for(let offset=0;offset<p.samples.length;offset+=8){
  const n=Math.min(8,p.samples.length-offset),result=tf.tidy(()=>{
   const x=p.xs.slice([offset,0,0,0],[n,-1,-1,-1]),y=p.ys.slice([offset,0,0,0],[n,-1,-1,-1]),mask=p.mask.slice([offset,0],[n,-1]),z=S.model.predict(x).add(S.prior);
   return{z,loss:C.heatmapLoss(tf,z,y,mask),points:mask.sum()};
  });
  try{coords.push(...C.decodeHeatmaps(await result.z.data(),n).coords);losses.push([(await result.loss.data())[0],(await result.points.data())[0]]);}finally{tf.dispose(Object.values(result));}
 }
 const m=C.metrics(coords,p.samples),points=losses.reduce((n,p)=>n+p[1],0);
 return{...m,coordinateMSE:m.loss,loss:losses.reduce((n,p)=>n+p[0]*p[1],0)/Math.max(1,points)};
}
async function detailedPrediction(sample){
 const image=await imageFor(sample),canvas=document.createElement('canvas');canvas.width=canvas.height=C.INPUT_SIZE;canvas.getContext('2d').drawImage(image,0,0,C.INPUT_SIZE,C.INPUT_SIZE);
 const logits=tf.tidy(()=>S.model.predict(tf.browser.fromPixels(canvas).toFloat().div(255).expandDims()).add(S.prior));
 try{const heatmaps=await logits.data(),decoded=C.decodeHeatmaps(heatmaps);return{coords:Array.from(decoded.coords),peaks:Array.from(decoded.peaks),heatmaps:Array.from(heatmaps)}}finally{logits.dispose()}
}
async function predictSample(sample){return(await detailedPrediction(sample)).coords;}
function predictedPoints(values){return C.NAMES.map((_,j)=>[values[j*2],values[j*2+1],2]);}
function baselinePanel(){
 const base=S.baseline?.valid,last=S.currentMetrics?.valid||S.history.at(-1)?.valid;
 $('baselineError').textContent=base?base.error.toFixed(1)+' px':'—';$('modelError').textContent=last?last.error.toFixed(1)+' px':'—';
 if(!base||!last){$('baselineVerdict').textContent='基线只使用本次选中的训练标签计算，不看验证图片。训练后检查模型能否超过它。';return}
 const gain=(base.error-last.error)/base.error*100;
 $('baselineVerdict').textContent=gain>0?`当前模型比固定平均骨架降低 ${gain.toFixed(1)}% 点距；验证PCK ${(last.pck*100).toFixed(1)}%，基线 ${(base.pck*100).toFixed(1)}%。`:'当前模型尚未优于固定平均骨架。损失下降不等于学会定位，请检查数据、轮数和验证结果。';
 $('baselineVerdict').classList.toggle('not-improved',gain<=0);
}
function busy(value){
 S.running=value;
 for(const id of ['startTraining','resetModel','saveAnnotation','annotationUpload','annotationSplit','cocoJson','cocoImages','importCoco','epochs','sampleCount','learningRate','batchSize','seed','augment','restoreBtn','modelImport','evaluateTest','exportModel','predictUpload','runPrediction'])$(id).disabled=value;
 $('pauseTraining').disabled=!value;$('continueTraining').disabled=value||S.epoch===0;
 if(!value)$('restoreBtn').disabled=!localStorage.getItem(metaKey);counters();
}
async function initialise(seed=42){
 if(!S.engine)throw Error('训练引擎未就绪。');
 S.model?.dispose();S.prior?.dispose();S.model=C.createModel(tf,seed);S.config=readConfig();S.config.seed=seed;
 const training=selectedTraining();S.prior=tf.tensor3d(C.heatmapPrior(training),[C.HEATMAP_SIZE,C.HEATMAP_SIZE,17]);
 S.baseline={valid:C.baselineMetrics(training,S.samples.filter(s=>s.split==='valid'))};
 S.initial.clear();S.history=[];S.epoch=0;S.bestEpoch=0;S.test=null;S.prediction=null;S.currentMetrics=null;S.elapsed=0;S.dataChanged=false;
 for(const sample of S.samples.filter(s=>s.split==='valid'))S.initial.set(sample.id,await predictSample(sample));
 counters();chart();baselinePanel();$('trainingState').textContent='卷积权重随机初始化';$('trainLoss').textContent=$('validLoss').textContent='—';
 $('epochValue').innerHTML=`0 <small>/ ${$('epochs').value}</small>`;$('elapsedValue').innerHTML='0<small> s</small>';$('trainProgress').style.width='0%';$('testResults').innerHTML='<span>尚未评估</span>';$('predictionTable').innerHTML='<p class="muted">完成预测后列出17个点。</p>';$('continueTraining').disabled=true;await drawComparison();
}
async function train(resume=false){
 if(S.running)return;if(!S.engine)throw Error('训练引擎未就绪。');
 if(resume&&(S.dataChanged||S.config?.datasetSignature!==datasetSignature()))throw Error('数据或标签已变化，请从零开始新实验。');
 const config=readConfig();
 if(resume&&config.selection.join(',')!==S.config.selection.join(','))throw Error('训练样本或种子已变化，请从零训练，或恢复原设置。');
 busy(true);$('pauseTraining').disabled=true;
 try{if(!resume)await initialise(config.seed);}catch(e){busy(false);throw e}
 S.config=config;S.test=null;S.stop=window.PoseTrainingVisible===false;busy(true);
 const start=performance.now(),before=S.elapsed;let tr,va,optimizer,bestWeights,bestScore=Infinity,bestMetrics;
 try{
  const validation=S.samples.filter(s=>s.split==='valid');if(!validation.length)throw Error('至少需要1张验证图片。');
  $('trainingMessage').textContent='准备128像素人物图与17张监督热力图…';tr=await pack(selectedTraining());va=await pack(validation);optimizer=tf.train.adam(config.lr);
  if(!S.history.length){const train=await evaluate(tr),valid=await evaluate(va);S.history.push({epoch:0,train,valid});renderMetrics();}
  const initialValid=await evaluate(va);bestScore=initialValid.error;bestWeights=S.model.getWeights().map(w=>w.clone());S.bestEpoch=resume?S.bestEpoch:0;
  bestMetrics={train:await evaluate(tr),valid:initialValid};
  const target=S.epoch+config.epochs,weights=S.model.trainableWeights.map(w=>w.val),rng=C.random(config.seed+S.epoch);
  for(let epoch=S.epoch+1;epoch<=target;epoch++){
   const order=C.shuffle(tr.samples.map((_,i)=>i),config.seed+epoch);let batches=0;
   for(let offset=0;offset<order.length;offset+=config.batch){
    if(S.stop)break;const indices=order.slice(offset,offset+config.batch),n=indices.length;
    const b=tf.tidy(()=>{
     const ix=tf.tensor1d(indices,'int32');let x=tf.gather(tr.xs,ix),y=tf.gather(tr.ys,ix),mask=tf.gather(tr.mask,ix);
     if(config.augment){const choose=tf.tensor1d(indices.map(()=>rng()<.5),'bool');x=tf.where(choose.reshape([n,1,1,1]),tf.image.flipLeftRight(x),x);y=tf.where(choose.reshape([n,1,1,1]),tf.gather(y.reverse(2),C.FLIP,3),y);mask=tf.where(choose.reshape([n,1]),tf.gather(mask,C.FLIP,1),mask)}
     return{x,y,mask};
    });
    try{const loss=optimizer.minimize(()=>tf.tidy(()=>C.heatmapLoss(tf,S.model.apply(b.x,{training:true}).add(S.prior),b.y,b.mask)),true,weights);const value=(await loss.data())[0];loss.dispose();if(!Number.isFinite(value))throw Error('损失非有限值，请降低学习率重新训练。')}finally{tf.dispose(Object.values(b))}
    batches++;S.elapsed=before+(performance.now()-start)/1000;$('elapsedValue').innerHTML=`${Math.round(S.elapsed)}<small> s</small>`;
    $('trainingMessage').textContent=`第 ${epoch} 轮 · 批次 ${batches}/${Math.ceil(order.length/config.batch)} · 只更新训练集`; $('trainProgress').style.width=`${Math.min(100,(epoch-1+(offset+indices.length)/order.length)/target*100)}%`;await tf.nextFrame();
   }
   if(!batches)break;
   const train=await evaluate(tr),valid=await evaluate(va);S.epoch=epoch;S.currentMetrics=null;S.history.push({epoch,partial:batches<Math.ceil(order.length/config.batch),train,valid});
   if(valid.error<bestScore){bestScore=valid.error;S.bestEpoch=epoch;bestWeights.forEach(w=>w.dispose());bestWeights=S.model.getWeights().map(w=>w.clone());bestMetrics={train,valid}}
   S.elapsed=before+(performance.now()-start)/1000;renderMetrics(target);await drawComparison();await tf.nextFrame();if(S.stop)break;
  }
  if(bestWeights){S.model.setWeights(bestWeights);S.currentMetrics=bestMetrics}
  S.elapsed=before+(performance.now()-start)/1000;renderMetrics(target);await drawComparison();
  $('trainingState').textContent=S.stop?'已暂停 · 使用验证最佳权重':'训练完成 · 使用验证最佳权重';
  $('trainingMessage').textContent=`已训练 ${S.epoch} 轮；采用验证点距最低的第 ${S.bestEpoch} 轮权重。曲线保留各轮真实值，测试集未参与选择。`;
  await saveBrowserModel();toast(S.stop?'已暂停并保存当前实验。':'训练完成。先比较平均骨架基线，再用自己的图片检验。');
 }finally{disposePack(tr);disposePack(va);optimizer?.dispose();bestWeights?.forEach(w=>w.dispose());busy(false);$('annotationSplit').disabled=!!S.editor&&S.samples.some(s=>s.id===S.editor.id)}
}
function renderMetrics(target){const h=S.currentMetrics||S.history.at(-1);if(!h)return;$('epochValue').innerHTML=`${S.epoch}<small> / ${target||S.config?.epochs||$('epochs').value}</small>`;$('trainLoss').textContent=h.train.loss?.toFixed(3)??'—';$('validLoss').textContent=h.valid.loss?.toFixed(3)??'—';$('elapsedValue').innerHTML=`${Math.round(S.elapsed)}<small> s</small>`;counters();chart();baselinePanel()}
function chart(){
 const svg=$('lossChart'),W=720,H=230,L=49,R=15,T=16,B=30,values=S.history.flatMap(h=>[h.train.loss,h.valid.loss]).filter(Number.isFinite),max=Math.max(.001,...values)*1.08,n=Math.max(1,S.history.at(-1)?.epoch||0);let out='';
 for(let i=0;i<5;i++){const y=T+(H-T-B)*i/4;out+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="#dfe7e0"/><text x="${L-8}" y="${y+3}" text-anchor="end" fill="#7b867c" font-size="9">${(max*(1-i/4)).toFixed(2)}</text>`}
 for(const f of [0,.25,.5,.75,1])out+=`<text x="${L+(W-L-R)*f}" y="${H-8}" text-anchor="middle" fill="#7b867c" font-size="9">${Math.round(n*f)}</text>`;
 for(const[key,color]of [['train','#23b092'],['valid','#8d7ade']]){const pts=S.history.map(h=>`${L+h.epoch/n*(W-L-R)},${T+(1-h[key].loss/max)*(H-T-B)}`);if(pts.length>1)out+=`<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${pts.join(' ')}"/>`}
 svg.innerHTML=out;$('chartEmpty').hidden=S.history.length>0;
}
async function drawComparison(){if(!S.model||!S.samples.length)return;const items=S.samples.filter(s=>s.split==='valid');if(!items.length)return;const sample=items[S.compare%items.length],image=await imageFor(sample),before=S.initial.get(sample.id),after=await predictSample(sample);for(const[id,points]of [['beforeCanvas',before],['afterCanvas',after]]){const context=drawImage($(id),image);drawPose(context,sample.keypoints,320);if(points)drawPose(context,predictedPoints(points),320,{prediction:true})}$('compareError').textContent=`${before?C.metrics(before,[sample]).error.toFixed(1):'—'} px → ${C.metrics(after,[sample]).error.toFixed(1)} px`}
$('startTraining').onclick=guard(()=>train(false));$('continueTraining').onclick=guard(()=>train(true));$('pauseTraining').onclick=()=>{S.stop=true;$('pauseTraining').disabled=true;$('trainingState').textContent='等待当前批次结束'};
$('resetModel').onclick=guard(async()=>{if(S.running)return;busy(true);try{await initialise(Number($('seed').value)||42)}finally{busy(false)}});$('nextCompare').onclick=guard(async()=>{S.compare++;await drawComparison()});
async function useSample(split){const items=S.samples.filter(s=>s.split===split);if(!items.length)throw Error('该集合没有样本。');const sample=items[(S.predictIndex??0)%items.length];S.predictIndex=(S.predictIndex??0)+1;S.predictSample=sample;S.predictImage=await imageFor(sample);S.prediction=null;S.lastHeatmaps=null;drawPrediction();$('predictImageLabel').textContent=`${sample.id} · ${labels[split]}集`;$('predictionTable').innerHTML='<p class="muted">点击预测，查看模型输出。</p>'}
function drawPrediction(){
 if(!S.predictImage)return;const context=drawImage($('predictCanvas'),S.predictImage);
 if($('showHeatmap').checked&&S.lastHeatmaps){const j=Number($('heatmapJoint').value),size=C.HEATMAP_SIZE,small=document.createElement('canvas');small.width=small.height=size;const ctx=small.getContext('2d'),pixels=ctx.createImageData(size,size);let max=-Infinity;for(let p=0;p<size*size;p++)max=Math.max(max,S.lastHeatmaps[p*17+j]);for(let p=0;p<size*size;p++){const v=Math.exp(S.lastHeatmaps[p*17+j]-max);pixels.data.set([255,100,20,Math.round(v*170)],p*4)}ctx.putImageData(pixels,0,0);context.drawImage(small,0,0,640,640)}
 if($('showTruth').checked&&S.predictSample?.keypoints)drawPose(context,S.predictSample.keypoints,640);if(S.prediction)drawPose(context,predictedPoints(S.prediction),640,{prediction:true,labels:true});
}
$('useValidation').onclick=guard(()=>useSample('valid'));$('useTraining').onclick=guard(()=>useSample('train'));$('showTruth').onchange=$('showHeatmap').onchange=$('heatmapJoint').onchange=drawPrediction;
$('heatmapJoint').innerHTML=C.NAMES.map((name,j)=>`<option value="${j}" ${j===9?'selected':''}>${name}</option>`).join('');
$('predictUpload').onchange=guard(async event=>{const file=event.target.files[0];if(!file)return;const image=await cropFile(file);event.target.value='';if(!image)return;S.predictSample={id:file.name,image:image.image,split:'unseen',keypoints:C.NAMES.map(()=>[0,0,0]),transform:image.transform,originalSize:image.originalSize};S.predictImage=await imageFor(S.predictSample);S.prediction=null;S.lastHeatmaps=null;drawPrediction();$('predictImageLabel').textContent=`${file.name} · 已按人物框裁剪`;$('predictionTable').innerHTML='<p class="muted">新图片没有人工真值，不计算准确率。</p>'});
$('runPrediction').onclick=guard(async()=>{if(S.running)throw Error('先暂停训练再预测。');if(!S.engine||!S.model)throw Error('训练引擎未就绪。');if(!S.predictSample)await useSample('valid');const result=await detailedPrediction(S.predictSample);S.prediction=result.coords;S.lastHeatmaps=result.heatmaps;S.peaks=result.peaks;drawPrediction();$('predictionTable').innerHTML=`<table><thead><tr><th>关键点</th><th>x</th><th>y</th></tr></thead><tbody>${C.NAMES.map((name,j)=>`<tr><td>${j} · ${name}</td><td>${result.coords[j*2].toFixed(3)}</td><td>${result.coords[j*2+1].toFixed(3)}</td></tr>`).join('')}</tbody></table>`;toast(S.epoch?'已预测。坐标来自当前学生模型，橙色为预测。':'这是随机权重与训练标签位置先验的输出，尚未进行梯度训练。')});
$('exportPrediction').onclick=guard(()=>{if(!S.prediction)throw Error('先预测一张图片。');const s=S.predictSample;download('pose-keypoints.json',{schema:'poselab-keypoints-v2',image:s.id,keypointNames:C.EN,coordinateSystem:'normalized_person_crop',preprocessing:s.transform||{note:'已经按人物框裁剪'},originalSize:s.originalSize,trainedEpochs:S.epoch,bestEpoch:S.bestEpoch,keypoints:C.EN.map((name,j)=>{const x=S.prediction[j*2],y=S.prediction[j*2+1];return{id:j,name,x,y,confidence:null,...(s.transform?{originalPixelX:x*s.transform.side+s.transform.x,originalPixelY:y*s.transform.side+s.transform.y}:{})}})})});
$('exportPicture').onclick=guard(()=>{if(!S.prediction)throw Error('先执行预测。');$('predictCanvas').toBlob(blob=>blob&&download('pose-result.png',blob),'image/png')});
$('evaluateTest').onclick=guard(async()=>{if(!S.epoch)throw Error('先完成至少一轮训练。');if(S.config.datasetSignature!==datasetSignature())throw Error('数据已变化，请先从零训练。');$('evaluateTest').disabled=true;let p;try{const samples=S.samples.filter(s=>s.split==='test');p=await pack(samples);const baseline=C.baselineMetrics(selectedTraining(),samples);S.test={...await evaluate(p),baseline,epoch:S.epoch,bestEpoch:S.bestEpoch,date:new Date().toISOString()};$('testResults').innerHTML=`<div><span>模型 PCK@0.1</span><strong>${(S.test.pck*100).toFixed(1)}%</strong></div><div><span>平均点距</span><strong>${S.test.error.toFixed(1)}<small> px</small></strong></div><p class="small-note">固定平均骨架：${baseline.error.toFixed(1)} px，PCK ${(baseline.pck*100).toFixed(1)}%。${samples.length}张测试图；采用第${S.bestEpoch}轮权重。</p>`;await saveBrowserModel()}finally{disposePack(p);$('evaluateTest').disabled=false}});
function meta(){return{schema:'poselab-model-v2',architecture:'random CNN + training-only spatial prior + 17 heatmaps',epoch:S.epoch,bestEpoch:S.bestEpoch,history:S.history,currentMetrics:S.currentMetrics,config:S.config,baseline:S.baseline,prior:Array.from(S.prior.dataSync()),elapsed:S.elapsed,test:S.test,initial:[...S.initial],keypointNames:C.EN,inputSize:C.INPUT_SIZE,heatmapSize:C.HEATMAP_SIZE,datasetSignature:S.config?.datasetSignature,savedAt:new Date().toISOString()}}
async function saveBrowserModel(){try{await S.model.save(PoseStorage.modelURL);localStorage.setItem(metaKey,JSON.stringify(meta()));$('restoreBtn').disabled=false;$('resumeNotice').hidden=true}catch(e){console.warn(e);toast('本机保存失败，请导出模型备份。')}}
function checkModel(model){if(model.inputs[0].shape.slice(1).join(',')!=='128,128,3'||model.outputs[0].shape.slice(1).join(',')!=='32,32,17'){model.dispose();throw Error('新版模型需要128×128输入与32×32×17热力图输出。')}}
function applyMeta(m){
 if(!Array.isArray(m.prior)||m.prior.length!==32*32*17||m.prior.some(v=>!Number.isFinite(v)))throw Error('模型缺少有效的训练集位置先验。');
 S.prior?.dispose();S.prior=tf.tensor3d(m.prior,[32,32,17]);S.epoch=Number(m.epoch)||0;S.bestEpoch=Number(m.bestEpoch)||0;S.history=m.history||[];S.currentMetrics=m.currentMetrics||null;S.config=m.config;S.baseline=m.baseline;S.elapsed=m.elapsed||0;S.test=m.test||null;S.initial=new Map(m.initial||[]);S.dataChanged=m.datasetSignature!==datasetSignature();S.prediction=null;
 $('epochs').value=Math.min(300,m.config?.epochs||80);$('seed').value=m.config?.seed||42;$('learningRate').value=String(m.config?.lr||.001);$('batchSize').value=String(m.config?.batch||8);$('augment').checked=m.config?.augment!==false;
 const count=String(m.config?.count);$('sampleCount').value=[...$('sampleCount').options].some(o=>o.value===count)?count:'all';
 renderMetrics();counters();$('trainingState').textContent=`已恢复 · 最佳第${S.bestEpoch}轮`;$('continueTraining').disabled=!S.epoch;$('resumeNotice').hidden=true;
}
$('restoreBtn').onclick=guard(async()=>{if(S.running)throw Error('先暂停训练。');const raw=localStorage.getItem(metaKey);if(!raw)throw Error('没有新版模型记录。');const m=JSON.parse(raw),model=await tf.loadLayersModel(PoseStorage.modelURL);checkModel(model);S.model?.dispose();S.model=model;applyMeta(m);await drawComparison();toast(S.dataChanged?'模型已恢复；数据已变化，继续学习需从零训练。':'已恢复模型、训练标签先验与实验记录。')});
function toBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text)}
function fromBase64(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0))}
$('exportModel').onclick=guard(async()=>{if(S.running)throw Error('先暂停训练再导出。');await S.model.save(tf.io.withSaveHandler(async a=>{download('my-pose-heatmap.poselab.json',{...meta(),artifacts:{modelTopology:a.modelTopology,weightSpecs:a.weightSpecs,weightData:toBase64(new Uint8Array(a.weightData))}});return{modelArtifactsInfo:{dateSaved:new Date(),modelTopologyType:'JSON',weightDataBytes:a.weightData.byteLength}}}))});
$('modelImport').onchange=guard(async event=>{if(S.running)throw Error('先暂停训练。');const file=event.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('模型文件超过20 MB。');const m=JSON.parse(await file.text());if(m.schema==='poselab-model-v1')throw Error('这是旧版64像素坐标回归模型；新版结构不同，请重新训练。旧文件仍可保留。');if(m.schema!=='poselab-model-v2'||m.inputSize!==128||m.keypointNames?.join(',')!==C.EN.join(',')||!m.artifacts?.weightData)throw Error('请选择新版PoseLab模型文件。');if(!Array.isArray(m.prior)||m.prior.length!==17408||m.prior.some(v=>!Number.isFinite(v)))throw Error('模型位置先验无效。');const model=await tf.loadLayersModel(tf.io.fromMemory({...m.artifacts,weightData:fromBase64(m.artifacts.weightData).buffer}));checkModel(model);S.model?.dispose();S.model=model;applyMeta(m);await saveBrowserModel();await drawComparison();event.target.value='';toast('已恢复新版模型。')});
function reportText(){const fmt=m=>m?`热力图交叉熵 ${m.loss?.toFixed(4)}；点距 ${m.error.toFixed(2)}参考像素；PCK@0.1 ${(m.pck*100).toFixed(1)}%`:'未计算';return`# 人体姿态热力图训练实验\n\n小组：${$('studentName').value}\n\n卷积权重随机初始化，无外部预训练权重；位置先验和固定平均骨架均仅用所选训练标签计算。输入128×128，输出17张32×32热力图；坐标取热力图空间期望。\n\n配置：${JSON.stringify(S.config)}\n\n已训练${S.epoch}轮，采用验证点距最低的第${S.bestEpoch}轮权重；用时${S.elapsed.toFixed(1)}秒。\n\n验证模型：${fmt(S.currentMetrics?.valid||S.history.at(-1)?.valid)}\n\n验证固定平均骨架：${S.baseline?.valid.error.toFixed(2)||'—'}参考像素，PCK ${S.baseline?(S.baseline.valid.pck*100).toFixed(1):'—'}%\n\n测试模型：${fmt(S.test)}\n\n测试固定平均骨架：${S.test?.baseline?.error.toFixed(2)||'未计算'}参考像素\n\n参考像素按图宽160换算；PCK阈值为图宽10%。内置1104张COCO全身图分为1024训练/40验证/40测试，原图互不重叠。测试不用于权重或最佳轮次选择。\n\n观察：${$('studentNotes').value}\n\n|轮次|训练交叉熵|验证交叉熵|验证点距|验证PCK|\n|---|---|---|---|---|\n${S.history.map(h=>`|${h.epoch}${h.partial?'（部分批次）':''}|${h.train.loss.toFixed(4)}|${h.valid.loss.toFixed(4)}|${h.valid.error.toFixed(2)}|${(h.valid.pck*100).toFixed(1)}%|`).join('\n')}`}
// Manual person boxes keep new-photo preprocessing consistent with training boxes.
let cropSession,cropAnchor;
async function cropFile(file){const original=await imageFor(await readFile(file));return new Promise(resolve=>{cropSession={file,original,resolve,box:[0,0,original.width,original.height]};cropAnchor=null;const scale=720/Math.max(original.width,original.height);$('cropCanvas').width=Math.round(original.width*scale);$('cropCanvas').height=Math.round(original.height*scale);drawCrop();$('personCropDialog').showModal()})}
function drawCrop(){if(!cropSession)return;const canvas=$('cropCanvas'),ctx=canvas.getContext('2d'),image=cropSession.original,scale=canvas.width/image.width,[x,y,w,h]=cropSession.box;ctx.drawImage(image,0,0,canvas.width,canvas.height);ctx.strokeStyle='#25c89a';ctx.lineWidth=3;ctx.strokeRect(x*scale,y*scale,w*scale,h*scale);for(const[id,v]of [['cropX',x],['cropY',y],['cropW',w],['cropH',h]])$(id).value=Math.round(v)}
function cropPoint(e){const canvas=$('cropCanvas'),r=canvas.getBoundingClientRect();return[Math.max(0,Math.min(cropSession.original.width,(e.clientX-r.left)/r.width*cropSession.original.width)),Math.max(0,Math.min(cropSession.original.height,(e.clientY-r.top)/r.height*cropSession.original.height))]}
$('cropCanvas').onpointerdown=e=>{if(!cropSession)return;cropAnchor=cropPoint(e);$('cropCanvas').setPointerCapture(e.pointerId)};
$('cropCanvas').onpointermove=e=>{if(!cropAnchor)return;const p=cropPoint(e);cropSession.box=[Math.min(cropAnchor[0],p[0]),Math.min(cropAnchor[1],p[1]),Math.max(1,Math.abs(p[0]-cropAnchor[0])),Math.max(1,Math.abs(p[1]-cropAnchor[1]))];drawCrop()};$('cropCanvas').onpointerup=$('cropCanvas').onpointercancel=()=>cropAnchor=null;
for(const id of ['cropX','cropY','cropW','cropH'])$(id).onchange=()=>{if(!cropSession)return;cropSession.box=['cropX','cropY','cropW','cropH'].map(id=>Number($(id).value));drawCrop()};
$('cropCancel').onclick=()=>{$('personCropDialog').close()};$('personCropDialog').onclose=()=>{if(cropSession){cropSession.resolve(null);cropSession=null}};
$('cropApply').onclick=guard(async()=>{const session=cropSession;if(!session)return;const[x,y,w,h]=session.box;if(![x,y,w,h].every(Number.isFinite)||w<10||h<10||x<0||y<0||x+w>session.original.width+1||y+h>session.original.height+1)throw Error('请框住图片内的一个完整人物，框宽高至少10像素。');const result=await squareImage(session.file,session.box);cropSession=null;$('personCropDialog').close();session.resolve(result)});
window.dispatchEvent(new Event('poselab-runtime-ready'));
