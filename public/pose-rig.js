import * as THREE from './vendor/three.module.min.js';
import {REST_POSE,POSE_CHAINS} from './pose-presets.js';

// Use rigid world-space transforms. No bone or body part is scaled by a pose.
export function createPoseRig(model){
 const rest=REST_POSE.map(a=>new THREE.Vector3(...a));
 const restCenter=rest[6].clone().add(rest[7]).multiplyScalar(.5);
 model.updateMatrixWorld(true);
 const mapping=[{name:'root',kind:'root'},{name:'body',kind:'body'}];
 POSE_CHAINS.forEach((c,ci)=>mapping.push(
  {name:`limb${ci}_upper`,kind:'limb',a:c[0],b:c[1]},
  {name:`limb${ci}_lower`,kind:'limb',a:c[1],b:c[2]},
  {name:`limb${ci}_end`,kind:ci<2?'hand':'foot',a:c[2],b:c[1]}
 ));
 const bindings=mapping.map(m=>{const bone=model.getObjectByName(m.name);if(!bone?.isBone)throw new Error('Missing rig bone: '+m.name);bone.matrixAutoUpdate=false;return {...m,bone,world:bone.matrixWorld.clone()}});
 const unitScale=new THREE.Vector3(1,1,1),q=new THREE.Quaternion();
 const translation=new THREE.Matrix4(),delta=new THREE.Matrix4(),desired=new THREE.Matrix4(),parentInverse=new THREE.Matrix4();
 return {update(p){
  const center=p[6].clone().add(p[7]).multiplyScalar(.5),shoulders=p[0].clone().add(p[1]).multiplyScalar(.5);
  const up=shoulders.clone().sub(center).normalize(),right=p[1].clone().sub(p[0]);
  // Gram-Schmidt keeps the torso frame orthonormal even after manual edits.
  right.addScaledVector(up,-right.dot(up)).normalize();
  const front=right.clone().cross(up).normalize();
  const bodyQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,front)).normalize();
  for(const {bone,world,kind,a,b} of bindings){
   let from,to;
   if(kind==='root'){from=restCenter;to=center;q.identity()}
   else if(kind==='body'){from=restCenter;to=center;q.copy(bodyQ)}
   else if(kind==='limb'){from=rest[a];to=p[a];q.setFromUnitVectors(rest[b].clone().sub(rest[a]).normalize(),p[b].clone().sub(p[a]).normalize())}
   else if(kind==='hand'){from=rest[a];to=p[a];q.setFromUnitVectors(rest[a].clone().sub(rest[b]).normalize(),p[a].clone().sub(p[b]).normalize())}
   else{from=rest[a];to=p[a];q.identity()}
   delta.compose(to,q,unitScale).multiply(translation.makeTranslation(-from.x,-from.y,-from.z));
   desired.copy(delta).multiply(world);
   bone.matrix.copy(parentInverse.copy(bone.parent.matrixWorld).invert().multiply(desired));bone.updateMatrixWorld(true);
  }
  model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update()});
 }};
}
