
(function(root){
  'use strict';
  const names=['鼻','左眼','右眼','左耳','右耳','左肩','右肩','左肘','右肘','左腕','右腕','左髋','右髋','左膝','右膝','左踝','右踝'];
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function settings(raw){
    const bend=Number(raw.bend),straight=Number(raw.straight),confidence=Number(raw.confidence);
    if(raw.bend===''||raw.straight===''||!finite(bend)||!finite(straight)||bend<=0||straight>=180||bend>=straight)throw new Error('阈值需满足：0° < 弯曲阈值 < 伸直阈值 < 180°。');
    if(raw.confidence===''||!finite(confidence)||confidence<0||confidence>1)throw new Error('最低置信度需在 0 到 1 之间。');
    if(!['visibility','confidence'].includes(raw.thirdMode))throw new Error('请选择第三列含义。');
    if(!['pixel','normalized'].includes(raw.coordinateMode))throw new Error('请选择坐标类型。');
    const width=Number(raw.width),height=Number(raw.height);
    if(raw.coordinateMode==='normalized'&&(!finite(width)||!finite(height)||width<=0||height<=0))throw new Error('归一化坐标需要填写大于 0 的原图宽度和高度。');
    return {...raw,bend,straight,confidence,width,height};
  }
  function extract(value){
    const people=[];let images=[];
    if(value&&typeof value==='object'&&!Array.isArray(value)&&Array.isArray(value.images))images=value.images;
    const looksPoint=p=>p===null||(Array.isArray(p)&&p.length>=2&&!Array.isArray(p[0])&&(p[0]===null||typeof p[0]!=='object'))||(p&&typeof p==='object'&&!Array.isArray(p)&&('x' in p)&&('y' in p));
    const isFlat=a=>Array.isArray(a)&&[34,51].includes(a.length)&&a.every(n=>n===null||typeof n!=='object');
    const isMatrix=a=>Array.isArray(a)&&a.length===17&&a.every(looksPoint);
    function add(k,meta={}){
      if(!isFlat(k)&&!isMatrix(k))throw new Error('每个人需提供 17 个 COCO 点：51 个 x,y,v 值、34 个 x,y 值，或 17 行二/三列。不能使用原课堂材料的 14 点数据。');
      const image=images.find(im=>im.id===meta.image_id)||{};
      people.push({keypoints:k,meta:{id:meta.id,image_id:meta.image_id,image_width:meta.image_width??meta.width??image.width??value.image_width,image_height:meta.image_height??meta.height??image.height??value.image_height},scores:meta.keypoint_scores??meta.keypoints_scores??(Array.isArray(meta.scores)?meta.scores:undefined)});
    }
    function walk(v){
      if(isFlat(v)||isMatrix(v)){add(v);return;}
      if(Array.isArray(v)){
        if(!v.length)throw new Error('输入数组为空。');
        if(v.some(x=>x===null||typeof x!=='object'))throw new Error('数组长度或结构不正确。请提供完整的 COCO 17 点 JSON。');
        v.forEach(walk);return;
      }
      if(v&&typeof v==='object'){
        if('keypoints' in v){add(v.keypoints,v);return;}
        if(Array.isArray(v.annotations)){if(!v.annotations.length)throw new Error('annotations 中没有标注。');v.annotations.forEach(a=>{if(a&&'keypoints' in a)add(a.keypoints,a);});return;}
      }
      throw new Error('未找到 keypoints。请粘贴 COCO 关键点数组、单个人体对象或 annotations 对象。');
    }
    walk(value);
    if(!people.length)throw new Error('没有找到带 keypoints 的人体标注。');
    return people;
  }
  function points(person,opt){
    const k=person.keypoints;
    const rows=k.length===17?k:Array.from({length:17},(_,j)=>k.slice(j*(k.length/17),(j+1)*(k.length/17)));
    if(person.scores!==undefined&&(!Array.isArray(person.scores)||person.scores.length!==17))throw new Error('keypoint_scores 需要包含 17 个得分。');
    return rows.map((r,i)=>{
      const p={index:i,name:names[i],x:null,y:null,value:null,kind:'none',valid:false,plot:false,reason:''};
      if(r===null){p.reason='关键点缺失';return p;}
      let x,y,z,kind=opt.thirdMode;
      if(Array.isArray(r)){
        if(![2,3].includes(r.length))throw new Error('第 '+i+' 点必须为 [x,y] 或 [x,y,v/score]。');
        [x,y,z]=r;if(r.length===2)kind='none';
      }else{
        x=r.x;y=r.y;
        if('score' in r){z=r.score;kind='confidence';}
        else if('visibility' in r){z=r.visibility;kind='visibility';}
        else if('v' in r){z=r.v;kind='visibility';}
        else kind='none';
      }
      if(person.scores!==undefined){z=person.scores[i];kind='confidence';}
      p.kind=kind;p.value=z===undefined?null:z;
      if(!finite(x)||!finite(y)){p.reason='坐标缺失或不是有限数值';return p;}
      p.x=opt.coordinateMode==='normalized'?x*opt.width:x;p.y=opt.coordinateMode==='normalized'?y*opt.height:y;
      if(!finite(p.x)||!finite(p.y)){p.reason='坐标换算溢出';return p;}
      if(kind==='visibility'){
        if(![0,1,2].includes(z))throw new Error('第 '+i+' 点的第三列不是 COCO v=0/1/2。若第三列是模型得分，请切换到“模型置信度”。');
        if(z===0){p.reason='v=0，未标注';return p;}
        p.plot=true;
        if(z===1&&!opt.allowOccluded){p.reason='v=1，遮挡点未启用';return p;}
        p.reason=z===1?'有效（采用遮挡标注）':'有效';
      }else if(kind==='confidence'){
        if(!finite(z)||z<0||z>1)throw new Error('第 '+i+' 点的置信度必须是 0 到 1 的数值。若第三列是 0/1/2 可见性，请切回 COCO 模式。');
        if(z===0){p.reason='置信度为 0';return p;}
        p.plot=true;
        if(z<opt.confidence){p.reason='置信度 '+z.toFixed(2)+' < '+opt.confidence;return p;}
        p.reason='有效';
      }else{p.plot=true;p.reason='有效（仅坐标）';}
      p.valid=true;return p;
    });
  }
  function knee(p,side){
    const ids=side==='left'?[11,13,15]:[12,14,16];
    const bad=ids.filter(i=>!p[i].valid);
    if(bad.length)return {angle:null,ids,reason:bad.map(i=>p[i].name+'：'+p[i].reason).join('；')};
    const [a,b,c]=ids.map(i=>p[i]);const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y];
    const nu=Math.hypot(...u),nv=Math.hypot(...v);
    if(nu<=1e-10||nv<=1e-10)return {angle:null,ids,reason:'髋点或踝点与膝点重合，无法定义夹角'};
    const cosine=(u[0]/nu)*(v[0]/nv)+(u[1]/nu)*(v[1]/nv);
    const angle=Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI;
    return {angle,ids,reason:''};
  }
  function state(a,opt){if(a===null)return '无法计算';return a<opt.bend?'明显弯曲':a>opt.straight?'接近伸直':'中间区间';}
  function classify(left,right,opt){
    if(left===null||right===null)return {code:'insufficient',title:'信息不足',reason:'至少一侧膝角无法计算，需要两侧髋、膝、踝共六个有效点。'};
    if(left<opt.bend&&right<opt.bend)return {code:'horse',title:'马步式姿态',reason:'两侧膝角均小于 '+opt.bend+'°，两腿都明显弯曲。'};
    if(Math.min(left,right)<opt.bend&&Math.max(left,right)>opt.straight)return {code:'bow',title:'弓步式姿态',reason:(left<right?'人体左腿弯曲，右腿接近伸直。':'人体右腿弯曲，左腿接近伸直。')+'符合一弯一直的规则。'};
    return {code:'unknown',title:'暂不确定',reason:left>opt.straight&&right>opt.straight?'两腿均接近伸直，不满足当前马步式或弓步式规则。':'至少一侧处于中间区间或阈值边界，未匹配当前规则。'};
  }
  function analyze(person,raw){const opt=settings(raw),p=points(person,opt),left=knee(p,'left'),right=knee(p,'right');return {options:opt,points:p,left,right,result:classify(left.angle,right.angle,opt),difference:left.angle!==null&&right.angle!==null?Math.abs(left.angle-right.angle):null};}
  root.KneeLab=Object.freeze({names,settings,extract,points,knee,state,classify,analyze});
})(globalThis);
