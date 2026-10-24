export const DATASET_ID='combat3-v1',FEATURE_SPEC='mobilenetv2-472-hash256-l2-v1',DIM=256;
export const CLASSES=[{id:'cross',name:'直拳'},{id:'high-guard',name:'高位防守'},{id:'kick',name:'踢腿'}];
const copy=x=>JSON.parse(JSON.stringify(x));
export function rng(seed=42){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function config(raw={}){
  const c={epochs:Number(raw.epochs??40),learningRate:Number(raw.learningRate??.01),batchSize:Number(raw.batchSize??16),hidden:Number(raw.hidden??16),l2:Number(raw.l2??.001),seed:Number(raw.seed??42),perClass:Number(raw.perClass??60),earlyStopping:raw.earlyStopping!==false};
  if(!Number.isInteger(c.epochs)||c.epochs<1||c.epochs>120)throw Error('训练轮数应为 1–120。');
  if(!Number.isFinite(c.learningRate)||c.learningRate<.0001||c.learningRate>.1)throw Error('学习率应为 0.0001–0.1。');
  if(![8,16,32].includes(c.batchSize)||![0,16,32].includes(c.hidden)||![20,40,60].includes(c.perClass))throw Error('批大小、隐藏层或样本数不受支持。');
  if(!Number.isFinite(c.l2)||c.l2<0||c.l2>.1||!Number.isInteger(c.seed)||c.seed<0||c.seed>999999)throw Error('正则化或随机种子不正确。');
  return c;
}
export function validateModel(raw,backboneSha){
  if(!raw||raw.format!=='actionlab-image-classifier/v1'||raw.datasetId!==DATASET_ID||raw.featureSpec!==FEATURE_SPEC||raw.featureDimension!==DIM)throw Error('模型格式或数据集版本不兼容。请导入本实验导出的 JSON 模型。');
  if(!/^[a-f0-9]{64}$/.test(raw.backboneSha256)||backboneSha&&raw.backboneSha256!==backboneSha)throw Error('模型使用的图像特征提取器版本不一致。');
  if(!Array.isArray(raw.classes)||raw.classes.length!==3||raw.classes.some((c,i)=>c?.id!==CLASSES[i].id))throw Error('模型类别及顺序不正确。');
  const hidden=raw.hidden;if(![0,16,32].includes(hidden))throw Error('模型网络结构不受支持。');
  function array(value,length,limit=100){if(!Array.isArray(value)||value.length!==length||value.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>limit))throw Error('模型权重格式、数量或数值不正确。');return value.slice()}
  const scaler={mean:array(raw.scaler?.mean,DIM),std:array(raw.scaler?.std,DIM)};if(scaler.std.some(x=>x<.05||x>100))throw Error('归一化参数不正确。');
  const shapes=hidden?[[DIM*hidden,hidden],[hidden*3,3]]:[[DIM*3,3]];
  if(!Array.isArray(raw.layers)||raw.layers.length!==shapes.length)throw Error('模型层数不正确。');
  const layers=shapes.map(([w,b],i)=>({weights:array(raw.layers[i]?.weights,w),bias:array(raw.layers[i]?.bias,b)}));
  const training=config(raw.training);
  if(training.hidden!==hidden)throw Error('模型配置与网络结构不一致。');
  return {format:raw.format,datasetId:DATASET_ID,featureSpec:FEATURE_SPEC,featureDimension:DIM,backboneSha256:raw.backboneSha256,classes:copy(CLASSES),hidden,scaler,layers,training,createdAt:typeof raw.createdAt==='string'?raw.createdAt.slice(0,40):'',report:cleanReport(raw.report)};
}
function cleanReport(raw){if(!raw||typeof raw!=='object')return null;const result={};for(const k of ['epochsTrained','bestEpoch','trainAccuracy','validationAccuracy','trainLoss','validationLoss','durationMs'])if(Number.isFinite(raw[k])&&raw[k]>=0&&raw[k]<=1e9)result[k]=raw[k];return result}
export function forward(model,features){
  if(!features||features.length!==DIM)throw Error('图像特征维度不正确。');
  let x=Array.from(features,(v,i)=>Math.max(-10,Math.min(10,(v-model.scaler.mean[i])/model.scaler.std[i])));
  for(let n=0;n<model.layers.length;n++){
    const layer=model.layers[n],width=layer.bias.length,out=new Float64Array(width);
    for(let j=0;j<width;j++){let v=layer.bias[j];for(let i=0;i<x.length;i++)v+=x[i]*layer.weights[i*width+j];out[j]=n<model.layers.length-1?Math.max(0,v):v}
    x=out;
  }
  const max=Math.max(...x),exp=Array.from(x,v=>Math.exp(v-max)),sum=exp.reduce((a,b)=>a+b,0);return exp.map(v=>v/sum);
}
export function evaluate(model,samples){
  const confusion=Array.from({length:3},()=>[0,0,0]);let loss=0,correct=0;
  for(const s of samples){const p=forward(model,s.features),prediction=p.indexOf(Math.max(...p));confusion[s.label][prediction]++;correct+=Number(prediction===s.label);loss-=Math.log(Math.max(1e-12,p[s.label]))}
  const perClass=confusion.map((row,i)=>{const total=row.reduce((a,b)=>a+b,0),predicted=confusion.reduce((n,r)=>n+r[i],0),precision=row[i]/(predicted||1),recall=row[i]/(total||1);return{...CLASSES[i],total,correct:row[i],precision,recall,f1:2*precision*recall/(precision+recall||1)}});
  return{total:samples.length,correct,accuracy:correct/(samples.length||1),loss:loss/(samples.length||1),macroF1:perClass.reduce((a,b)=>a+b.f1,0)/3,confusion,perClass};
}
export function initialize(samples,options,backboneSha){
  const c=config(options),random=rng(c.seed),mean=Array(DIM).fill(0),std=Array(DIM).fill(0);
  for(const s of samples)for(let i=0;i<DIM;i++)mean[i]+=s.features[i]/samples.length;
  for(const s of samples)for(let i=0;i<DIM;i++)std[i]+=(s.features[i]-mean[i])**2/samples.length;
  for(let i=0;i<DIM;i++)std[i]=Math.max(.1,Math.sqrt(std[i]));
  const sizes=c.hidden?[DIM,c.hidden,3]:[DIM,3],layers=sizes.slice(1).map((width,n)=>({weights:Array.from({length:sizes[n]*width},()=>((random()-.5)*2)*Math.sqrt(6/(sizes[n]+width))),bias:Array(width).fill(0)}));
  return {format:'actionlab-image-classifier/v1',datasetId:DATASET_ID,featureSpec:FEATURE_SPEC,featureDimension:DIM,backboneSha256:backboneSha,classes:copy(CLASSES),hidden:c.hidden,scaler:{mean,std},layers,training:c,createdAt:new Date().toISOString(),report:null};
}
export async function train(samples,options,backboneSha,progress=()=>{},shouldStop=()=>false){
  const c=config(options),random=rng(c.seed),all=samples.filter(s=>s.split==='train'),validation=samples.filter(s=>s.split==='validation'),training=[];
  for(let label=0;label<3;label++){const group=all.filter(s=>s.label===label);for(let i=group.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[group[i],group[j]]=[group[j],group[i]]}training.push(...group.slice(0,c.perClass))}
  if(training.length!==c.perClass*3||validation.length<3)throw Error('数据集样本不完整，请重新加载。');
  const model=initialize(training,c,backboneSha),xs=training.map(s=>Float64Array.from(s.features,(v,i)=>Math.max(-10,Math.min(10,(v-model.scaler.mean[i])/model.scaler.std[i]))));
  const params=model.layers.flatMap(l=>[l.weights,l.bias]),mom=params.map(p=>new Float64Array(p.length)),velocity=params.map(p=>new Float64Array(p.length));
  let step=0,bestLoss=Infinity,best=null,stale=0,bestEpoch=0,epochs=0;const history=[],start=performance.now();
  for(let epoch=1;epoch<=c.epochs;epoch++){
    if(shouldStop())return null;
    const order=Array.from({length:training.length},(_,i)=>i);for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
    for(let offset=0;offset<order.length;offset+=c.batchSize){
      const gradients=params.map(p=>new Float64Array(p.length)),batch=order.slice(offset,offset+c.batchSize);
      for(const id of batch){
        const activations=[xs[id]];
        for(let n=0;n<model.layers.length;n++){const l=model.layers[n],x=activations.at(-1),width=l.bias.length,out=new Float64Array(width);for(let j=0;j<width;j++){let v=l.bias[j];for(let i=0;i<x.length;i++)v+=x[i]*l.weights[i*width+j];out[j]=n<model.layers.length-1?Math.max(0,v):v}activations.push(out)}
        const logits=activations.at(-1),max=Math.max(...logits),exps=Float64Array.from(logits,v=>Math.exp(v-max)),sum=exps.reduce((a,b)=>a+b,0);let delta=Float64Array.from(exps,v=>v/sum);delta[training[id].label]-=1;
        for(let n=model.layers.length-1;n>=0;n--){const x=activations[n],width=delta.length,gw=gradients[n*2],gb=gradients[n*2+1],prev=n?new Float64Array(x.length):null;for(let j=0;j<width;j++){gb[j]+=delta[j];for(let i=0;i<x.length;i++){gw[i*width+j]+=x[i]*delta[j];if(prev)prev[i]+=model.layers[n].weights[i*width+j]*delta[j]}}if(prev){for(let i=0;i<prev.length;i++)if(x[i]<=0)prev[i]=0;delta=prev}}
      }
      step++;for(let n=0;n<params.length;n++){const p=params[n],g=gradients[n],m=mom[n],v=velocity[n],b1=1-Math.pow(.9,step),b2=1-Math.pow(.999,step);for(let j=0;j<p.length;j++){const grad=Math.max(-10,Math.min(10,g[j]/batch.length+(n%2===0?c.l2*p[j]:0)));m[j]=.9*m[j]+.1*grad;v[j]=.999*v[j]+.001*grad*grad;p[j]-=c.learningRate*(m[j]/b1)/(Math.sqrt(v[j]/b2)+1e-8)}}
    }
    const a=evaluate(model,training),b=evaluate(model,validation);epochs=epoch;const row={epoch,trainLoss:a.loss,validationLoss:b.loss,trainAccuracy:a.accuracy,validationAccuracy:b.accuracy};history.push(row);progress(row,history);
    if(b.loss<bestLoss-1e-5){bestLoss=b.loss;best=copy(model.layers);bestEpoch=epoch;stale=0}else stale++;
    await new Promise(r=>setTimeout(r,0));
    if(c.earlyStopping&&stale>=8)break;
  }
  if(c.earlyStopping&&best)model.layers=best;
  const a=evaluate(model,training),b=evaluate(model,validation);model.report={epochsTrained:epochs,bestEpoch:c.earlyStopping?bestEpoch:epochs,trainAccuracy:a.accuracy,validationAccuracy:b.accuracy,trainLoss:a.loss,validationLoss:b.loss,durationMs:performance.now()-start};
  return{model,history,validation:b};
}
export function compressFeatures(values){
  if(values.length!==1280)throw Error('特征提取器输出维度不正确。');const out=new Float64Array(DIM);
  for(let i=0;i<values.length;i++)out[i%DIM]+=values[i]*(((Math.imul(i,2654435761)>>>0)&0x80000000)===0?1:-1);
  const norm=Math.hypot(...out)||1;return Array.from(out,v=>Number((v/norm*16).toFixed(6)));
}
