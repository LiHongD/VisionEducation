import {EXAMPLES,LOCAL_EXAMPLE} from './pose-lab-snippets.js';
import {POINT_NAMES,SKELETON} from './pose-lab-inference.js';
let current,editorPromise;
function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('代码编辑器载入失败'));document.head.append(s)})}
function editorAssets(){return editorPromise ||= (async()=>{if(window.CodeMirror)return;const link=document.createElement('link');link.rel='stylesheet';link.href='/vendor/codemirror/codemirror.css';document.head.append(link);await script('/vendor/codemirror/codemirror.js');await script('/vendor/codemirror/python.js')})().catch(error=>{editorPromise=null;throw error})}
function downloadFile(name,text,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
export function mountPoseCodeLab(host,{draftKey='pose-python-draft-v1'}={}){
 if(!host||current?.host===host)return;current?.dispose();
 host.className='pose-code-lab panel';
 host.innerHTML=`<div class="pylab-heading"><div><span class="eyebrow">从人工描点 · 到模型预测</span><h2 id="pose-code-title">让代码，替你找到关节点。</h2><p>全班用同一张图片。亲手写 Python，调用 YOLO26，看看模型找到了哪些点。</p></div><span class="pylab-model">YOLO26n-pose<small>17 点 · 真实模型推理</small></span></div>
 <div class="pylab-guide"><span><b>01</b> 读代码</span><i>→</i><span><b>02</b> 点运行</span><i>→</i><span><b>03</b> 对照图与坐标</span><i>→</i><span><b>04</b> 改参数再验证</span></div>
 <div class="pylab-workbench"><div class="pylab-coding"><div class="pylab-example-tabs" role="group" aria-label="载入 Python 示例">${EXAMPLES.map(x=>`<button type="button" data-example="${x.id}" class="${x.id===EXAMPLES[0].id?'active':''}">${x.label}</button>`).join('')}</div>
 <div class="pylab-editor"><div class="pylab-file"><span><i></i> pose_lab.py</span><small>Python 3.12 · 浏览器运行</small></div><label class="sr-only" for="pose-python-code">Python 代码编辑器</label><textarea id="pose-python-code" data-editor spellcheck="false" aria-label="Python 代码编辑器"></textarea></div>
 <div class="pylab-actions"><button type="button" class="primary pylab-run" data-run>▶ 运行代码 <kbd>Ctrl ↵</kbd></button><button type="button" data-stop disabled>■ 停止</button><button type="button" data-restore>还原示例</button><button type="button" data-save-code>↓ 代码</button></div>
 <div class="pylab-runtime" role="status" data-status><span></span>准备就绪 · 首次运行将加载 Python 与模型，请稍候</div>
 <div class="pylab-terminal"><div><span>TERMINAL / 终端输出</span><button type="button" data-clear aria-label="清空终端输出">清空</button></div><pre data-console aria-label="Python 终端输出" tabindex="0">点击「运行代码」，执行上方的 Python。\n在这里查看 print 输出与真实 Python 报错。</pre></div></div>
 <div class="pylab-observation"><div class="pylab-image-heading"><div><span class="eyebrow">全班统一图片</span><b>classroom-person.png</b></div><a href="/pose-lab-assets/classroom-person.png" download="classroom-person.png" aria-label="下载课堂统一图片">↓ 图片</a></div><div class="pylab-picture"><canvas width="512" height="512" data-canvas role="img" aria-label="统一站立人物图片；运行代码后在此显示预测关键点"></canvas><span data-image-note>等待运行 · 尚未识别</span></div>
 <div class="pylab-view-toggle" role="group" aria-label="切换图片显示"><button type="button" data-view="original" aria-pressed="true">原图</button><button type="button" data-view="pose" aria-pressed="false" disabled>关键点与骨架</button></div>
 <div class="pylab-summary" data-summary>模型会从图像预测坐标，结果尚未生成。</div><div class="pylab-result-tools"><button type="button" data-export disabled>↓ 运行记录</button><span data-time></span></div>
 <details class="pylab-points"><summary>查看 17 点坐标与置信度 <span data-point-count>等待运行</span></summary><p>坐标以原图左上角为原点，x 向右、y 向下，单位为像素。置信度不是深度 z。</p><label class="pylab-person-label" hidden data-person-label>选择人物 <select data-person aria-label="选择检测到的人物"></select></label><div class="pylab-table-wrap"><table><thead><tr><th>点 / 编号</th><th>x</th><th>y</th><th>置信度</th></tr></thead><tbody data-points><tr><td colspan="4">运行后生成实际预测数据。</td></tr></tbody></table></div></details></div></div>
 <div class="pylab-challenges"><div><b>动手一 · 找到一组坐标</b><p>运行示例，读取第 9 号点。它和图中的哪个部位对应？</p></div><div><b>动手二 · 改变可信门槛</b><p>把 <code>show(conf=0.50)</code> 改成 <code>0.95</code>，哪些点消失了？</p></div><div><b>动手三 · 写一句判断</b><p>读取 5、9 号点，比较 y 坐标。手腕高于肩，就一定是直臂举手吗？</p></div></div>
 <details class="pylab-api"><summary>代码接口说明与本地 Python 用法</summary><p>这里执行真正的 Python，使用课堂适配接口 <code>classroom_yolo</code> 调用官方 YOLO26n-pose 的 ONNX 模型。浏览器推理是异步的，因此使用 <code>await model.predict(...)</code>。它不是完整的 PyTorch / Ultralytics 安装环境。</p><p><code>result.keypoints.xy</code>：人数 × 17 × 2 的坐标数组；<code>result.keypoints.conf</code>：人数 × 17 的置信度数组；<code>result.keypoints.xyn</code>：0–1 归一化坐标。数组为 NumPy 数组，可正常索引和计算。</p><p><code>predict(conf=...)</code> 控制是否接受一个人体；<code>show(conf=...)</code> 控制显示哪些关键点。只出现一个人物，不代表 17 个点都同样可信。</p><div><button type="button" data-local>↓ 本地 Ultralytics 示例</button><a href="https://docs.ultralytics.com/tasks/pose/" target="_blank" rel="noopener noreferrer">YOLO 姿态模型官方文档 ↗</a></div><p class="pylab-fine">图片与推理均在浏览器中处理。首次下载运行资源后会使用浏览器缓存；离开本课或点击停止会结束当前执行。请用课堂示例开始，无需安装 Python。</p></details>`;
 const $=s=>host.querySelector(s),textarea=$('[data-editor]'),consoleEl=$('[data-console]'),statusEl=$('[data-status]'),canvas=$('[data-canvas]'),ctx=canvas.getContext('2d');
 let alive=true,cm,worker,runId=0,busy=false,timer,saveTimer,code=EXAMPLES[0].code,executedCode='',payload=null,showOptions={conf:.5,labels:false,boxes:true},view='original',selectedPoint=-1,personIndex=0,example='first',logSize=0;
 try{const saved=localStorage.getItem(draftKey);if(saved&&saved.length<=30000)code=saved}catch{}
 textarea.value=code;
 const image=new Image();image.onload=()=>{if(alive)draw()};image.src='/pose-lab-assets/classroom-person.png';
 const getCode=()=>cm?cm.getValue():textarea.value;
 function save(){try{localStorage.setItem(draftKey,getCode())}catch{}}
 function edited(){clearTimeout(saveTimer);saveTimer=setTimeout(save,250)}
 function setCode(value){if(cm)cm.setValue(value);else textarea.value=value;edited()}
 function log(line,type='stdout'){
  if(logSize>32000)return;const text=String(line).slice(0,8000);logSize+=text.length;
  const span=document.createElement('span');span.className=type;span.textContent=text+'\n';consoleEl.append(span);consoleEl.scrollTop=consoleEl.scrollHeight;
  if(logSize>32000)consoleEl.append(document.createTextNode('…输出过长，已截断。\n'));
 }
 function clearLog(){consoleEl.textContent='';logSize=0}
 function status(message,kind='idle'){statusEl.dataset.state=kind;statusEl.lastChild.textContent=' '+message}
 function setBusy(value){busy=value;$('[data-run]').disabled=value;$('[data-stop]').disabled=!value;host.querySelectorAll('[data-example],[data-restore]').forEach(b=>b.disabled=value);if(cm)cm.setOption('readOnly',value);else textarea.readOnly=value;host.setAttribute('aria-busy',String(value))}
 function armTimeout(ms,message){clearTimeout(timer);timer=setTimeout(()=>stop(message),ms)}
 function stop(message='执行已停止。再次运行将重新加载环境。'){clearTimeout(timer);worker?.terminate();worker=null;setBusy(false);status(message,'error');log(message,'stderr');if(!payload){$('[data-image-note]').textContent='执行已停止 · 未生成识别结果';$('[data-summary]').textContent='本次执行已停止，可以修改代码后重新运行。';$('[data-point-count]').textContent='执行已停止'}}
 function checked(data){return data?.image?.width===512&&data?.image?.height===512&&Array.isArray(data.people)&&data.people.length<=20&&data.people.every(p=>Array.isArray(p.keypoints)&&p.keypoints.length===17&&p.keypoints.every(q=>q.length===3&&q.every(Number.isFinite)))}
 function accept(data){if(!checked(data))throw new Error('推理结果格式不正确');payload=data;personIndex=0;$('[data-export]').disabled=false;$('[data-view="pose"]').disabled=false;
  $('[data-summary]').textContent=data.people.length?`检测到 ${data.people.length} 人 · 每人 17 个预测关键点`:'当前人体检测阈值下没有检测到人。可降低 predict(conf=...) 后重试。';
  $('[data-time]').textContent=`推理 ${(data.inferenceMs/1000).toFixed(2)} s`;
  $('[data-point-count]').textContent=data.people.length?`${data.people.length} 人 × 17 点`:'未检测到人体';
  $('[data-person-label]').hidden=data.people.length<2;$('[data-person]').innerHTML=data.people.map((p,i)=>`<option value="${i}">人物 ${i+1} · ${(p.score*100).toFixed(1)}%</option>`).join('');table();
 }
 function table(){const person=payload?.people[personIndex];if(!person){$('[data-points]').innerHTML='<tr><td colspan="4">没有可用的关键点，请先成功识别人体。</td></tr>';return}
  $('[data-points]').innerHTML=person.keypoints.map((q,i)=>`<tr class="${q[2]<showOptions.conf?'low-confidence':''}"><th><button type="button" data-point="${i}"><small>${String(i).padStart(2,'0')}</small> ${POINT_NAMES[i]}</button></th><td>${q[0].toFixed(1)}</td><td>${q[1].toFixed(1)}</td><td>${q[2].toFixed(3)}</td></tr>`).join('');
  $('[data-points]').querySelectorAll('button').forEach(b=>{b.onfocus=b.onmouseenter=()=>{selectedPoint=Number(b.dataset.point);draw()};b.onblur=b.onmouseleave=()=>{selectedPoint=-1;draw()};b.onclick=()=>{selectedPoint=Number(b.dataset.point);view='pose';draw()}});
 }
 function draw(){
  ctx.clearRect(0,0,512,512);if(image.complete&&image.naturalWidth)ctx.drawImage(image,0,0,512,512);
  host.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  if(view!=='pose'||!payload)return;
  payload.people.forEach((p,pi)=>{
   const ps=p.keypoints,threshold=showOptions.conf;ctx.strokeStyle=pi===personIndex?'#1b8c70':'#497eaa';ctx.lineWidth=2.4;ctx.lineCap='round';
   if(showOptions.boxes){ctx.save();ctx.strokeStyle='#26785b99';ctx.setLineDash([5,4]);ctx.lineWidth=1.5;ctx.strokeRect(p.box[0],p.box[1],p.box[2]-p.box[0],p.box[3]-p.box[1]);ctx.restore()}
   for(const [a,b] of SKELETON){if(ps[a][2]<threshold||ps[b][2]<threshold)continue;ctx.beginPath();ctx.moveTo(ps[a][0],ps[a][1]);ctx.lineTo(ps[b][0],ps[b][1]);ctx.stroke()}
   ps.forEach((q,i)=>{if(q[2]<threshold)return;ctx.beginPath();ctx.arc(q[0],q[1],i===selectedPoint&&pi===personIndex?7:3.8,0,Math.PI*2);ctx.fillStyle=i===selectedPoint?'#f1bb50':'#edc165';ctx.fill();ctx.strokeStyle='#fffaf1';ctx.lineWidth=1.3;ctx.stroke();
    if(showOptions.labels||i===selectedPoint){const label=`${i} ${POINT_NAMES[i]}`;ctx.font='11px system-ui';ctx.fillStyle='#153f32';ctx.fillText(label,Math.min(430,q[0]+7),Math.max(12,q[1]-6))}
   });
  });
 }
 function run(){
  if(busy)return;const source=getCode();if(!source.trim()){clearLog();log('请先输入 Python 代码。','stderr');return}if(source.length>30000){status('代码请控制在 30,000 字以内。','error');return}
  save();executedCode=source;runId++;clearLog();payload=null;view='original';$('[data-export]').disabled=true;$('[data-view="pose"]').disabled=true;$('[data-image-note]').hidden=false;$('[data-image-note]').textContent='正在运行 · 结果尚未生成';$('[data-summary]').textContent='等待当前代码的实际推理结果。';$('[data-points]').innerHTML='<tr><td colspan="4">等待本次推理。</td></tr>';$('[data-time]').textContent='';$('[data-point-count]').textContent='等待运行';draw();setBusy(true);status('正在准备执行…','running');
  worker ||= new Worker('/pose-lab-worker.js?v=python-1');
  worker.onerror=event=>{if(!alive)return;event.preventDefault();stop('运行环境发生错误，请再次运行重试。')};
  worker.onmessage=event=>{
   if(!alive||event.data.runId!==runId)return;const data=event.data;
   try{
    if(data.type==='phase')status(data.message,'running');
    if(data.type==='stdout'||data.type==='stderr')log(data.line,data.type);
    if(data.type==='ready')log('Python '+data.version+' / NumPy 已就绪。');
    if(data.type==='executing'){armTimeout(25000,'代码运行超过 25 秒，已停止。请检查循环或减少重复推理。');log('>>> 运行 pose_lab.py');}
    if(data.type==='inference'){accept(data.payload);$('[data-image-note]').textContent='已推理 · 运行 result.show() 可绘制骨架';}
    if(data.type==='show'){accept(data.payload);showOptions=data.options;view='pose';$('[data-image-note]').hidden=true;table();draw()}
    if(data.type==='done'){clearTimeout(timer);setBusy(false);status('运行完成 · 可修改代码再次验证','done');log('>>> 运行结束');if(!payload){$('[data-image-note]').textContent='本次代码没有调用模型推理';$('[data-summary]').textContent='代码执行完成，但尚未调用模型。运行 model.predict(...) 可生成识别结果。';$('[data-point-count]').textContent='未调用模型'}}
    if(data.type==='error'){clearTimeout(timer);setBusy(false);status('代码运行出错 · 查看下方终端','error');log(data.message,'stderr');if(!payload){$('[data-image-note]').textContent='未生成识别结果';$('[data-summary]').textContent='本次代码出错，未生成识别结果。请根据终端提示修改后重试。';$('[data-point-count]').textContent='运行出错'}}
   }catch(error){stop('处理结果失败：'+error.message)}
  };
  armTimeout(120000,'环境加载超时，已停止。请检查网络后重试。');worker.postMessage({type:'run',runId,code:source});
 }
 $('[data-run]').onclick=run;$('[data-stop]').onclick=()=>stop();$('[data-clear]').onclick=clearLog;
 host.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{example=b.dataset.example;setCode(EXAMPLES.find(x=>x.id===example).code);status('已载入示例 · 请阅读并运行');host.querySelectorAll('[data-example]').forEach(x=>x.classList.toggle('active',x===b))});
 $('[data-restore]').onclick=()=>setCode(EXAMPLES.find(x=>x.id===example).code);
 $('[data-save-code]').onclick=()=>downloadFile('pose_lab.py',getCode());$('[data-local]').onclick=()=>downloadFile('yolo26_local.py',LOCAL_EXAMPLE);
 $('[data-export]').onclick=()=>{if(payload)downloadFile('YOLO26-关键点实验记录.json',JSON.stringify({course:'描骨辨势 / Python 姿态识别',engine:'CPython (Pyodide) + YOLO26 ONNX (ONNX Runtime Web)',code:executedCode,...payload},null,2),'application/json')};
 $('[data-person]').onchange=()=>{personIndex=Number($('[data-person]').value);table();draw()};
 host.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;draw()});
 textarea.oninput=edited;textarea.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();run()}if(e.key==='Tab'){e.preventDefault();textarea.setRangeText('    ',textarea.selectionStart,textarea.selectionEnd,'end');edited()}};
 editorAssets().then(()=>{if(!alive||!host.isConnected)return;cm=window.CodeMirror.fromTextArea(textarea,{mode:'python',lineNumbers:true,indentUnit:4,tabSize:4,lineWrapping:false,viewportMargin:20,readOnly:busy,extraKeys:{'Ctrl-Enter':run,'Cmd-Enter':run,Tab:cm=>cm.replaceSelection('    ')},screenReaderLabel:'Python 代码编辑器'});cm.on('change',edited);cm.refresh()}).catch(()=>{if(alive)status('使用基础代码编辑器 · 仍可正常运行 Python')});
 const observer=new MutationObserver(()=>{if(!host.isConnected)dispose()});observer.observe(document.body,{childList:true,subtree:true});
 function dispose(){if(!alive)return;save();alive=false;clearTimeout(timer);clearTimeout(saveTimer);worker?.terminate();observer.disconnect();cm?.toTextArea();if(current?.host===host)current=null}
 current={host,dispose};
}
