import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {REST_POSE,POSE_CHAINS} from './pose-presets.js';
const vec=a=>new THREE.Vector3(...a);
const rest=REST_POSE.map(vec);
const restCenter=rest[6].clone().add(rest[7]).multiplyScalar(.5);
// The user's finished mesh and embedded PBR textures, with a Blender-bound rig.
export function createTeachingCharacter(scene,{onReady=()=>{},onError=()=>{},onProgress=()=>{}}={}){
 let model,disposed=false,latest,ready=false,bindings=[];
 const tempMatrix=new THREE.Matrix4(),deltaMatrix=new THREE.Matrix4(),q=new THREE.Quaternion(),unitScale=new THREE.Vector3(1,1,1);
 function release(root){root.traverse(o=>{o.geometry?.dispose();const materials=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose()}})}
 const task=new GLTFLoader().loadAsync('/micro15-assets/supplied-student-rigged.glb?v=20261020-2',e=>onProgress(e.loaded,e.total));
 task.then(gltf=>{
  if(disposed){release(gltf.scene);return}
  model=gltf.scene;model.name='SuppliedStudent';scene.add(model);model.updateMatrixWorld(true);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.toneMapped=true;if(m.map){m.map.anisotropy=4;m.map.colorSpace=THREE.SRGBColorSpace}}}});
  const mapping=[{name:'root',kind:'root'},{name:'body',kind:'body'}];
  POSE_CHAINS.forEach((c,ci)=>{mapping.push({name:`limb${ci}_upper`,kind:'limb',a:c[0],b:c[1]},{name:`limb${ci}_lower`,kind:'limb',a:c[1],b:c[2]},{name:`limb${ci}_end`,kind:ci<2?'hand':'foot',a:c[2],b:c[1]})});
  bindings=mapping.map(m=>{const bone=model.getObjectByName(m.name);if(!bone?.isBone)throw new Error('Missing rig bone: '+m.name);bone.matrixAutoUpdate=false;return {...m,bone,world:bone.matrixWorld.clone()}});
  ready=true;if(latest)update(latest);onReady();
 }).catch(error=>{if(!disposed)onError(error)});
 function update(p){
  latest=p.map(v=>v.clone());if(!ready||disposed)return;
  const center=p[6].clone().add(p[7]).multiplyScalar(.5),shoulders=p[0].clone().add(p[1]).multiplyScalar(.5),up=shoulders.clone().sub(center).normalize(),right=p[1].clone().sub(p[0]).normalize(),front=right.clone().cross(up).normalize();
  const bodyQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,front));
  for(const binding of bindings){
   const {bone,world,kind,a,b}=binding;let from,to;
   if(kind==='root'){from=restCenter;to=center;q.identity()}
   else if(kind==='body'){from=restCenter;to=center;q.copy(bodyQ)}
   else if(kind==='limb'){from=rest[a];to=p[a];q.setFromUnitVectors(rest[b].clone().sub(rest[a]).normalize(),p[b].clone().sub(p[a]).normalize())}
   else if(kind==='hand'){from=rest[a];to=p[a];q.setFromUnitVectors(rest[a].clone().sub(rest[b]).normalize(),p[a].clone().sub(p[b]).normalize())}
   else{from=rest[a];to=p[a];q.identity()}
   deltaMatrix.compose(to,q,unitScale).multiply(tempMatrix.makeTranslation(-from.x,-from.y,-from.z));
   const desired=deltaMatrix.clone().multiply(world);bone.matrix.copy(bone.parent.matrixWorld.clone().invert().multiply(desired));bone.updateMatrixWorld(true);
  }
  model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update()});
 }
 return {update,get isReady(){return ready},dispose(){disposed=true;if(model){release(model);model.removeFromParent()}}};
}
