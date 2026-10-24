(function(root){
  'use strict';
  const PRESETS=[
    {id:'left_shoulder',name:'左肩角',points:[7,5,11],side:'left'},
    {id:'right_shoulder',name:'右肩角',points:[8,6,12],side:'right'},
    {id:'left_elbow',name:'左肘角',points:[5,7,9],side:'left'},
    {id:'right_elbow',name:'右肘角',points:[6,8,10],side:'right'},
    {id:'left_hip',name:'左髋角',points:[5,11,13],side:'left'},
    {id:'right_hip',name:'右髋角',points:[6,12,14],side:'right'},
    {id:'left_knee',name:'左膝角',points:[11,13,15],side:'left'},
    {id:'right_knee',name:'右膝角',points:[12,14,16],side:'right'}
  ];
  const OPS={gte:'≥',lte:'≤',gt:'>',lt:'<',between:'区间',eq:'≈'};
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const copy=x=>JSON.parse(JSON.stringify(x));
  const uid=()=>root.crypto&&typeof root.crypto.randomUUID==='function'?root.crypto.randomUUID():'r-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  const angleKey=ids=>[Math.min(ids[0],ids[2]),ids[1],Math.max(ids[0],ids[2])].join('-');
  function defaultRules(){
    const c=(id,preset,op,value)=>({id,label:PRESETS.find(p=>p.id===preset).name,points:PRESETS.find(p=>p.id===preset).points.slice(),op,value});
    return {schema:'coco-angle-rules/v1',version:1,actions:[
      {id:'horse',name:'马步式',enabled:true,groups:[{id:'horse-g1',conditions:[c('horse-l','left_knee','lt',155),c('horse-r','right_knee','lt',155)]}]},
      {id:'bow',name:'弓步式',enabled:true,groups:[
        {id:'bow-g1',conditions:[c('bow-l1','left_knee','lt',155),c('bow-r1','right_knee','gt',165)]},
        {id:'bow-g2',conditions:[c('bow-r2','right_knee','lt',155),c('bow-l2','left_knee','gt',165)]}
      ]}
    ]};
  }
  function validateRuleFile(input){
    if(!input||input.schema!=='coco-angle-rules/v1'||input.version!==1||!Array.isArray(input.actions))throw new Error('不是有效的动作规则文件。需要 coco-angle-rules/v1 格式；关键点数据请在“数据与膝角”页导入。');
    if(input.actions.length>60)throw new Error('最多可导入 60 个动作。');
    const usedActions=new Set();let count=0;
    const actions=input.actions.map((a,i)=>{
      if(!a||typeof a.id!=='string'||!a.id||usedActions.has(a.id))throw new Error('动作编号为空或重复。');
      usedActions.add(a.id);
      if(typeof a.name!=='string'||!a.name.trim()||a.name.length>80)throw new Error('动作 '+(i+1)+' 需要 1 到 80 个字符的名称。');
      if(typeof a.enabled!=='boolean'||!Array.isArray(a.groups)||a.groups.length>20)throw new Error('动作的启用设置或情况分组不正确。');
      const groupsSeen=new Set();const conditionIds=new Set();
      const groups=a.groups.map(g=>{
        if(!g||typeof g.id!=='string'||!g.id||groupsSeen.has(g.id)||!Array.isArray(g.conditions))throw new Error('情况分组编号为空、重复，或缺少条件列表。');
        groupsSeen.add(g.id);
        const conditions=g.conditions.map(c=>{
          count++;if(count>600)throw new Error('最多可导入 600 条角度条件。');
          if(!c||typeof c.id!=='string'||!c.id||conditionIds.has(c.id))throw new Error('同一动作中存在空白或重复的条件编号。');
          conditionIds.add(c.id);
          if(typeof c.label!=='string'||!c.label.trim()||c.label.length>80)throw new Error('角度条件需要有效名称。');
          if(!Array.isArray(c.points)||c.points.length!==3||c.points.some(j=>!Number.isInteger(j)||j<0||j>16)||new Set(c.points).size!==3)throw new Error('每个角度需要三个不同的 COCO 编号，范围为 0 到 16。');
          if(!Object.hasOwn(OPS,c.op)||!finite(c.value)||c.value<0||c.value>180)throw new Error('比较方式或角度值不正确；角度必须在 0 到 180°。');
          const clean={id:c.id,label:c.label.trim(),points:c.points.slice(),op:c.op,value:c.value};
          if(c.op==='between'){if(!finite(c.upper)||c.upper<c.value||c.upper>180)throw new Error('区间上限需不小于下限且不超过 180°。');clean.upper=c.upper;}
          if(c.op==='eq'){if(!finite(c.tolerance)||c.tolerance<0||c.tolerance>180)throw new Error('近似相等的容差必须在 0 到 180°。');clean.tolerance=c.tolerance;}
          return clean;
        });
        const cleanGroup={id:g.id,conditions};
        if(g.reference_pose!==undefined){
          if(!Array.isArray(g.reference_pose)||g.reference_pose.length!==17||g.reference_pose.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!finite(v)||v<0||v>620)))throw new Error('参考姿态需要 17 个二维点，画布坐标范围为 0 到 620。');
          cleanGroup.reference_pose=g.reference_pose.map(p=>p.slice());
        }
        return cleanGroup;
      });
      return {id:a.id,name:a.name.trim(),enabled:a.enabled,groups};
    });
    return {schema:'coco-angle-rules/v1',version:1,actions};
  }
  function measure(points,ids){
    if(!points)return {angle:null,reason:'尚无有效的输入数据'};
    const missing=ids.filter(i=>!points[i]||!points[i].valid);
    if(missing.length)return {angle:null,reason:missing.map(i=>(points[i]?.name||'点 '+i)+'：'+(points[i]?.reason||'缺失')).join('；')};
    const [a,b,c]=ids.map(i=>points[i]);
    const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y],nu=Math.hypot(...u),nv=Math.hypot(...v);
    if(!finite(nu)||!finite(nv)||nu<=1e-10||nv<=1e-10)return {angle:null,reason:'顶点与端点重合或坐标差过大，无法计算夹角'};
    const cosine=(u[0]/nu)*(v[0]/nv)+(u[1]/nu)*(v[1]/nv);
    return {angle:Math.acos(Math.max(-1,Math.min(1,cosine)))*180/Math.PI,reason:''};
  }
  function compare(angle,c){
    if(angle===null||!finite(angle))return 'unknown';
    // A 1e-9 degree tolerance prevents floating-point noise at an exact boundary.
    const eps=1e-9;
    const result={gte:()=>angle>=c.value-eps,lte:()=>angle<=c.value+eps,gt:()=>angle>c.value+eps,lt:()=>angle<c.value-eps,between:()=>angle>=c.value-eps&&angle<=c.upper+eps,eq:()=>Math.abs(angle-c.value)<=c.tolerance+eps}[c.op]();
    return result?'pass':'fail';
  }
  function evaluateCondition(points,c){const m=measure(points,c.points);return {...c,...m,state:compare(m.angle,c)};}
  function evaluateAction(points,a){
    const groups=a.groups.map(g=>{
      const conditions=g.conditions.map(c=>evaluateCondition(points,c));
      const state=!conditions.length?'unconfigured':conditions.some(c=>c.state==='fail')?'fail':conditions.some(c=>c.state==='unknown')?'unknown':'pass';
      return {...g,conditions,state};
    });
    const active=groups.filter(g=>g.conditions.length);
    const state=!a.enabled?'disabled':!active.length?'unconfigured':active.some(g=>g.state==='pass')?'pass':active.some(g=>g.state==='unknown')?'unknown':'fail';
    return {...a,groups,state};
  }
  function evaluate(points,rules){
    const actions=rules.actions.map(a=>evaluateAction(points,a)),matches=actions.filter(a=>a.state==='pass'),unknowns=actions.filter(a=>a.state==='unknown');
    return {actions,matches:matches.map(a=>({id:a.id,name:a.name})),unknowns:unknowns.map(a=>({id:a.id,name:a.name})),state:matches.length>1?'multiple':matches.length===1?'matched':unknowns.length?'unknown':'none'};
  }
  function expression(c){if(c.op==='between')return c.value+'° ≤ 角度 ≤ '+c.upper+'°';if(c.op==='eq')return '≈ '+c.value+'°（±'+c.tolerance+'°）';return OPS[c.op]+' '+c.value+'°';}
  root.AngleRules=Object.freeze({PRESETS,OPS,uid,angleKey,copy,defaultRules,validateRuleFile,measure,compare,evaluateCondition,evaluateAction,evaluate,expression});
})(globalThis);
