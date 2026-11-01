/* PoseLab v2: spatial heatmap supervision, random weights, no pretrained model. */
(function(root){
 const NAMES=['鼻子','左眼','右眼','左耳','右耳','左肩','右肩','左肘','右肘','左腕','右腕','左髋','右髋','左膝','右膝','左踝','右踝'];
 const EN=['nose','left_eye','right_eye','left_ear','right_ear','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist','left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle'];
 const EDGES=[[0,1],[0,2],[1,3],[2,4],[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]];
 const FLIP=[0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15];
 function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
 function shuffle(items,seed){const out=[...items],r=random(seed);for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
 const INPUT_SIZE=128,HEATMAP_SIZE=32;
 function createModel(tf,seed=42){
  let s=seed;
  const input=tf.input({shape:[INPUT_SIZE,INPUT_SIZE,3]});
  const block=(x,filters,strides=1)=>{
   x=tf.layers.conv2d({filters,kernelSize:3,strides,padding:'same',useBias:false,kernelInitializer:tf.initializers.heNormal({seed:s++})}).apply(x);
   x=tf.layers.batchNormalization({epsilon:.001,momentum:.9}).apply(x);
   return tf.layers.activation({activation:'relu'}).apply(x);
  };
  const c1=block(input,16,2),c2=block(c1,24,2),c3=block(c2,32,2),c4=block(c3,48,2);
  let x=block(c4,48);
  const up=(a,b,filters)=>block(tf.layers.concatenate({axis:-1}).apply([tf.layers.upSampling2d({size:[2,2]}).apply(a),b]),filters);
  x=up(x,c3,32);x=up(x,c2,24);
  const output=tf.layers.conv2d({filters:17,kernelSize:1,padding:'same',kernelInitializer:tf.initializers.glorotUniform({seed:s++}),biasInitializer:'zeros'}).apply(x);
  return tf.model({inputs:input,outputs:output,name:'pose_heatmap_v2'});
 }
 function heatmapTargets(samples,size=HEATMAP_SIZE,sigma=1.25){
  const values=new Float32Array(samples.length*size*size*17),mask=new Float32Array(samples.length*17);
  for(let n=0;n<samples.length;n++)for(let j=0;j<17;j++){
   const [x,y,v]=samples[n].keypoints[j];if(!v||x<0||x>1||y<0||y>1)continue;
   mask[n*17+j]=1;const cx=x*(size-1),cy=y*(size-1),radius=Math.ceil(4*sigma);let sum=0;
   const left=Math.max(0,Math.floor(cx-radius)),right=Math.min(size-1,Math.ceil(cx+radius)),top=Math.max(0,Math.floor(cy-radius)),bottom=Math.min(size-1,Math.ceil(cy+radius));
   for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++){const value=Math.exp(-((px-cx)**2+(py-cy)**2)/(2*sigma*sigma));values[((n*size+py)*size+px)*17+j]=value;sum+=value;}
   for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++)values[((n*size+py)*size+px)*17+j]/=sum;
  }
  return{values,mask};
 }
 function heatmapLoss(tf,logits,labels,mask){
  const n=logits.shape[0],pixels=logits.shape[1]*logits.shape[2];
  const logp=tf.logSoftmax(logits.reshape([n,pixels,17]).transpose([0,2,1]),-1);
  return labels.reshape([n,pixels,17]).transpose([0,2,1]).mul(logp).sum(-1).neg().mul(mask).sum().div(mask.sum().maximum(1));
 }
 function decodeHeatmaps(values,count=1,size=HEATMAP_SIZE){
  const coords=new Float32Array(count*34),peaks=new Float32Array(count*17);
  for(let n=0;n<count;n++)for(let j=0;j<17;j++){
   let max=-Infinity;const base=n*size*size*17;
   for(let p=0;p<size*size;p++){const v=values[base+p*17+j];if(v>max)max=v;}
   let all=0;
   for(let p=0;p<size*size;p++)all+=Math.exp(values[base+p*17+j]-max);
   // Spatial expectation avoids unstable jumps between similarly strong peaks.
   let gx=0,gy=0;for(let p=0;p<size*size;p++){const w=Math.exp(values[base+p*17+j]-max);gx+=(p%size)*w;gy+=Math.floor(p/size)*w;}
   coords[n*34+j*2]=gx/all/(size-1);coords[n*34+j*2+1]=gy/all/(size-1);peaks[n*17+j]=1/all;
  }
  return{coords,peaks};
 }
 function meanPose(samples){return NAMES.flatMap((_,j)=>{const points=samples.map(s=>s.keypoints[j]).filter(p=>p[2]>0&&p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1);return points.length?[points.reduce((a,p)=>a+p[0],0)/points.length,points.reduce((a,p)=>a+p[1],0)/points.length]:[.5,.5]});}
 function heatmapPrior(samples,size=HEATMAP_SIZE){
  // A broad location prior fitted ONLY on the selected training labels.
  // It is part of this student's model, exported with the weights, never a pretrained artifact.
  const out=new Float32Array(size*size*17),mean=meanPose(samples);
  for(let j=0;j<17;j++){
   const points=samples.map(s=>s.keypoints[j]).filter(p=>p[2]>0&&p[0]>=0&&p[0]<=1&&p[1]>=0&&p[1]<=1);
   const variance=axis=>Math.max(.0064,points.reduce((a,p)=>a+(p[axis]-mean[j*2+axis])**2,0)/Math.max(1,points.length));
   const vx=variance(0),vy=variance(1);
   for(let y=0;y<size;y++)for(let x=0;x<size;x++)out[(y*size+x)*17+j]=-.5*((x/(size-1)-mean[j*2])**2/vx+(y/(size-1)-mean[j*2+1])**2/vy);
  }
  return out;
 }
 function baselineMetrics(training,evaluation){const pose=meanPose(training);return metrics(evaluation.flatMap(()=>pose),evaluation);}
 function targets(samples){const coords=[],masks=[];for(const s of samples)for(const [x,y,v] of s.keypoints){const valid=v>0&&Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1;coords.push(valid?x:0,valid?y:0);masks.push(valid?1:0,valid?1:0);}return{coords,masks};}
 function metrics(predictions,samples){let squared=0,error=0,correct=0,points=0;const perPoint=Array.from({length:17},()=>({sum:0,n:0,correct:0}));for(let i=0;i<samples.length;i++)for(let j=0;j<17;j++){const[x,y,v]=samples[i].keypoints[j];if(!v||x<0||x>1||y<0||y>1)continue;const dx=predictions[i*34+j*2]-x,dy=predictions[i*34+j*2+1]-y,d=Math.hypot(dx,dy);squared+=dx*dx+dy*dy;error+=d*160;correct+=d<=.1?1:0;points++;perPoint[j].sum+=d*160;perPoint[j].n++;perPoint[j].correct+=d<=.1?1:0;}return{loss:points?squared/(points*2):null,error:points?error/points:null,pck:points?correct/points:null,points,images:samples.length,perPoint:perPoint.map((p,j)=>({name:NAMES[j],n:p.n,error:p.n?p.sum/p.n:null,pck:p.n?p.correct/p.n:null}))};}
 function validateSample(s){if(!s||!Array.isArray(s.keypoints)||s.keypoints.length!==17)throw Error('每个样本必须包含17个关键点。');for(const p of s.keypoints){if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||![0,1,2].includes(p[2]))throw Error('关键点格式应为 [x, y, v]，v为0、1或2。');if(p[2]>0&&(p[0]<0||p[0]>1||p[1]<0||p[1]>1))throw Error('关键点坐标应归一化到0～1。');}if(s.keypoints.filter(p=>p[2]>0).length<6)throw Error('请至少标注6个有效关键点。');if(!['train','valid','test'].includes(s.split))throw Error('数据划分只能是train、valid或test。');}
 const api={NAMES,EN,EDGES,FLIP,INPUT_SIZE,HEATMAP_SIZE,random,shuffle,createModel,targets,heatmapTargets,heatmapLoss,decodeHeatmaps,meanPose,heatmapPrior,baselineMetrics,metrics,validateSample};root.PoseCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
