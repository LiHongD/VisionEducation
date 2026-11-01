'use strict';
// Keep this host outside the re-rendered lesson content so switching lessons
// preserves the iframe's model, canvases and unsaved annotations.
let poseTrainingHost, poseTrainingDraft, poseCodeTail;
function syncPoseTrainingLab(){
  const onLesson=page===2;
  if(poseTrainingHost&&poseTrainingDraft!==draftStorageKey){poseTrainingHost.remove();poseTrainingHost=null;}
  if(!poseTrainingHost&&onLesson){
    poseTrainingDraft=draftStorageKey;
    const url='/pose-training/index.html?embed=1&draft='+encodeURIComponent(poseTrainingDraft);
    poseTrainingHost=document.createElement('section');
    poseTrainingHost.id='pose-training-lab';
    poseTrainingHost.className='pose-training-lab panel';
    poseTrainingHost.setAttribute('aria-labelledby','pose-training-title');
    poseTrainingHost.innerHTML=`<div class="pose-training-heading"><div><span class="eyebrow">FROM LABELS TO LEARNING / 拓展实验</span><h2 id="pose-training-title">这一次，亲手训练一个找点的模型。</h2><p>先从随机权重出发，让自己的模型学习“图片 → 17 个关键点”；再在下方用 Python 调用现成模型，比较训练与使用的区别。</p></div><a class="pose-training-open" href="${url}" target="_blank" rel="noopener">独立打开 ↗</a></div><div class="pose-training-intro"><div class="pose-training-path"><span><b>01</b>认识真实数据</span><i>→</i><span><b>02</b>亲手标注</span><i>→</i><span><b>03</b>从零训练</span><i>→</i><span><b>04</b>新图预测</span></div><div class="pose-training-facts"><span>72 张真实图片 · COCO 17 点</span><span>训练 / 验证 / 测试 = 48 / 12 / 12</span><span>随机初始化 CNN · 浏览器本机计算</span></div><div class="pose-training-start-row"><button class="primary" data-pose-start>进入从零训练实验 ↓</button><span>建议另用一节 45 分钟实践课，也可先用 8 张、5 轮体验。</span></div></div><div data-pose-frame-slot></div><p class="pose-training-note" data-pose-status role="status">图片、标注和模型在当前学生的本机浏览器中处理与保存；可导出模型、关键点和实验报告。小样本模型用于理解学习过程。</p>`;
    document.getElementById('content').insertAdjacentElement('afterend',poseTrainingHost);
    poseTrainingHost.querySelector('[data-pose-start]').onclick=()=>{
      const frame=document.createElement('iframe');
      frame.id='pose-training-frame';frame.title='从零训练人体姿态估计模型：数据、标注、训练与17点预测';
      frame.src=url;frame.height='1150';
      poseTrainingHost.querySelector('[data-pose-frame-slot]').appendChild(frame);
      poseTrainingHost.querySelector('.pose-training-start-row').hidden=true;
      poseTrainingHost.querySelector('[data-pose-status]').textContent='正在准备本机训练引擎和课堂数据…';
    };
  }
  if(poseTrainingHost){
    poseTrainingHost.hidden=!onLesson;
    poseTrainingHost.querySelector('iframe')?.contentWindow?.postMessage({type:'actionlab-pose-training-visibility',visible:onLesson},location.origin);
    if(onLesson){
      const code=document.getElementById('pose-code-lab');
      if(code){
        if(poseTrainingHost.nextElementSibling!==code)poseTrainingHost.insertAdjacentElement('afterend',code);
        poseCodeTail=code;
      }
    }
  }
  if(poseCodeTail)poseCodeTail.hidden=!onLesson;
}
const poseTrainingLegacyRender=render;
render=function(...args){
  // The code experiment is recreated by the legacy lesson render; remove its
  // previous trailing host first so IDs and editors cannot accumulate.
  poseCodeTail?.remove();poseCodeTail=null;
  poseTrainingLegacyRender(...args);syncPoseTrainingLab();
};
// Classroom/teacher portals bypass render(), but still need to hide/pause it.
addEventListener('hashchange',syncPoseTrainingLab);
addEventListener('message',event=>{
  const frame=poseTrainingHost?.querySelector('iframe');
  if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin)return;
  if(event.data?.type==='actionlab-pose-training-size'){
    const height=event.data.height;
    if(typeof height==='number'&&Number.isFinite(height)&&height>=500&&height<=15000)frame.style.height=Math.ceil(height)+'px';
  }
  if(event.data?.type==='actionlab-pose-training-status'){
    const epoch=Number(event.data.epoch);
    if(!Number.isInteger(epoch)||epoch<0||epoch>100000)return;
    poseTrainingHost.querySelector('[data-pose-status]').textContent=event.data.running?'正在本机训练。离开本模块会在当前批次结束后暂停并保存。':(epoch?`已完成 ${epoch} 轮训练。模型保存在当前学生的本机浏览器中；可导出模型与实验报告。`:'训练引擎已就绪。先看数据与标签，再从随机权重开始训练；上传图片不发送到服务器。');
  }
});
syncPoseTrainingLab();
