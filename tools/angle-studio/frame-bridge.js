(function(){
  const embedded=new URLSearchParams(location.search).get('embed')==='1';
  if(!embedded)return;
  let queued=false,lastHeight=0;
  function resize(){queued=false;const shell=document.querySelector('.app-shell');const height=Math.ceil(shell.getBoundingClientRect().height)+2;if(height===lastHeight)return;lastHeight=height;parent.postMessage({type:'actionlab-angle-studio-size',height},location.origin);}
  function schedule(){if(!queued){queued=true;requestAnimationFrame(resize)}}
  new ResizeObserver(schedule).observe(document.querySelector('.app-shell'));
  addEventListener('resize',schedule);schedule();
})();
