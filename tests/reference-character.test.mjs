import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const buf=readFileSync(new URL('../public/micro15-assets/student-articulated.glb',import.meta.url));
assert.equal(buf.readUInt32LE(0),0x46546c67);assert.equal(buf.readUInt32LE(8),buf.length);
const jsonLength=buf.readUInt32LE(12),gltf=JSON.parse(buf.subarray(20,20+jsonLength));const binary=buf.subarray(28+jsonLength);
assert.equal(gltf.skins[0].joints.length,14);
const names=gltf.skins[0].joints.map(i=>gltf.nodes[i].name);
assert.ok(['root','body',...Array.from({length:4},(_,i)=>['upper','lower','end'].map(k=>`limb${i}_${k}`)).flat()].every(n=>names.includes(n)),'control rig matches page controller');
assert.ok(gltf.materials.some(m=>m.pbrMetallicRoughness?.baseColorTexture),'original textured material retained');
assert.ok(gltf.images.every(i=>Number.isInteger(i.bufferView)),'textures embedded in GLB');
function accessor(id){const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView],size={5126:4,5123:2,5121:1}[a.componentType],dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],stride=v.byteStride||size*dim,base=(v.byteOffset||0)+(a.byteOffset||0);return {a,get(i,k){const offset=base+i*stride+k*size;return a.componentType===5126?binary.readFloatLE(offset):a.componentType===5123?binary.readUInt16LE(offset):binary.readUInt8(offset)}}}
let count=0;
assert.equal(gltf.nodes.filter(n=>n.mesh!==undefined).length,28,'source body/limb surfaces, pelvis, interior closure and 12 joint surfaces');
for(const mesh of gltf.meshes)for(const p of mesh.primitives){
 const pos=accessor(p.attributes.POSITION),weights=accessor(p.attributes.WEIGHTS_0),joints=accessor(p.attributes.JOINTS_0);
 const bone=joints.get(0,0);
 for(let i=0;i<pos.a.count;i++){for(let k=0;k<3;k++)assert.ok(Number.isFinite(pos.get(i,k)));assert.equal(weights.get(i,0),1,'no distant-body weight blending');assert.equal(joints.get(i,0),bone,'one rigid segment per surface');for(let k=1;k<4;k++)assert.equal(weights.get(i,k),0)}count+=pos.a.count;
}
assert.ok(count>24000,'detailed source surfaces plus closed joints');console.log('✓ Articulated GLB: embedded textures, 14 bones, 28 parts, finite positions and rigid weights ('+count+' vertices).');
