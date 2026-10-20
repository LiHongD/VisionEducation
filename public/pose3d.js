import * as THREE from './vendor/three.module.min.js';
import {createTeachingCharacter} from './pose-character.js';
import {REST_POSE,POSE_CHAINS,PRESETS,makePreset,solveTwoBone} from './pose-presets.js';

// A Blender-exported reference-textured mesh, controlled locally by its rig.
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const initial=REST_POSE,chains=POSE_CHAINS;
let remembered=initial.map(p=>p.slice()),rememberedPreset='stand',current;
export function mountPoseExplorer(host){
 if(!host||current?.host===host)return;
 current?.dispose();
 let renderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true})}catch{host.innerHTML='<div class="pose3d-fallback"><img src="/micro15-assets/neutral.png" alt="站立教学人物"><p>当前浏览器无法开启 3D 显示。请使用支持 WebGL 的浏览器打开本页；下方描点练习仍可使用。</p></div>';return}
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.05,40),target=V(0,.995,0);
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0xf1eee4,1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.domElement.setAttribute('aria-label','可转动视角的三维教学人物，拖动圆点改变动作');host.append(renderer.domElement);
 const overlay=document.createElement('div');overlay.className='pose3d-points';host.append(overlay);
 scene.add(new THREE.HemisphereLight(0xfff9ec,0xa8a18f,1.8));const light=new THREE.DirectionalLight(0xfff5e8,3.2);light.position.set(-3,5,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-2;light.shadow.camera.right=2;light.shadow.camera.top=3;light.shadow.camera.bottom=-2;light.shadow.bias=-.001;scene.add(light);
 const fill=new THREE.DirectionalLight(0xffffff,1);fill.position.set(3,3,-3);scene.add(fill);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(1.65,64),new THREE.MeshStandardMaterial({color:0xe5e2d5,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=.005;scene.add(floor);
 const grid=new THREE.GridHelper(3.4,20,0xc8cbbd,0xdce0d1);grid.position.y=.008;grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
 const geometries=new Set(),materials=new Set();
 const loading=document.createElement('div');loading.className='pose3d-asset-loading';loading.innerHTML='<img src="/micro15-assets/reference-student-cutout.png" alt="正在载入参考图人物"><span>正在载入人物模型…</span>';host.append(loading);
 const character=createTeachingCharacter(scene,{
  onReady(){loading.remove();needsDraw=true;},
  onProgress(loaded,total){const span=loading.querySelector('span');if(span&&total)span.textContent='正在载入人物模型 '+Math.round(loaded/total*100)+'%';},
  onError(){loading.classList.add('failed');loading.querySelector('span').textContent='模型载入失败，请刷新重试';status.textContent='立体模型暂未载入成功，当前显示原图。';}
 });
 let p=remembered.map(a=>V(...a)),yaw=0,elevation=0,distance=4.3,selected=4,drag=null,changed=0,alive=true,needsDraw=true,visible=true,frame=0,transition=null,activePreset=rememberedPreset,handStyle=rememberedPreset==='punch'?'punch':'open';
 const lengths=chains.map(c=>[V(...initial[c[0]]).distanceTo(V(...initial[c[1]])),V(...initial[c[1]]).distanceTo(V(...initial[c[2]]))]);
 const buttons=p.map((_,i)=>{let b=document.createElement('button');b.type='button';b.className='pose3d-dot';b.textContent=String(i+1).padStart(2,'0');b.setAttribute('aria-label','操作点 '+String(i+1).padStart(2,'0'));b.addEventListener('pointerdown',e=>start(e,i));b.addEventListener('focus',()=>select(i));b.addEventListener('keydown',e=>{let dirs={ArrowLeft:[-.025,0,0],ArrowRight:[.025,0,0],ArrowUp:[0,.025,0],ArrowDown:[0,-.025,0],PageUp:[0,0,.025],PageDown:[0,0,-.025]};if(!dirs[e.key])return;e.preventDefault();const [x,y,z]=dirs[e.key];const right=V(Math.cos(yaw),0,-Math.sin(yaw));move(i,p[i].clone().addScaledVector(right,x).add(V(0,y,z)));record()});overlay.append(b);return b});
 const wrapper=host.closest('.pose3d-lab'),status=wrapper.querySelector('[data-pose3d-status]'),picker=wrapper.querySelector('[data-pose3d-picker]');
 picker.innerHTML=p.map((_,i)=>`<option value="${i}">点 ${String(i+1).padStart(2,'0')}</option>`).join('');picker.value=String(selected);
 function select(i){selected=i;picker.value=String(i);buttons.forEach((b,j)=>b.classList.toggle('selected',i===j));needsDraw=true}
 function record(){changed++;remembered=p.map(v=>v.toArray());status.textContent='已调整 '+changed+' 次 · 观察相邻部分怎样一起变化';needsDraw=true}
 function ik(ci,end,pole){solveTwoBone(p,ci,end,pole)}
 function markCustom(){transition=null;activePreset='';rememberedPreset='';handStyle='open';presetButtons.forEach(b=>b.setAttribute('aria-pressed','false'));wrapper.querySelector('[data-pose3d-current]').textContent='自由探索';wrapper.querySelector('[data-pose3d-hint]').textContent='观察相邻部分的变化，尝试摆出你自己的动作。';}
 function move(i,to){markCustom();to.x=THREE.MathUtils.clamp(to.x,-1.05,1.05);to.y=THREE.MathUtils.clamp(to.y,.1,2.2);to.z=THREE.MathUtils.clamp(to.z,-.8,.8);const ci=chains.findIndex(c=>c.includes(i)),chain=chains[ci];if(i===chain[2])ik(ci,to);else if(i===chain[1]){let old=p[i].clone(),root=p[chain[0]],direction=to.clone().sub(root).normalize();if(direction.length()<.1)return;p[i].copy(root).addScaledVector(direction,lengths[ci][0]);p[chain[2]].add(p[i].clone().sub(old));if(ci>=2&&p[chain[2]].y<.1)ik(ci,p[chain[2]].clone().setY(.1),to)}else if(i===0||i===1){const mid=p[6].clone().add(p[7]).multiplyScalar(.5),sign=i===0?-1:1,lean=THREE.MathUtils.clamp((to.x-sign*.25-mid.x)*.9,-.45,.45),turn=THREE.MathUtils.clamp(to.z*1.5,-.45,.45),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(turn,0,-lean));for(let j=0;j<6;j++)p[j].copy(V(...initial[j]).sub(V(0,(initial[6][1]+initial[7][1])/2,0)).applyQuaternion(q).add(mid))}else{const delta=to.clone().sub(p[i]);delta.x=THREE.MathUtils.clamp(delta.x,-.025,.025);delta.y=THREE.MathUtils.clamp(delta.y,-.035,.035);delta.z=THREE.MathUtils.clamp(delta.z,-.025,.025);const newY=(p[6].y+p[7].y)/2+delta.y;if(newY<.55||newY>1.06)delta.y=0;const feet=[p[10].clone(),p[11].clone()];for(let j=0;j<8;j++)p[j].add(delta);ik(2,feet[0],p[8].clone().add(V(0,0,.2)));ik(3,feet[1],p[9].clone().add(V(0,0,.2)))}needsDraw=true}
 function cameraUpdate(){const height=distance*.5,aspect=host.clientWidth/host.clientHeight;camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;camera.updateProjectionMatrix();camera.position.set(Math.sin(yaw)*distance,1+Math.sin(elevation)*distance,Math.cos(yaw)*Math.cos(elevation)*distance);camera.lookAt(target);camera.updateMatrixWorld()}
 const ray=new THREE.Raycaster(),plane=new THREE.Plane(),pointer=new THREE.Vector2();
 function pointOnPlane(e){let r=host.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);return ray.ray.intersectPlane(plane,V())}
 function start(e,i){if(e.button!==0)return;markCustom();e.preventDefault();e.stopPropagation();select(i);cameraUpdate();plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(V()).negate(),p[i]);let hit=pointOnPlane(e);if(!hit)return;drag={i,id:e.pointerId,offset:p[i].clone().sub(hit)};host.setPointerCapture(e.pointerId);host.classList.add('dragging')}
 function down(e){if(e.button!==0||e.target.closest('button'))return;e.preventDefault();drag={orbit:true,id:e.pointerId,x:e.clientX,y:e.clientY};host.setPointerCapture(e.pointerId)}
 function pointerMove(e){if(!drag){return}if(drag.id!==e.pointerId)return;if(drag.orbit){yaw-=(e.clientX-drag.x)*.008;elevation=THREE.MathUtils.clamp(elevation+(e.clientY-drag.y)*.004,-.15,.4);drag.x=e.clientX;drag.y=e.clientY;needsDraw=true}else{const hit=pointOnPlane(e);if(hit)move(drag.i,hit.add(drag.offset))}}
 function end(e){if(!drag||e.pointerId!==drag.id)return;if(!drag.orbit)record();drag=null;host.classList.remove('dragging');if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId)}
 function wheel(e){e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.003,3.1,6);needsDraw=true}
 host.addEventListener('pointerdown',down);host.addEventListener('pointermove',pointerMove);host.addEventListener('pointerup',end);host.addEventListener('pointercancel',end);host.addEventListener('lostpointercapture',end);host.addEventListener('wheel',wheel,{passive:false});
 picker.onchange=()=>{select(Number(picker.value));buttons[selected].focus({preventScroll:true})};
 wrapper.querySelectorAll('[data-pose3d-nudge]').forEach(b=>b.onclick=()=>{const d=JSON.parse(b.dataset.pose3dNudge),right=V(Math.cos(yaw),0,-Math.sin(yaw));move(selected,p[selected].clone().addScaledVector(right,d[0]).add(V(0,d[1],d[2])));record()});
 wrapper.querySelectorAll('[data-pose3d-view]').forEach(b=>b.onclick=()=>{yaw=Number(b.dataset.pose3dView);elevation=0;needsDraw=true});
 const presetRegion=wrapper.querySelector('[data-pose3d-presets]');
 presetRegion.innerHTML=PRESETS.map(x=>`<button type="button" class="pose3d-preset" data-preset="${x.id}" aria-pressed="${x.id===activePreset}">${x.label}</button>`).join('');
 const presetButtons=[...presetRegion.querySelectorAll('button')];
 const previousPreset=PRESETS.find(x=>x.id===activePreset);wrapper.querySelector('[data-pose3d-current]').textContent=previousPreset?.label||'自由探索';if(previousPreset)wrapper.querySelector('[data-pose3d-hint]').textContent=previousPreset.description;
 function applyPreset(id){
  if(!character.isReady){status.textContent='人物模型正在载入，请稍候。';return}
  const item=PRESETS.find(x=>x.id===id);if(!item)return;
  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  transition={from:p.map(v=>v.clone()),to:makePreset(id),started:performance.now(),duration:reduce?0:850};
  activePreset=id;handStyle=id==='punch'?'punch':'open';if(id==='raise'||id==='balance')distance=Math.max(distance,4.6);
  presetButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preset===id)));
  wrapper.querySelector('[data-pose3d-current]').textContent=item.label;
  wrapper.querySelector('[data-pose3d-hint]').textContent=item.description;
  status.textContent='正在摆出「'+item.label+'」…';needsDraw=true;
 }
 presetButtons.forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
 wrapper.querySelector('[data-pose3d-reset]').onclick=()=>{yaw=0;elevation=0;distance=4.3;changed=0;applyPreset('stand')};
 function resize(){if(!host.isConnected)return;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();needsDraw=true}
 const ro=new ResizeObserver(resize);ro.observe(host);
 const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)needsDraw=true});io.observe(host);
 function draw(now=performance.now()){
  if(!alive)return;if(!host.isConnected){dispose();return}frame=requestAnimationFrame(draw);
  if(transition){const raw=transition.duration?THREE.MathUtils.clamp((now-transition.started)/transition.duration,0,1):1,eased=raw*raw*(3-2*raw);p.forEach((v,i)=>v.lerpVectors(transition.from[i],transition.to[i],eased));for(let ci=0;ci<chains.length;ci++){const c=chains[ci];solveTwoBone(p,ci,p[c[2]].clone(),p[c[1]].clone())}needsDraw=true;
   if(raw>=1){p.forEach((v,i)=>v.copy(transition.to[i]));transition=null;remembered=p.map(v=>v.toArray());rememberedPreset=activePreset;status.textContent='已摆出「'+(PRESETS.find(x=>x.id===activePreset)?.label||'动作')+'」· 可继续拖动亮点微调';}
  }
  if(!visible||document.hidden||!needsDraw)return;needsDraw=false;cameraUpdate();character.update(p,handStyle);
  renderer.render(scene,camera);p.forEach((v,i)=>{const pr=v.clone().project(camera),x=(pr.x*.5+.5)*host.clientWidth,y=(-pr.y*.5+.5)*host.clientHeight;buttons[i].style.left=x+'px';buttons[i].style.top=y+'px';buttons[i].hidden=pr.z>1||x<0||y<0||x>host.clientWidth||y>host.clientHeight});
 }
 function dispose(){if(!alive)return;alive=false;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',pointerMove);host.removeEventListener('pointerup',end);host.removeEventListener('pointercancel',end);host.removeEventListener('lostpointercapture',end);host.removeEventListener('wheel',wheel);scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))}});character.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();loading.remove();overlay.remove();renderer.domElement.remove();if(current?.host===host)current=null}
 current={host,dispose};select(selected);resize();draw();
}
