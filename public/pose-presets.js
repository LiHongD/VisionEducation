import * as THREE from './vendor/three.module.min.js';
export const REST_POSE=[[-.178,1.40,0],[.178,1.40,0],[-.264,1.10,0],[.264,1.10,0],[-.313,.855,0],[.313,.855,0],[-.095,.84,0],[.095,.84,0],[-.117,.46,0],[.117,.46,0],[-.133,.105,0],[.133,.105,0]];
export const POSE_CHAINS=[[0,2,4],[1,3,5],[6,8,10],[7,9,11]];
export const PRESETS=[
 {id:'stand',label:'自然站立',description:'先观察身体的自然位置，再选择一个动作。'},
 {id:'raise',label:'单臂举手',description:'比较两侧的点位：一只手抬高时，哪些点发生了变化？'},
 {id:'reach',label:'双臂平举',description:'从正面与侧面看一看，同一姿态的点位有什么不同？'},
 {id:'bend',label:'屈臂抬手',description:'与直臂举手比较：同样是抬手，连接关系怎样变化？'},
 {id:'horse',label:'马步',description:'注意身体降低、双腿分开时，相邻的点怎样一起移动。'},
 {id:'punch',label:'弓步冲拳',description:'转到侧面，观察前后方向上的变化。'},
 {id:'balance',label:'提膝亮掌',description:'一条腿抬起时，比较两侧点位的不同。'}
];
const V=a=>new THREE.Vector3(...a);
export const BONE_LENGTHS=POSE_CHAINS.map(c=>[V(REST_POSE[c[0]]).distanceTo(V(REST_POSE[c[1]])),V(REST_POSE[c[1]]).distanceTo(V(REST_POSE[c[2]]))]);
export function solveTwoBone(p,ci,end,pole){
 const c=POSE_CHAINS[ci],a=p[c[0]],b=p[c[1]],d=p[c[2]],[l1,l2]=BONE_LENGTHS[ci];
 const axis=end.clone().sub(a),dist=THREE.MathUtils.clamp(axis.length(),Math.abs(l1-l2)+.015,l1+l2-.002);if(axis.length()<.0001)axis.set(0,-1,0);axis.normalize();
 const bend=(pole||b).clone().sub(a);bend.addScaledVector(axis,-bend.dot(axis));if(bend.length()<.0001){bend.copy(ci<2?new THREE.Vector3(ci===0?-1:1,0,.5):new THREE.Vector3(0,0,1));bend.addScaledVector(axis,-bend.dot(axis))}if(bend.length()<.0001)bend.set(1,0,0).addScaledVector(axis,-axis.x);bend.normalize();
 const along=(l1*l1-l2*l2+dist*dist)/(2*dist),height=Math.sqrt(Math.max(0,l1*l1-along*along));b.copy(a).addScaledVector(axis,along).addScaledVector(bend,height);d.copy(a).addScaledVector(axis,dist);
}
export function makePreset(id){
 if(!PRESETS.some(x=>x.id===id))throw new Error('Unknown pose preset');
 const p=REST_POSE.map(V);
 function torso(y,tilt=0){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt,0,0));for(let i=0;i<8;i++)p[i].copy(V(REST_POSE[i]).sub(new THREE.Vector3(0,(REST_POSE[6][1]+REST_POSE[7][1])/2,0)).applyQuaternion(q).add(new THREE.Vector3(0,y,0)))}
 const set=(ci,end,pole)=>solveTwoBone(p,ci,V(end),pole?V(pole):undefined);
 if(id==='raise')set(1,[.42,2.10,.015],[.44,1.80,.01]);
 if(id==='reach'){set(0,[-.91,1.48,0],[-.58,1.48,.025]);set(1,[.91,1.48,0],[.58,1.48,.025])}
 if(id==='bend'){set(0,[-.33,1.72,.14],[-.59,1.44,.04]);set(1,[.33,1.72,.14],[.59,1.44,.04])}
 if(id==='horse'){torso(.69);set(2,[-.48,.115,.04],[-.53,.50,.28]);set(3,[.48,.115,.04],[.53,.50,.28]);set(0,[-.23,.88,.13],[-.31,1.08,-.07]);set(1,[.23,.88,.13],[.31,1.08,-.07])}
 if(id==='punch'){torso(.71,.06);set(2,[-.23,.115,.40],[-.24,.49,.55]);set(3,[.26,.115,-.38],[.29,.43,-.22]);set(1,[.25,1.31,.65],[.29,1.30,.35]);set(0,[-.30,.99,.08],[-.43,1.20,.02])}
 if(id==='balance'){torso(.84);set(2,[-.17,.105,0],[-.18,.49,.06]);set(3,[.19,.63,.32],[.19,.91,.43]);set(1,[.44,1.98,.10],[.58,1.68,.04]);set(0,[-.53,1.10,.34],[-.55,1.29,.11])}
 return p;
}
