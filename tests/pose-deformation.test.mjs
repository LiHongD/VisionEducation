import assert from 'node:assert/strict';
import * as THREE from '../public/vendor/three.module.min.js';
import {createPoseRig} from '../public/pose-rig.js';
import {PRESETS,POSE_CHAINS,makePreset,solveTwoBone} from '../public/pose-presets.js';
import {loadPoseModel} from './helpers/load-pose-model.mjs';

const model=await loadPoseModel(),rig=createPoseRig(model),meshes=[];
rig.update(makePreset('stand'));
model.traverse(mesh=>{if(!mesh.isSkinnedMesh)return;
 const points=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
 const index=mesh.geometry.index,edges=[];
 for(let j=0;j<index.count;j+=3)for(let k=0;k<3;k++){
  const a=index.getX(j+k),b=index.getX(j+(k+1)%3),length=points[a].distanceTo(points[b]);
  if(length>1e-4)edges.push([a,b,length]);
 }
 meshes.push({mesh,points,edges});
});
assert.ok(meshes.length>=26,'exercise the complete rendered mesh, including joint covers');
function verify(p,label){
 rig.update(p);let worst=0;
 for(const {mesh,points,edges} of meshes){
  const posed=points.map((_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  assert.ok(posed.every(v=>v.toArray().every(Number.isFinite)),label+' finite skin positions');
  for(const [a,b,length] of edges)worst=Math.max(worst,Math.abs(posed[a].distanceTo(posed[b])/length-1));
 }
 assert.ok(worst<1e-5,`${label}: surface stretched or collapsed by ${(worst*100).toFixed(3)}%`);
 model.traverse(o=>{if(o.isBone)assert.ok(Math.abs(o.matrixWorld.determinant()-1)<1e-5,label+' uses rotation and translation without scale')});
 console.log('✓',label,'— mesh edge lengths preserved');
}
for(const preset of PRESETS)verify(makePreset(preset.id),preset.label);
// The displayed transition poses also need to preserve shape, including quick
// changes from a raised hand directly into a bent leg stance.
for(const [from,to] of [['raise','horse'],['horse','balance'],['balance','bend']]){
 const a=makePreset(from),b=makePreset(to);
 for(const t of [.25,.5,.75]){
  const p=a.map((v,i)=>v.clone().lerp(b[i],t));
  for(let ci=0;ci<POSE_CHAINS.length;ci++){const c=POSE_CHAINS[ci];solveTwoBone(p,ci,p[c[2]].clone(),p[c[1]].clone())}
  verify(p,`${from} → ${to} (${t})`);
 }
}
// Manual torso lean and an independently moved wrist use the same rig path.
const manual=makePreset('stand'),center=manual[6].clone().add(manual[7]).multiplyScalar(.5),lean=new THREE.Quaternion().setFromEuler(new THREE.Euler(.25,0,.30));
for(let i=0;i<6;i++)manual[i].sub(center).applyQuaternion(lean).add(center);
solveTwoBone(manual,1,new THREE.Vector3(.6,1.75,.25),manual[3].clone().add(new THREE.Vector3(.1,.15,.1)));
verify(manual,'manual lean + wrist drag');
