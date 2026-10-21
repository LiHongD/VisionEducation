export const POINT_NAMES=['鼻尖','左眼','右眼','左耳','右耳','左肩','右肩','左肘','右肘','左手腕','右手腕','左髋','右髋','左膝','右膝','左踝','右踝'];
export const SKELETON=[[15,13],[13,11],[16,14],[14,12],[11,12],[5,11],[6,12],[5,6],[5,7],[6,8],[7,9],[8,10],[1,2],[0,1],[0,2],[1,3],[2,4],[3,5],[4,6]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function intersectionOverUnion(a,b){
 const intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 const area=r=>Math.max(0,r[2]-r[0])*Math.max(0,r[3]-r[1]);return intersection/(area(a)+area(b)-intersection||1);
}
export function decodePoseOutput(data,dims,options){
 const {width,height,scale,padX,padY,conf=.25,iou=.45,maxDet=10}=options;
 let rows,cols,at,endToEnd;
 if(dims.length===3&&dims[1]===56){rows=dims[2];cols=56;at=(row,col)=>data[col*rows+row];endToEnd=false}
 else if(dims.length===3&&dims[2]===57){rows=dims[1];cols=57;at=(row,col)=>data[row*cols+col];endToEnd=true}
 else throw new Error('不支持的 YOLO26 输出形状：'+JSON.stringify(dims));
 const candidates=[];
 for(let row=0;row<rows;row++){
  const score=at(row,4);if(!Number.isFinite(score)||score<conf)continue;
  if(endToEnd&&Math.round(at(row,5))!==0)continue;
  let box;
  if(endToEnd)box=[at(row,0),at(row,1),at(row,2),at(row,3)];
  else {const x=at(row,0),y=at(row,1),w=at(row,2),h=at(row,3);box=[x-w/2,y-h/2,x+w/2,y+h/2]}
  box=box.map((v,k)=>clamp((v-(k%2?padY:padX))/scale,0,k%2?height:width));
  const offset=endToEnd?6:5;
  const keypoints=Array.from({length:17},(_,i)=>[
   clamp((at(row,offset+i*3)-padX)/scale,0,width),
   clamp((at(row,offset+i*3+1)-padY)/scale,0,height),
   clamp(at(row,offset+i*3+2),0,1)
  ]);
  if(box.every(Number.isFinite)&&keypoints.flat().every(Number.isFinite))candidates.push({score,box,keypoints});
 }
 candidates.sort((a,b)=>b.score-a.score);const people=[];
 for(const p of candidates){if(!endToEnd&&people.some(q=>intersectionOverUnion(p.box,q.box)>iou))continue;people.push(p);if(people.length>=maxDet)break}
 return people;
}
export async function prepareImage(blob,size=640){
 const bitmap=await createImageBitmap(blob),width=bitmap.width,height=bitmap.height,scale=Math.min(size/width,size/height);
 const resizedWidth=Math.round(width*scale),resizedHeight=Math.round(height*scale),padX=Math.round((size-resizedWidth)/2-.1),padY=Math.round((size-resizedHeight)/2-.1);
 const canvas=new OffscreenCanvas(size,size),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,size,size);ctx.drawImage(bitmap,0,0,width,height,padX,padY,resizedWidth,resizedHeight);bitmap.close();
 const rgba=ctx.getImageData(0,0,size,size).data,plane=size*size,tensor=new Float32Array(plane*3);
 for(let i=0;i<plane;i++){tensor[i]=rgba[i*4]/255;tensor[plane+i]=rgba[i*4+1]/255;tensor[2*plane+i]=rgba[i*4+2]/255}
 return {tensor,width,height,scale,padX,padY};
}
