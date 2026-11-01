(function(){
  if(new URLSearchParams(location.search).get('embed')!=='1'||window.parent===window)return;
  document.body.classList.add('is-embedded');
  window.PoseTrainingVisible=true;
  let scheduled=false,lastHeight=0;
  const send=message=>parent.postMessage(message,location.origin);
  function size(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;const height=Math.ceil(document.body.getBoundingClientRect().height);if(height>=500&&height!==lastHeight){lastHeight=height;send({type:'actionlab-pose-training-size',height})}});
  }
  function status(){const s=window.PoseLab?.state;if(s)send({type:'actionlab-pose-training-status',epoch:s.epoch,running:s.running});size()}
  new ResizeObserver(size).observe(document.body);
  new MutationObserver(status).observe(document.getElementById('statModel'),{childList:true,subtree:true,characterData:true});
  new MutationObserver(status).observe(document.getElementById('statEpoch'),{childList:true,subtree:true,characterData:true});
  addEventListener('poselab-ready',status);
  addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='actionlab-pose-training-visibility')return;
    window.PoseTrainingVisible=event.data.visible===true;
    const s=window.PoseLab?.state;
    if(event.data.visible===false&&s?.running){s.stop=true;document.getElementById('trainingMessage').textContent='已离开描骨辨势，当前批次结束后暂停并保存模型。';}
    if(event.data.visible===true){requestAnimationFrame(size);status();}
  });
  size();
})();
