import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const buf=readFileSync(new URL('../public/micro15-assets/reference-student.glb',import.meta.url));
assert.equal(buf.readUInt32LE(0),0x46546c67);assert.equal(buf.readUInt32LE(8),buf.length);
const jsonLength=buf.readUInt32LE(12),gltf=JSON.parse(buf.subarray(20,20+jsonLength));const binary=buf.subarray(28+jsonLength);
assert.ok(gltf.extensionsUsed.includes('KHR_materials_unlit'));
assert.equal(gltf.skins[0].joints.length,14);
assert.ok(gltf.images.every(i=>Number.isInteger(i.bufferView)),'textures embedded in GLB');
function accessor(id){const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],size={5126:4,5123:2,5121:1}[a.componentType],dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],stride=v.byteStride||size*dim,base=(v.byteOffset||0)+(a.byteOffset||0);return {a,get(i,k){const offset=base+i*stride+k*size;return a.componentType===5126?binary.readFloatLE(offset):a.componentType===5123?binary.readUInt16LE(offset):binary.readUInt8(offset)}}}
let count=0;
for(const mesh of gltf.meshes)for(const p of mesh.primitives){
 const pos=accessor(p.attributes.POSITION),weights=accessor(p.attributes.WEIGHTS_0),joints=accessor(p.attributes.JOINTS_0);
 for(let i=0;i<pos.a.count;i++){for(let k=0;k<3;k++)assert.ok(Number.isFinite(pos.get(i,k)));let sum=0;for(let k=0;k<4;k++){sum+=weights.get(i,k);assert.ok(joints.get(i,k)<14)}assert.ok(Math.abs(sum-1)<1e-4,'normalized skinning weights')}count+=pos.a.count;
}
assert.ok(count>100000);console.log('✓ Blender GLB: embedded textures, 14 bones, finite positions and normalized skin weights ('+count+' vertices across primitives).');
