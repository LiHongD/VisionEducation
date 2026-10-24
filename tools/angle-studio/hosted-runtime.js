// Reuse the course's pinned assets; every file remains below the hosting limit.
async function getHostedRuntime(){
  const urls=['/vendor/ort/ort.wasm.min.js','/vendor/ort/ort-wasm-simd-threaded.mjs','/vendor/ort/ort-wasm-simd-threaded.wasm','/pose-lab-assets/yolo26n-pose.onnx'];
  const assets=await Promise.all(urls.map(async(url,i)=>{
    const response=await fetch(url);
    if(!response.ok)throw new Error('模型资源加载失败，请刷新重试。');
    return i<2?response.text():response.arrayBuffer();
  }));
  return {ort:assets[0],mjs:assets[1],wasm:assets[2],model:assets[3]};
}
