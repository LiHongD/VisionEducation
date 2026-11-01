'use strict';
function angleRuleLab(){
  const key=encodeURIComponent(draftStorageKey);
  return `<section id="angle-rule-lab" class="angle-rule-lab panel" aria-labelledby="angle-rule-title"><div class="angle-lab-heading"><div><span class="eyebrow">POSE → ANGLE → RULE / 先摆姿，再成规</span><h2 id="angle-rule-title">拖动关节点，把姿态变成规则。</h2><p>① 拖动关键点看角度　② 为动作设置条件　③ 上传图片，检测关键点并检验。</p></div><a href="/angle-studio/index.html?draft=${key}#rules" target="_blank" rel="noopener" class="angle-lab-open">独立打开 ↗</a></div><iframe id="angle-studio-frame" title="量势成规：可拖拽关键点、角度规则与图片检验实验台" src="/angle-studio/index.html?embed=1&draft=${key}#rules" height="1200"></iframe><p class="angle-lab-note">姿态和规则自动保存在当前浏览器；图片在本机检测。请将角度规则用于课堂验证，并结合视角和关键点置信度解释结果。</p></section>`;
}
ruleLab=function(){return angleRuleLab()};
addEventListener('message',event=>{
  const frame=document.getElementById('angle-studio-frame');
  if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.type!=='actionlab-angle-studio-size')return;
  const height=event.data.height;
  if(typeof height==='number'&&Number.isFinite(height)&&height>=200&&height<=20000)frame.style.height=Math.ceil(height)+'px';
});
if(page===4)render();
