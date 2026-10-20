import * as THREE from './vendor/three.module.min.js';

// A locally constructed, articulated teaching model inspired by neutral.png.
// Image-to-mesh reconstruction is not performed; no images or student data leave the page.
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const initial=[[-.25,1.48,0],[.25,1.48,0],[-.34,1.16,0],[.34,1.16,0],[-.42,.84,.015],[.42,.84,.015],[-.15,.94,0],[.15,.94,0],[-.16,.53,.025],[.16,.53,.025],[-.17,.115,0],[.17,.115,0]];
const chains=[[0,2,4],[1,3,5],[6,8,10],[7,9,11]];
let remembered=initial.map(p=>p.slice()),current;
export function mountPoseExplorer(host){
 if(!host||current?.host===host)return;
 current?.dispose();
 let renderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true})}catch{host.innerHTML='<div class="pose3d-fallback"><img src="/micro15-assets/neutral.png" alt="站立教学人物"><p>当前浏览器无法开启 3D 显示。请使用支持 WebGL 的浏览器打开本页；下方描点练习仍可使用。</p></div>';return}
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.05,40),target=V(0,1,0);
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor(0xf1eee4,1);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.domElement.setAttribute('aria-label','可转动视角的三维教学人物，拖动圆点改变动作');host.append(renderer.domElement);
 const overlay=document.createElement('div');overlay.className='pose3d-points';host.append(overlay);
 scene.add(new THREE.HemisphereLight(0xfff9ec,0x7f8b79,2.3));const light=new THREE.DirectionalLight(0xfff5e8,3);light.position.set(-2,5,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-2;light.shadow.camera.right=2;light.shadow.camera.top=3;light.shadow.camera.bottom=-2;light.shadow.bias=-.001;scene.add(light);
 const fill=new THREE.DirectionalLight(0xffffff,1);fill.position.set(3,2,-3);scene.add(fill);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(1.65,64),new THREE.MeshStandardMaterial({color:0xe5e2d5,roughness:1}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=.005;scene.add(floor);
 const grid=new THREE.GridHelper(3.4,20,0xc8cbbd,0xdce0d1);grid.position.y=.008;grid.material.transparent=true;grid.material.opacity=.3;scene.add(grid);
 const material=(c,r=.8)=>new THREE.MeshStandardMaterial({color:c,roughness:r});
 const skin=material(0xe2ac85),shirt=material(0x294d3c),pants=material(0xc9c0ab),shoes=material(0xf7f5ee),hair=material(0x28211c),black=material(0x30241c),white=material(0xffffff),sole=material(0xd8d9cf);
 const geometries=new Set(),materials=new Set([skin,shirt,pants,shoes,hair,black,white,sole]);
 function mesh(geo,mat,parent=scene){geometries.add(geo);const m=new THREE.Mesh(geo,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 function ellipsoid(parent,mat,x,y,z,sx,sy,sz){const m=mesh(new THREE.SphereGeometry(1,24,18),mat,parent);m.position.set(x,y,z);m.scale.set(sx,sy,sz);return m}
 function segment(mat,r1,r2){return mesh(new THREE.CylinderGeometry(r1,r2,1,20,1),mat)}
 function connect(m,a,b){m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize());m.scale.y=a.distanceTo(b)}
 const trunk=new THREE.Group();scene.add(trunk);
 // Tapered shirt, subtle collar and hem; all coordinates in the rigid torso frame.
 const outline=[[.185,.02],[.20,.07],[.215,.19],[.235,.36],[.255,.46],[.20,.51],[.115,.54]];
 const torso=mesh(new THREE.LatheGeometry(outline.map(([r,y])=>new THREE.Vector2(r,y)),40),shirt,trunk);torso.scale.z=.64;
 ellipsoid(trunk,shirt,0,.06,0,.20,.09,.13);
 const collar=mesh(new THREE.TorusGeometry(.092,.012,8,32),shirt,trunk);collar.rotation.x=Math.PI/2;collar.position.y=.54;
 const neck=mesh(new THREE.CylinderGeometry(.064,.072,.13,20),skin,trunk);neck.position.y=.59;
 const head=new THREE.Group();head.position.y=.76;trunk.add(head);
 ellipsoid(head,skin,0,0,0,.132,.175,.125);ellipsoid(head,skin,-.132,-.015,0,.025,.044,.025);ellipsoid(head,skin,.132,-.015,0,.025,.044,.025);
 // A dark cap with swept locks and a clearly forward-facing face.
 const cap=mesh(new THREE.SphereGeometry(1,28,18,0,Math.PI*2,0,Math.PI*.53),hair,head);cap.position.set(0,.035,-.008);cap.scale.set(.141,.16,.132);
 [[-.09,.09,.10,-.4],[0,.12,.115,-.5],[.075,.11,.10,-.35]].forEach(([x,y,z,r])=>{let m=ellipsoid(head,hair,x,y,z,.06,.08,.035);m.rotation.z=r});
 for(const x of [-.049,.049]){ellipsoid(head,white,x,.005,.109,.028,.016,.01);ellipsoid(head,black,x,.005,.118,.011,.012,.006);let brow=ellipsoid(head,hair,x,.042,.113,.03,.005,.006);brow.rotation.z=x>0?-.08:.08}
 ellipsoid(head,skin,0,-.027,.124,.018,.026,.026);const mouth=ellipsoid(head,material(0xa46b53),0,-.076,.108,.034,.004,.007);materials.add(mouth.material);
 const pelvis=ellipsoid(scene,pants,0,.93,0,.19,.125,.125);
 const limbMeshes=chains.map((chain,i)=>({a:segment(i<2?skin:pants,i<2?.066:.097,i<2?.052:.077),b:segment(i<2?skin:pants,i<2?.052:.077,i<2?.035:.052),joint:ellipsoid(scene,i<2?skin:pants,0,0,0,i<2?.053:.08,i<2?.053:.08,i<2?.053:.08),root:ellipsoid(scene,i<2?shirt:pants,0,0,0,i<2?.091:.10,i<2?.105:.10,i<2?.088:.10),end:new THREE.Group()}));
 limbMeshes.forEach((m,i)=>{scene.add(m.end);if(i<2){ellipsoid(m.end,skin,0,-.045,0,.037,.072,.026);for(let j=0;j<4;j++)ellipsoid(m.end,skin,(j-1.5)*.014,-.10,.003,.008,.035,.01)}else{ellipsoid(m.end,shoes,0,-.042,.055,.077,.063,.137);ellipsoid(m.end,sole,0,-.078,.056,.079,.018,.139);for(let k=0;k<3;k++){let lace=mesh(new THREE.BoxGeometry(.075,.006,.007),white,m.end);lace.position.set(0,-.002,.07+k*.02)}}});
 let p=remembered.map(a=>V(...a)),yaw=.12,elevation=.08,distance=4.4,selected=4,drag=null,changed=0,alive=true,needsDraw=true,visible=true,frame=0;
 const lengths=chains.map(c=>[V(...initial[c[0]]).distanceTo(V(...initial[c[1]])),V(...initial[c[1]]).distanceTo(V(...initial[c[2]]))]);
 const buttons=p.map((_,i)=>{let b=document.createElement('button');b.type='button';b.className='pose3d-dot';b.textContent=String(i+1).padStart(2,'0');b.setAttribute('aria-label','操作点 '+String(i+1).padStart(2,'0'));b.addEventListener('pointerdown',e=>start(e,i));b.addEventListener('focus',()=>select(i));b.addEventListener('keydown',e=>{let dirs={ArrowLeft:[-.025,0,0],ArrowRight:[.025,0,0],ArrowUp:[0,.025,0],ArrowDown:[0,-.025,0],PageUp:[0,0,.025],PageDown:[0,0,-.025]};if(!dirs[e.key])return;e.preventDefault();const [x,y,z]=dirs[e.key];const right=V(Math.cos(yaw),0,-Math.sin(yaw));move(i,p[i].clone().addScaledVector(right,x).add(V(0,y,z)));record()});overlay.append(b);return b});
 const wrapper=host.closest('.pose3d-lab'),status=wrapper.querySelector('[data-pose3d-status]'),picker=wrapper.querySelector('[data-pose3d-picker]');
 picker.innerHTML=p.map((_,i)=>`<option value="${i}">点 ${String(i+1).padStart(2,'0')}</option>`).join('');picker.value=String(selected);
 function select(i){selected=i;picker.value=String(i);buttons.forEach((b,j)=>b.classList.toggle('selected',i===j));needsDraw=true}
 function record(){changed++;remembered=p.map(v=>v.toArray());status.textContent='已调整 '+changed+' 次 · 观察相邻部分怎样一起变化';needsDraw=true}
 function ik(ci,end,pole){let c=chains[ci],a=p[c[0]],b=p[c[1]],d=p[c[2]],[l1,l2]=lengths[ci];const axis=end.clone().sub(a),dist=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.015,l1+l2-.002);if(axis.length()<.0001)axis.set(0,-1,0);axis.normalize();const bend=(pole||b).clone().sub(a);bend.addScaledVector(axis,-bend.dot(axis));if(bend.length()<.0001){bend.copy(ci<2?V(ci===0?-1:1,0,.5):V(0,0,1));bend.addScaledVector(axis,-bend.dot(axis))}bend.normalize();const along=(l1*l1-l2*l2+dist*dist)/(2*dist),height=Math.sqrt(Math.max(0,l1*l1-along*along));b.copy(a).addScaledVector(axis,along).addScaledVector(bend,height);d.copy(a).addScaledVector(axis,dist)}
 function move(i,to){to.x=THREE.MathUtils.clamp(to.x,-1.05,1.05);to.y=THREE.MathUtils.clamp(to.y,.1,2.2);to.z=THREE.MathUtils.clamp(to.z,-.8,.8);const ci=chains.findIndex(c=>c.includes(i)),chain=chains[ci];if(i===chain[2])ik(ci,to);else if(i===chain[1]){let old=p[i].clone(),root=p[chain[0]],direction=to.clone().sub(root).normalize();if(direction.length()<.1)return;p[i].copy(root).addScaledVector(direction,lengths[ci][0]);p[chain[2]].add(p[i].clone().sub(old));if(ci>=2&&p[chain[2]].y<.1)ik(ci,p[chain[2]].clone().setY(.1),to)}else if(i===0||i===1){const mid=p[6].clone().add(p[7]).multiplyScalar(.5),sign=i===0?-1:1,lean=THREE.MathUtils.clamp((to.x-sign*.25-mid.x)*.9,-.45,.45),turn=THREE.MathUtils.clamp(to.z*1.5,-.45,.45),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(turn,0,-lean));for(let j=0;j<6;j++)p[j].copy(V(...initial[j]).sub(V(0,.94,0)).applyQuaternion(q).add(mid))}else{const delta=to.clone().sub(p[i]);delta.x=THREE.MathUtils.clamp(delta.x,-.025,.025);delta.y=THREE.MathUtils.clamp(delta.y,-.035,.035);delta.z=THREE.MathUtils.clamp(delta.z,-.025,.025);const newY=(p[6].y+p[7].y)/2+delta.y;if(newY<.55||newY>1.06)delta.y=0;const feet=[p[10].clone(),p[11].clone()];for(let j=0;j<8;j++)p[j].add(delta);ik(2,feet[0],p[8].clone().add(V(0,0,.2)));ik(3,feet[1],p[9].clone().add(V(0,0,.2)))}needsDraw=true}
 function cameraUpdate(){camera.position.set(Math.sin(yaw)*distance,1+Math.sin(elevation)*distance,Math.cos(yaw)*Math.cos(elevation)*distance);camera.lookAt(target);camera.updateMatrixWorld()}
 const ray=new THREE.Raycaster(),plane=new THREE.Plane(),pointer=new THREE.Vector2();
 function pointOnPlane(e){let r=host.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);return ray.ray.intersectPlane(plane,V())}
 function start(e,i){if(e.button!==0)return;e.preventDefault();e.stopPropagation();select(i);cameraUpdate();plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(V()).negate(),p[i]);let hit=pointOnPlane(e);if(!hit)return;drag={i,id:e.pointerId,offset:p[i].clone().sub(hit)};host.setPointerCapture(e.pointerId);host.classList.add('dragging')}
 function down(e){if(e.button!==0||e.target.closest('button'))return;e.preventDefault();drag={orbit:true,id:e.pointerId,x:e.clientX,y:e.clientY};host.setPointerCapture(e.pointerId)}
 function pointerMove(e){if(!drag){return}if(drag.id!==e.pointerId)return;if(drag.orbit){yaw-=(e.clientX-drag.x)*.008;elevation=THREE.MathUtils.clamp(elevation+(e.clientY-drag.y)*.004,-.15,.4);drag.x=e.clientX;drag.y=e.clientY;needsDraw=true}else{const hit=pointOnPlane(e);if(hit)move(drag.i,hit.add(drag.offset))}}
 function end(e){if(!drag||e.pointerId!==drag.id)return;if(!drag.orbit)record();drag=null;host.classList.remove('dragging');if(host.hasPointerCapture(e.pointerId))host.releasePointerCapture(e.pointerId)}
 function wheel(e){e.preventDefault();distance=THREE.MathUtils.clamp(distance+e.deltaY*.003,3.1,6);needsDraw=true}
 host.addEventListener('pointerdown',down);host.addEventListener('pointermove',pointerMove);host.addEventListener('pointerup',end);host.addEventListener('pointercancel',end);host.addEventListener('lostpointercapture',end);host.addEventListener('wheel',wheel,{passive:false});
 picker.onchange=()=>{select(Number(picker.value));buttons[selected].focus({preventScroll:true})};
 wrapper.querySelectorAll('[data-pose3d-nudge]').forEach(b=>b.onclick=()=>{const d=JSON.parse(b.dataset.pose3dNudge),right=V(Math.cos(yaw),0,-Math.sin(yaw));move(selected,p[selected].clone().addScaledVector(right,d[0]).add(V(0,d[1],d[2])));record()});
 wrapper.querySelectorAll('[data-pose3d-view]').forEach(b=>b.onclick=()=>{yaw=Number(b.dataset.pose3dView);elevation=.08;needsDraw=true});
 wrapper.querySelector('[data-pose3d-reset]').onclick=()=>{p=initial.map(v=>V(...v));remembered=initial.map(v=>v.slice());yaw=.12;elevation=.08;distance=4.4;changed=0;status.textContent='已还原站立姿态 · 试着拖动一个亮点';needsDraw=true};
 function resize(){if(!host.isConnected)return;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();needsDraw=true}
 const ro=new ResizeObserver(resize);ro.observe(host);
 const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)needsDraw=true});io.observe(host);
 function draw(){if(!alive)return;if(!host.isConnected){dispose();return}frame=requestAnimationFrame(draw);if(!visible||document.hidden||!needsDraw)return;needsDraw=false;cameraUpdate();let center=p[6].clone().add(p[7]).multiplyScalar(.5),up=p[0].clone().add(p[1]).multiplyScalar(.5).sub(center).normalize(),right=p[1].clone().sub(p[0]).normalize(),front=right.clone().cross(up).normalize();const basis=new THREE.Matrix4().makeBasis(right,up,front);trunk.position.copy(center);trunk.quaternion.setFromRotationMatrix(basis);pelvis.position.copy(center);pelvis.quaternion.copy(trunk.quaternion);
 limbMeshes.forEach((m,i)=>{let [a,b,c]=chains[i];connect(m.a,p[a],p[b]);connect(m.b,p[b],p[c]);m.joint.position.copy(p[b]);m.root.position.copy(p[a]);m.end.position.copy(p[c]);if(i<2)m.end.quaternion.setFromUnitVectors(V(0,-1,0),p[c].clone().sub(p[b]).normalize());else m.end.quaternion.setFromEuler(new THREE.Euler(0,0,0))});
 renderer.render(scene,camera);p.forEach((v,i)=>{const pr=v.clone().project(camera),x=(pr.x*.5+.5)*host.clientWidth,y=(-pr.y*.5+.5)*host.clientHeight;buttons[i].style.left=x+'px';buttons[i].style.top=y+'px';buttons[i].hidden=pr.z>1||x<0||y<0||x>host.clientWidth||y>host.clientHeight});}
 function dispose(){if(!alive)return;alive=false;cancelAnimationFrame(frame);ro.disconnect();io.disconnect();host.removeEventListener('pointerdown',down);host.removeEventListener('pointermove',pointerMove);host.removeEventListener('pointerup',end);host.removeEventListener('pointercancel',end);host.removeEventListener('lostpointercapture',end);host.removeEventListener('wheel',wheel);scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material){(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m))}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();renderer.forceContextLoss();overlay.remove();renderer.domElement.remove();if(current?.host===host)current=null}
 current={host,dispose};select(selected);resize();draw();
}
