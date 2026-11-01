/* One browser can be shared by different classroom members. */
(function(){
  const requested=new URLSearchParams(location.search).get('draft');
  const scope=requested&&requested.length<=512?requested:'actionlab-wushu-v2';
  const prefix='actionlab-pose-training:'+scope+':';
  // getRandomValues also works on a school's HTTP LAN; randomUUID requires HTTPS.
  const newSampleId=()=>{const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);return 'student-'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};
  window.PoseStorage=Object.freeze({scope,localKey:name=>prefix+name,modelURL:'indexeddb://actionlab-pose-training-'+encodeURIComponent(scope)+'-heatmap-v2',newSampleId});
})();
