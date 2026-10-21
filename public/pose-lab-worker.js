/* Real CPython + real ONNX inference, isolated from the classroom UI thread. */
let python,session,image,readyPromise,activeRun=0,busy=false;
const send=(type,data={})=>postMessage({type,runId:activeRun,...data});
const phase=message=>send('phase',{message});
async function init(){
 phase('正在加载 Python 3.12 运行环境…');
 importScripts('/vendor/pyodide/pyodide.js','/vendor/ort/ort.wasm.min.js');
 python=await loadPyodide({indexURL:'/vendor/pyodide/',stdout:line=>send('stdout',{line}),stderr:line=>send('stderr',{line})});
 phase('正在加载 NumPy…');await python.loadPackage('numpy');
 phase('正在准备统一图片与课堂接口…');
 const [moduleResponse,imageResponse]=await Promise.all([fetch('/classroom_yolo.py'),fetch('/pose-lab-assets/classroom-person.png')]);
 if(!moduleResponse.ok||!imageResponse.ok)throw new Error('课堂图片或 Python 接口下载失败。');
 python.FS.writeFile('/home/pyodide/classroom_yolo.py',await moduleResponse.text());
 const {prepareImage}=await import('/pose-lab-inference.js?v=python-1');image=await prepareImage(await imageResponse.blob());
 phase('正在加载 YOLO26n-pose 模型（约 12 MB）…');
 ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths='/vendor/ort/';
 const response=await fetch('/pose-lab-assets/yolo26n-pose.onnx');if(!response.ok)throw new Error('YOLO26 模型下载失败，请重试。');
 const bytes=await response.arrayBuffer();
 session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
 if(!session.inputNames.length||!session.outputNames.length)throw new Error('模型的输入或输出缺失。');
 self._classroom_predict=async(conf,iou,maxDet)=>{
  phase('正在对统一图片执行 YOLO26 姿态推理…');
  const {decodePoseOutput}=await import('/pose-lab-inference.js?v=python-1');
  const start=performance.now();
  const output=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',image.tensor,[1,3,640,640])});
  const tensor=output[session.outputNames[0]],inferenceMs=performance.now()-start;
  const people=decodePoseOutput(tensor.data,tensor.dims,{...image,conf,iou,maxDet});
  const payload={model:'yolo26n-pose.onnx',image:{name:'classroom-person.png',width:image.width,height:image.height},people,inferenceMs,parameters:{conf,iou,maxDet},timestamp:new Date().toISOString()};
  send('inference',{payload});return JSON.stringify(payload);
 };
 self._classroom_show=json=>send('show',JSON.parse(json));
 await python.runPythonAsync('import numpy as np\nnp.set_printoptions(precision=1, suppress=True, linewidth=88)\nimport classroom_yolo');
 send('ready',{version:python.runPython("__import__('sys').version.split()[0]")});
}
onmessage=async event=>{
 if(event.data.type!=='run'||busy)return;
 busy=true;activeRun=event.data.runId;
 try{
  readyPromise ||= init().catch(error=>{readyPromise=null;throw error});await readyPromise;
  send('executing');phase('正在运行 pose_lab.py…');
  python.setStdout({batched:line=>send('stdout',{line})});python.setStderr({batched:line=>send('stderr',{line})});
  const globals=python.runPython("dict(__name__='__main__')");
  try{const value=await python.runPythonAsync(event.data.code,{globals,filename:'pose_lab.py'});value?.destroy?.()}finally{globals.destroy()}
  send('done');
 }catch(error){send('error',{message:String(error?.message||error)})}
 finally{busy=false}
};
