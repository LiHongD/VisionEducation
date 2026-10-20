import {readFileSync} from 'node:fs';
import {GLTFLoader} from '../../public/vendor/GLTFLoader.js';

// Load the real binary mesh and skins in Node, omitting browser-only image decoding.
export async function loadPoseModel(){
 const bytes=readFileSync(new URL('../../public/micro15-assets/student-articulated.glb',import.meta.url));
 const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length));
 delete gltf.materials;delete gltf.images;delete gltf.textures;delete gltf.samplers;
 for(const mesh of gltf.meshes)for(const primitive of mesh.primitives)delete primitive.material;
 let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
 const bin=bytes.subarray(20+length),buffer=Buffer.alloc(20+json.length+bin.length);
 buffer.writeUInt32LE(0x46546c67,0);buffer.writeUInt32LE(2,4);buffer.writeUInt32LE(buffer.length,8);buffer.writeUInt32LE(json.length,12);buffer.writeUInt32LE(0x4e4f534a,16);json.copy(buffer,20);bin.copy(buffer,20+json.length);
 return (await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'')).scene;
}
