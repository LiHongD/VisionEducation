let poseSession=null;
const phase=message=>self.postMessage({type:'phase',message});
function decodePeople(data,dims,meta,conf=.25){
  const {width,height,scale,padX,padY}=meta,clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const end=dims.length===3&&dims[2]===57;
  if(!end&&!(dims.length===3&&dims[1]===56))throw new Error('模型输出形状不受支持：'+JSON.stringify(dims));
  const rows=end?dims[1]:dims[2],cols=end?57:56,at=(r,c)=>end?data[r*cols+c]:data[c*rows+r];
  const candidates=[];
  for(let r=0;r<rows;r++){
    const score=at(r,4);if(!Number.isFinite(score)||score<conf)continue;if(end&&Math.round(at(r,5))!==0)continue;
    let box=end?[at(r,0),at(r,1),at(r,2),at(r,3)]:[at(r,0)-at(r,2)/2,at(r,1)-at(r,3)/2,at(r,0)+at(r,2)/2,at(r,1)+at(r,3)/2];
    box=box.map((v,i)=>clamp((v-(i%2?padY:padX))/scale,0,i%2?height:width));
    const offset=end?6:5,keypoints=Array.from({length:17},(_,i)=>[clamp((at(r,offset+i*3)-padX)/scale,0,width-1),clamp((at(r,offset+i*3+1)-padY)/scale,0,height-1),clamp(at(r,offset+i*3+2),0,1)]);
    if(box.every(Number.isFinite)&&keypoints.flat().every(Number.isFinite))candidates.push({score,box,keypoints});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const iou=(a,b)=>{const area=v=>Math.max(0,v[2]-v[0])*Math.max(0,v[3]-v[1]);const inter=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));return inter/(area(a)+area(b)-inter||1);};
  const people=[];for(const p of candidates){if(!end&&people.some(q=>iou(p.box,q.box)>.45))continue;people.push(p);if(people.length>=10)break;}return people;
}
async function prepareBitmap(blob){
  const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'}),width=bitmap.width,height=bitmap.height,size=640;
  const scale=Math.min(size/width,size/height),rw=Math.round(width*scale),rh=Math.round(height*scale),padX=Math.round((size-rw)/2-.1),padY=Math.round((size-rh)/2-.1);
  const canvas=new OffscreenCanvas(size,size),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#727272';ctx.fillRect(0,0,size,size);ctx.drawImage(bitmap,0,0,width,height,padX,padY,rw,rh);bitmap.close();
  const rgba=ctx.getImageData(0,0,size,size).data,plane=size*size,tensor=new Float32Array(3*plane);
  for(let i=0;i<plane;i++){tensor[i]=rgba[i*4]/255;tensor[plane+i]=rgba[i*4+1]/255;tensor[2*plane+i]=rgba[i*4+2]/255;}
  return {width,height,scale,padX,padY,tensor};
}
self.onmessage=async({data:d})=>{
  try{
    if(d.type==='init'){
      phase('正在初始化人体关键点模型…');
      ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
      const moduleURL=URL.createObjectURL(new Blob([d.mjs],{type:'text/javascript'}));
      const wasmURL=URL.createObjectURL(new Blob([d.wasm],{type:'application/wasm'}));
      ort.env.wasm.wasmPaths={mjs:moduleURL,wasm:wasmURL};
      poseSession=await ort.InferenceSession.create(new Uint8Array(d.model),{executionProviders:['wasm'],graphOptimizationLevel:'all'});
      URL.revokeObjectURL(moduleURL);URL.revokeObjectURL(wasmURL);self.postMessage({type:'ready'});return;
    }
    if(d.type==='detect'){
      if(!poseSession)throw new Error('模型尚未准备好。');phase('正在检测人体与 COCO 17 个关键点…');
      const image=await prepareBitmap(d.blob),started=performance.now();
      const output=await poseSession.run({[poseSession.inputNames[0]]:new ort.Tensor('float32',image.tensor,[1,3,640,640])});
      const result=output[poseSession.outputNames[0]],people=decodePeople(result.data,result.dims,image,d.conf??.25);
      self.postMessage({type:'result',requestId:d.requestId,people,width:image.width,height:image.height,inferenceMs:performance.now()-started,outputShape:result.dims});
      Object.values(output).forEach(t=>t.dispose?.());
    }
  }catch(e){self.postMessage({type:'error',requestId:d.requestId,message:e.message||String(e)});}
};
