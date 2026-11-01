import '../public/angle-rules-engine.js';

const A = (globalThis as any).AngleRules;
export const RULE_CLASSES = [{id:'horse',name:'马步'},{id:'bow',name:'弓步'}] as const;
export const RULE_OUTCOMES = ['horse','bow','conflict','unmatched','insufficient'];
export function validateSubmission(input:any){
  const rules=A.validateRuleFile(input?.rules),mapping=input?.mapping;
  if(!mapping||typeof mapping.horse!=='string'||typeof mapping.bow!=='string'||mapping.horse===mapping.bow)throw Error('请分别选择马步和弓步对应的两个不同动作。');
  for(const c of RULE_CLASSES){
    const action=rules.actions.find((a:any)=>a.id===mapping[c.id]);
    if(!action?.enabled||!action.groups.some((g:any)=>g.conditions.length))throw Error(c.name+'需要一个已启用、至少有一条角度条件的动作规则。');
  }
  return {rules,mapping:{horse:mapping.horse,bow:mapping.bow}};
}

// Uniform scaling preserves 2D angles. Dividing x and y by different extents does not.
export function normalizeKeypoints(sample:any,threshold:number){
  const scale=Math.max(sample.width,sample.height);
  if(!(scale>0)||!Array.isArray(sample.keypoints)||sample.keypoints.length!==17)throw Error('验证集关键点格式无效。');
  return sample.keypoints.map((p:number[],index:number)=>({index,x:p[0]/scale,y:p[1]/scale,score:p[2],valid:Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[2]>=threshold}));
}
export function evaluateRules(input:any,benchmark:any){
  const clean=validateSubmission(input),actions=RULE_CLASSES.map(c=>({...clean.rules.actions.find((a:any)=>a.id===clean.mapping[c.id]),id:c.id}));
  const confusion=RULE_CLASSES.map(()=>RULE_OUTCOMES.map(()=>0));
  const samples=benchmark.samples.map((sample:any)=>{
    const points=normalizeKeypoints(sample,benchmark.keypointThreshold);
    const result=A.evaluate(points,{actions}),matched=result.actions.filter((a:any)=>a.state==='pass');
    // A competing unknown rule can still match: never award a confident label in this case.
    const outcome=matched.length>1?'conflict':result.actions.some((a:any)=>a.state==='unknown')?'insufficient':matched.length===1?matched[0].id:'unmatched';
    const actual=RULE_CLASSES.findIndex(c=>c.id===sample.label);if(actual<0)throw Error('验证集标签无效。');
    confusion[actual][RULE_OUTCOMES.indexOf(outcome)]++;
    return {id:sample.id,truth:sample.label,prediction:outcome,correct:sample.label===outcome,sourceId:sample.sourceId,sourcePage:sample.sourcePage,
      points:points.map((p:any)=>({x:p.x,y:p.y,score:p.score,valid:p.valid})),
      leftKnee:A.measure(points,[11,13,15]).angle,rightKnee:A.measure(points,[12,14,16]).angle,
      actions:result.actions.map((a:any)=>({id:a.id,name:a.name,state:a.state,groups:a.groups.map((g:any)=>({id:g.id,state:g.state,conditions:g.conditions.map((c:any)=>({label:c.label,points:c.points,expression:A.expression(c),angle:c.angle,state:c.state,reason:c.reason}))}))}))};
  });
  const total=samples.length;if(!total)throw Error('验证集为空。');
  const correct=samples.filter((s:any)=>s.correct).length,recognized=samples.filter((s:any)=>['horse','bow'].includes(s.prediction)).length;
  const perClass=RULE_CLASSES.map((c,i)=>{
    const support=confusion[i].reduce((a,b)=>a+b,0),tp=confusion[i][i],predicted=confusion.reduce((n,row)=>n+row[i],0),precision=predicted?tp/predicted:0,recall=support?tp/support:0;
    return {...c,support,correct:tp,predicted,precision,recall,f1:precision+recall?2*precision*recall/(precision+recall):0};
  });
  return {benchmarkId:benchmark.id,benchmarkDigest:benchmark.digest,total,correct,accuracy:correct/total,coverage:recognized/total,recognized,
    recognizedAccuracy:recognized?correct/recognized:null,macroF1:perClass.reduce((s,c)=>s+c.f1,0)/2,balancedAccuracy:perClass.reduce((s,c)=>s+c.recall,0)/2,
    counts:Object.fromEntries(RULE_OUTCOMES.map(id=>[id,samples.filter((s:any)=>s.prediction===id).length])),classes:RULE_CLASSES,outcomes:RULE_OUTCOMES,confusion,perClass,samples};
}
