import * as THREE from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createPoseRig} from './pose-rig.js?v=rigid-2';
// Source-textured articulated surfaces preserve their shape as joints rotate.
export function createTeachingCharacter(scene,{onReady=()=>{},onError=()=>{},onProgress=()=>{}}={}){
 let model,rig,disposed=false,latest,ready=false;
 function release(root){root.traverse(o=>{o.geometry?.dispose();const materials=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose()}})}
 const task=new GLTFLoader().loadAsync('/micro15-assets/student-articulated.glb?v=20261020-2',e=>onProgress(e.loaded,e.total));
 task.then(gltf=>{
  if(disposed){release(gltf.scene);return}
  model=gltf.scene;model.name='SuppliedStudent';scene.add(model);model.updateMatrixWorld(true);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.toneMapped=true;if(m.map){m.map.anisotropy=4;m.map.colorSpace=THREE.SRGBColorSpace}}}});
  rig=createPoseRig(model);
  ready=true;if(latest)update(latest);onReady();
 }).catch(error=>{if(!disposed)onError(error)});
 function update(p){
  latest=p.map(v=>v.clone());if(!ready||disposed)return;
  rig.update(p);
 }
 return {update,get isReady(){return ready},dispose(){disposed=true;if(model){release(model);model.removeFromParent()}}};
}
