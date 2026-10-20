import assert from 'node:assert/strict';
import {PRESETS,makePreset,POSE_CHAINS,BONE_LENGTHS} from '../public/pose-presets.js';
for(const preset of PRESETS){
 const p=makePreset(preset.id);assert.equal(p.length,12);
 for(const v of p)assert.ok(v.toArray().every(Number.isFinite),preset.id+' has finite points');
 for(let ci=0;ci<POSE_CHAINS.length;ci++){let [a,b,c]=POSE_CHAINS[ci];assert.ok(Math.abs(p[a].distanceTo(p[b])-BONE_LENGTHS[ci][0])<1e-8,preset.id+' upper bone length');assert.ok(Math.abs(p[b].distanceTo(p[c])-BONE_LENGTHS[ci][1])<1e-8,preset.id+' lower bone length')}
 assert.ok(p[10].y>=.10&&p[11].y>=.10,preset.id+' keeps feet above floor');
 console.log('✓',preset.label);
}
const a=makePreset('raise');assert.ok(a[5].y>a[1].y);const b=makePreset('horse');assert.ok(b[6].y<makePreset('stand')[6].y);assert.ok(b[10].distanceTo(b[11])>.8);const c=makePreset('balance');assert.ok(c[11].y>c[10].y+.3);assert.throws(()=>makePreset('invalid'));
console.log('All preset geometry checks passed.');
