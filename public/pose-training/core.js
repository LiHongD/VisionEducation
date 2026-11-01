/* PoseLab: actual supervised coordinate regression, no pretrained weights. */
(function(root){
 const NAMES=['鼻子','左眼','右眼','左耳','右耳','左肩','右肩','左肘','右肘','左腕','右腕','左髋','右髋','左膝','右膝','左踝','右踝'];
 const EN=['nose','left_eye','right_eye','left_ear','right_ear','left_shoulder','right_shoulder','left_elbow','right_elbow','left_wrist','right_wrist','left_hip','right_hip','left_knee','right_knee','left_ankle','right_ankle'];
 const EDGES=[[0,1],[0,2],[1,3],[2,4],[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]];
 const FLIP=[0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15];
 function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
 function shuffle(items,seed){const out=[...items],r=random(seed);for(let i=out.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
 function createModel(tf,seed=42){
  const model=tf.sequential();let s=seed;
  for(const [i,filters] of [12,20,28].entries())model.add(tf.layers.conv2d({...(i===0?{inputShape:[64,64,3]}:{}),filters,kernelSize:5,strides:2,padding:'same',activation:'relu',kernelInitializer:tf.initializers.glorotUniform({seed:s++}),biasInitializer:'zeros'}));
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({units:64,activation:'relu',kernelInitializer:tf.initializers.glorotUniform({seed:s++})}));
  model.add(tf.layers.dense({units:34,activation:'sigmoid',kernelInitializer:tf.initializers.glorotUniform({seed:s++})}));
  return model;
 }
 function targets(samples){const coords=[],masks=[];for(const s of samples)for(const [x,y,v] of s.keypoints){const valid=v>0&&Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=1&&y>=0&&y<=1;coords.push(valid?x:0,valid?y:0);masks.push(valid?1:0,valid?1:0);}return{coords,masks};}
 function metrics(predictions,samples){let squared=0,error=0,correct=0,points=0;const perPoint=Array.from({length:17},()=>({sum:0,n:0,correct:0}));for(let i=0;i<samples.length;i++)for(let j=0;j<17;j++){const[x,y,v]=samples[i].keypoints[j];if(!v||x<0||x>1||y<0||y>1)continue;const dx=predictions[i*34+j*2]-x,dy=predictions[i*34+j*2+1]-y,d=Math.hypot(dx,dy);squared+=dx*dx+dy*dy;error+=d*160;correct+=d<=.1?1:0;points++;perPoint[j].sum+=d*160;perPoint[j].n++;perPoint[j].correct+=d<=.1?1:0;}return{loss:points?squared/(points*2):null,error:points?error/points:null,pck:points?correct/points:null,points,images:samples.length,perPoint:perPoint.map((p,j)=>({name:NAMES[j],n:p.n,error:p.n?p.sum/p.n:null,pck:p.n?p.correct/p.n:null}))};}
 function validateSample(s){if(!s||!Array.isArray(s.keypoints)||s.keypoints.length!==17)throw Error('每个样本必须包含17个关键点。');for(const p of s.keypoints){if(!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)||![0,1,2].includes(p[2]))throw Error('关键点格式应为 [x, y, v]，v为0、1或2。');if(p[2]>0&&(p[0]<0||p[0]>1||p[1]<0||p[1]>1))throw Error('关键点坐标应归一化到0～1。');}if(s.keypoints.filter(p=>p[2]>0).length<6)throw Error('请至少标注6个有效关键点。');if(!['train','valid','test'].includes(s.split))throw Error('数据划分只能是train、valid或test。');}
 const api={NAMES,EN,EDGES,FLIP,random,shuffle,createModel,targets,metrics,validateSample};root.PoseCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
