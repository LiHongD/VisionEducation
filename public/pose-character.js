import * as THREE from './vendor/three.module.min.js';
const vec=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

// Continuous, deformable surfaces replace the original separate cylinders.
// The same student illustration remains the reference for dress and proportions.
export function createTeachingCharacter(scene){
 const textures=[];
 function cloth(color){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#808080';ctx.fillRect(0,0,128,128);
  for(let y=0;y<128;y+=2)for(let x=0;x<128;x+=2){const n=116+(x*13+y*7)%24;ctx.fillStyle=`rgb(${n},${n},${n})`;ctx.fillRect(x,y,1,1)}
  const map=new THREE.CanvasTexture(canvas);map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(7,9);textures.push(map);
  return new THREE.MeshStandardMaterial({color,roughness:.94,bumpMap:map,bumpScale:.002});
 }
 const skin=new THREE.MeshPhysicalMaterial({color:0xe9b598,roughness:.63,clearcoat:.04}),shirt=cloth(0x315746),pants=cloth(0xc5b99c),shoe=new THREE.MeshStandardMaterial({color:0xf6f4ed,roughness:.69}),sole=new THREE.MeshStandardMaterial({color:0xd7d5cd,roughness:.9}),hair=new THREE.MeshStandardMaterial({color:0x241c19,roughness:.72}),hairLight=new THREE.MeshStandardMaterial({color:0x3d2b23,roughness:.8}),eyeWhite=new THREE.MeshStandardMaterial({color:0xf3e6d5,roughness:.4}),iris=new THREE.MeshStandardMaterial({color:0x513c28,roughness:.3}),pupil=new THREE.MeshStandardMaterial({color:0x151a18,roughness:.2}),lip=new THREE.MeshStandardMaterial({color:0xad7763,roughness:.8}),stitch=new THREE.MeshStandardMaterial({color:0x254c3a,roughness:1}),pantSeam=new THREE.MeshStandardMaterial({color:0xa79d85,roughness:1});
 const root=new THREE.Group();scene.add(root);
 const body=new THREE.Group();root.add(body);
 function mesh(geometry,material,parent=root){let m=new THREE.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
 function oval(parent,mat,position,scale){const m=mesh(new THREE.SphereGeometry(1,40,28),mat,parent);m.position.set(...position);m.scale.set(...scale);return m}
 function path(points,r,mat,parent=root){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>vec(...p))),Math.max(12,points.length*6),r,8,false),mat,parent)}
 function profile(levels,material,parent=root,segments=64){
  const curve=new THREE.CatmullRomCurve3(levels.map(([y,x,z])=>vec(x,y,z))),verts=[],uv=[],indices=[];const rings=64;
  for(let j=0;j<=rings;j++){let p=curve.getPoint(j/rings);for(let i=0;i<=segments;i++){let a=i/segments*Math.PI*2;verts.push(p.x*Math.cos(a),p.y,p.z*Math.sin(a));uv.push(i/segments,j/rings)}}
  for(let j=0;j<rings;j++)for(let i=0;i<segments;i++){let a=j*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(g,material,parent);
 }
 // Softly shaped shirt with a real shoulder slope, collar, hem, and subtle seams.
 profile([[-.015,.17,.115],[.015,.183,.126],[.10,.19,.132],[.23,.202,.143],[.36,.225,.147],[.435,.25,.139],[.48,.252,.125],[.515,.19,.105],[.55,.08,.068]],shirt,body);
 const hem=mesh(new THREE.TorusGeometry(.179,.006,8,64),stitch,body);hem.rotation.x=Math.PI/2;hem.scale.y=.70;hem.position.y=.008;
 const collar=mesh(new THREE.TorusGeometry(.083,.011,12,64),stitch,body);collar.rotation.x=Math.PI/2;collar.scale.y=.84;collar.position.y=.553;
 path([[-.215,.435,.085],[-.17,.476,.105],[-.11,.512,.09]],.0025,stitch,body);path([[.215,.435,.085],[.17,.476,.105],[.11,.512,.09]],.0025,stitch,body);
 // A small understated embroidered mark, rather than a flat featureless torso.
 path([[.105,.355,.145],[.118,.366,.144],[.130,.351,.141]],.003,stitch,body);
 profile([[.522,.060,.056],[.57,.061,.057],[.62,.064,.059],[.65,.073,.064]],skin,body,40);
 const head=new THREE.Group();head.position.set(0,.738,.003);body.add(head);
 // Sculpted jaw, cheek, temple and cranium sections; the face is not a sphere.
 profile([[-.139,.026,.035],[-.123,.061,.062],[-.095,.085,.080],[-.045,.105,.095],[.01,.114,.105],[.065,.113,.103],[.115,.101,.094],[.15,.072,.074],[.17,.008,.012]],skin,head);
 for(const sign of [-1,1]){
  oval(head,skin,[sign*.113,-.015,-.004],[.021,.038,.022]);oval(head,lip,[sign*.122,-.015,.012],[.008,.020,.007]);
  // Almond-shaped eyes seated into the face, upper and lower lids, dark irises.
  let eye=oval(head,eyeWhite,[sign*.044,.006,.095],[.024,.0105,.009]);eye.rotation.z=-sign*.05;
  oval(head,iris,[sign*.044,.006,.103],[.010,.010,.003]);oval(head,pupil,[sign*.044,.006,.106],[.0048,.006,.0015]);oval(head,eyeWhite,[sign*.041,.010,.107],[.0023,.0023,.001]);
  path([[sign*.022,.010,.102],[sign*.042,.017,.104],[sign*.066,.010,.094]],.0025,hair,head);
  path([[sign*.021,.036,.101],[sign*.042,.043,.105],[sign*.068,.038,.095]],.0035,hair,head);
 }
 // Nose with bridge and shaped tip, restrained lips, and a gentle smile.
 oval(head,skin,[0,-.015,.102],[.013,.036,.014]);oval(head,skin,[0,-.040,.117],[.018,.014,.019]);
 for(const x of [-.014,.014])oval(head,skin,[x,-.046,.110],[.010,.008,.010]);
 path([[-.028,-.078,.084],[-.013,-.082,.094],[0,-.081,.097],[.013,-.082,.094],[.028,-.078,.084]],.0028,lip,head);
 oval(head,skin,[0,-.087,.091],[.022,.004,.004]);
 // Sculpted swept hairstyle with many shallow locks, not separate balls.
 const hairPositions=[],hairUV=[],hairIndices=[];const hr=36,hs=72;
 for(let j=0;j<=hr;j++)for(let i=0;i<=hs;i++){
  let a=i/hs*Math.PI*2,frontness=(Math.cos(a)+1)/2,edge=1.66-.33*frontness+.08*Math.sin(a*2),phi=j/hr*edge;
  const sweep=.014*Math.sin(a*2+phi*2)*Math.sin(phi),bulge=1+.028*Math.sin(a*15+phi*3)*Math.sin(phi);
  hairPositions.push(Math.sin(phi)*Math.sin(a)*.132*bulge+sweep,.038+Math.cos(phi)*.176,Math.sin(phi)*Math.cos(a)*.136*bulge-.008);hairUV.push(i/hs,j/hr);
 }
 for(let j=0;j<hr;j++)for(let i=0;i<hs;i++){let a=j*(hs+1)+i,b=a+hs+1;hairIndices.push(a,b,a+1,b,b+1,a+1)}
 let hg=new THREE.BufferGeometry();hg.setAttribute('position',new THREE.Float32BufferAttribute(hairPositions,3));hg.setAttribute('uv',new THREE.Float32BufferAttribute(hairUV,2));hg.setIndex(hairIndices);hg.computeVertexNormals();mesh(hg,hair,head);
 // Swept fringe, each strand follows a smooth surface curve across the scalp.
 for(let k=0;k<11;k++){let x=-.086+k*.015;path([[x,.074,.111],[x+.012,.12,.118],[x+.023,.172,.094],[x+.020,.207,.026]],.0035+k%3*.0005,k%3===0?hairLight:hair,head)}
 for(const sign of [-1,1])path([[sign*.109,.06,-.005],[sign*.112,.025,.002],[sign*.108,-.005,.003]],.009,hair,head);
 // Waist and crotch shaped as a soft garment, overlapping both upper legs.
 const pelvis=new THREE.Group();root.add(pelvis);
 // Both trouser legs share a continuous half-waist boundary at their upper rings.
 const waist=mesh(new THREE.TorusGeometry(.182,.006,8,64),pantSeam,pelvis);waist.rotation.x=Math.PI/2;waist.scale.y=.66;waist.position.y=.04;
 path([[-.15,.02,.072],[-.14,-.025,.111],[-.10,-.07,.115]],.002,pantSeam,pelvis);path([[.15,.02,.072],[.14,-.025,.111],[.10,-.07,.115]],.002,pantSeam,pelvis);
 path([[0,.03,.125],[0,-.035,.122],[.005,-.065,.117]],.002,pantSeam,pelvis);
 const chains=[[0,2,4],[1,3,5],[6,8,10],[7,9,11]],limbs=[];
 const rings=52,sides=28;
 function dynamicLimb(i){const pos=new Float32Array((rings+1)*(sides+1)*3),uv=[],indices=[];const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3).setUsage(THREE.DynamicDrawUsage));
  for(let j=0;j<=rings;j++)for(let k=0;k<=sides;k++)uv.push(k/sides,j/rings);
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  for(let j=0;j<rings;j++){let start=indices.length;for(let k=0;k<sides;k++){let a=j*(sides+1)+k,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1)}g.addGroup(start,indices.length-start,i<2&&j/rings<.205?1:0)}
  g.setIndex(indices);const limb=mesh(g,i<2?[skin,shirt]:pants),end=new THREE.Group();root.add(end);
  const fingerGroups=[];
  if(i<2){
   oval(end,skin,[0,-.038,0],[.034,.051,.020]);
   for(let f=0;f<4;f++){const finger=new THREE.Group();finger.position.set((f-1.5)*.016,-.069,.002);end.add(finger);fingerGroups.push(finger);const len=[.042,.051,.047,.035][f];oval(finger,skin,[0,-len*.35,0],[.008,len*.45,.009]);oval(finger,skin,[0,-len*.79,.002],[.007,len*.28,.008]);}
   const thumb=new THREE.Group();thumb.position.set(i===0?.029:-.029,-.023,.008);thumb.rotation.z=i===0?.50:-.5;end.add(thumb);oval(thumb,skin,[0,-.028,0],[.010,.032,.010]);fingerGroups.push(thumb);
   // Subtle palm crease keeps the hand readable at closer zoom.
   path([[-.022,-.038,.018],[0,-.045,.021],[.019,-.040,.018]],.0009,lip,end);
  }else{
   const foot=new THREE.Group();end.add(foot);
   oval(foot,sole,[0,-.080,.055],[.070,.019,.127]);oval(foot,shoe,[0,-.043,.057],[.067,.047,.124]);oval(foot,shoe,[0,-.015,.010],[.057,.048,.068]);
   for(let k=0;k<4;k++)path([[-.032,-.002,.052+k*.015],[0,.004,.057+k*.015],[.032,-.002,.052+k*.015]],.0025,shoe,foot);
   path([[-.061,-.048,.07],[-.050,-.032,.09],[-.025,-.028,.11]],.0018,sole,foot);path([[.061,-.048,.07],[.050,-.032,.09],[.025,-.028,.11]],.0018,sole,foot);
  }
  return {mesh:limb,end,fingerGroups};
 }
 for(let i=0;i<4;i++)limbs.push(dynamicLimb(i));
 const lerp=(a,b,t)=>a+(b-a)*t;
 function radiusAt(t,i){
  const knots=i<2?[[0,.047],[.08,.077],[.19,.073],[.215,.058],[.32,.058],[.47,.047],[.54,.047],[.66,.052],[.83,.042],[1,.029]]:[[0,.102],[.18,.109],[.35,.090],[.49,.075],[.56,.080],[.67,.088],[.83,.068],[1,.050]];
  for(let k=1;k<knots.length;k++)if(t<=knots[k][0]){let a=knots[k-1],b=knots[k],f=(t-a[0])/(b[0]-a[0]);return lerp(a[1],b[1],f)}return knots.at(-1)[1];
 }
 function updateLimb(i,p,handStyle){
  const [a,b,c]=chains[i],start=p[a].clone(),joint=p[b],end=p[c],part=limbs[i],pos=part.mesh.geometry.attributes.position;
  if(i<2)start.addScaledVector(p[1-a].clone().sub(p[a]).normalize(),.025).add(vec(0,-.020,0));
  // Quadratic blend around the joint provides a continuous elbow/knee surface.
  const pre=start.clone().lerp(joint,.83),post=joint.clone().lerp(end,.17);
  function center(t){if(t<.415)return start.clone().lerp(pre,t/.415);if(t>.585)return post.clone().lerp(end,(t-.585)/.415);const u=(t-.415)/.17;return pre.clone().multiplyScalar((1-u)**2).addScaledVector(joint,2*(1-u)*u).addScaledVector(post,u*u)}
  let previousRight=vec(1,0,0);
  for(let j=0;j<=rings;j++){
   let t=j/rings,cp=center(t),tangent=center(Math.min(1,t+.003)).sub(center(Math.max(0,t-.003))).normalize();
   let forward=vec(0,0,1).addScaledVector(tangent,-tangent.z).normalize();if(forward.lengthSq()<.1)forward=previousRight.clone().cross(tangent).normalize();
   let right=tangent.clone().cross(forward).normalize();if(j&&right.dot(previousRight)<0){right.negate();forward.negate()}previousRight.copy(right);
   let r=radiusAt(t,i),depth=i<2?.9:.89;
   for(let k=0;k<=sides;k++){let angle=k/sides*Math.PI*2,wrinkle=i>=2?.0018*Math.sin(t*58+angle*2)*Math.exp(-(((t-.52)/.18)**2)):0;let q=cp.clone().addScaledVector(right,Math.cos(angle)*(r+wrinkle)).addScaledVector(forward,Math.sin(angle)*(r+wrinkle)*depth);
    if(i>=2&&t<.23){const sign=i===2?-1:1,waist=vec(sign*.193*Math.max(-sign*Math.cos(angle),0),.055,.125*Math.sin(angle)).applyQuaternion(body.quaternion).add(body.position),blend=THREE.MathUtils.smoothstep(t,0,.23);q.lerp(waist,1-blend)}
    pos.setXYZ(j*(sides+1)+k,q.x,q.y,q.z)}
  }
  pos.needsUpdate=true;part.mesh.geometry.computeVertexNormals();part.mesh.geometry.computeBoundingSphere();part.end.position.copy(end);
  if(i<2){part.end.quaternion.setFromUnitVectors(vec(0,-1,0),end.clone().sub(joint).normalize());part.fingerGroups.forEach((f,j)=>{f.rotation.x=handStyle==='fist'?(j===4?-.55:-1.9):0})}
  else {const direction=end.clone().sub(joint);part.end.rotation.set(0,i===2?-.10:.10,THREE.MathUtils.clamp(direction.x*.12,-.12,.12))}
 }
 return {update(p,handStyle='open'){
  const center=p[6].clone().add(p[7]).multiplyScalar(.5),up=p[0].clone().add(p[1]).multiplyScalar(.5).sub(center).normalize(),right=p[1].clone().sub(p[0]).normalize(),front=right.clone().cross(up).normalize(),basis=new THREE.Matrix4().makeBasis(right,up,front);
  body.position.copy(center);body.quaternion.setFromRotationMatrix(basis);pelvis.position.copy(center);pelvis.quaternion.copy(body.quaternion);
  limbs.forEach((_,i)=>updateLimb(i,p,handStyle==='punch'&&(i===1||i===0)?'fist':'open'));
 },dispose(){textures.forEach(t=>t.dispose())}};
}
