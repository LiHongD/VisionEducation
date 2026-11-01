/* One browser can be shared by different classroom members. */
(function(){
  const requested=new URLSearchParams(location.search).get('draft');
  const scope=requested&&requested.length<=512?requested:'actionlab-wushu-v2';
  const prefix='actionlab-pose-training:'+scope+':';
  window.PoseStorage=Object.freeze({scope,localKey:name=>prefix+name,modelURL:'indexeddb://actionlab-pose-training-'+encodeURIComponent(scope)});
})();
