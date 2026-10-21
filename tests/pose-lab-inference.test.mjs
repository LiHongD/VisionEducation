import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodePoseOutput,intersectionOverUnion,POINT_NAMES,SKELETON} from '../public/pose-lab-inference.js';

const options={width:320,height:160,scale:2,padX:0,padY:160};
function detection(score=.8){
  return [20,180,620,460,score,0,...Array.from({length:17},(_,i)=>[40+i*20,200+i*10,.95]).flat()];
}

test('official YOLO26 end-to-end output restores original-image coordinates and keypoint confidence',()=>{
  const [p]=decodePoseOutput(detection(),[1,1,57],options);
  assert.deepEqual(p.box,[10,10,310,150]);
  assert.deepEqual(p.keypoints[0],[20,20,.95]);
  assert.deepEqual(p.keypoints[16],[180,100,.95]);
  assert.equal(p.keypoints.length,17);
  assert.equal(POINT_NAMES[9],'左手腕');
  assert.ok(SKELETON.every(link=>link.every(i=>i>=0&&i<17)));
});

test('confidence threshold produces empty detections and filters invalid values/classes',()=>{
  assert.deepEqual(decodePoseOutput(detection(.8),[1,1,57],{...options,conf:.99}),[]);
  const otherClass=detection();otherClass[5]=1;
  const malformed=detection();malformed[6]=NaN;
  assert.deepEqual(decodePoseOutput([...otherClass,...malformed],[1,2,57],options),[]);
  assert.throws(()=>decodePoseOutput([],[1,17,3],options),/输出形状/);
});

test('end-to-end detections are already suppressed; sorting and max_det still apply',()=>{
  const people=decodePoseOutput([...detection(.5),...detection(.9),...detection(.7)],[1,3,57],{...options,maxDet:2});
  assert.deepEqual(people.map(p=>p.score),[.9,.7]);
});

test('raw YOLO output uses center-size boxes, channel-first layout and NMS',()=>{
  const rows=[.8,.9].map(score=>[320,320,600,280,score,...Array.from({length:17},()=>[40,200,.95]).flat()]);
  const channelFirst=Array.from({length:56},(_,c)=>rows.map(row=>row[c])).flat();
  const people=decodePoseOutput(channelFirst,[1,56,2],options);
  assert.equal(people.length,1);
  assert.equal(people[0].score,.9);
  assert.deepEqual(people[0].box,[10,10,310,150]);
  assert.equal(intersectionOverUnion([0,0,10,10],[20,20,30,30]),0);
  assert.equal(intersectionOverUnion([0,0,10,10],[0,0,10,10]),1);
});

test('out-of-image predictions are clamped, while non-finite output is rejected',()=>{
  const row=detection();row[0]=-10;row[3]=900;row[6]=-50;row[7]=1000;row[8]=2;
  const [p]=decodePoseOutput(row,[1,1,57],options);
  assert.deepEqual(p.keypoints[0],[0,160,1]);
  assert.deepEqual(p.box,[0,10,310,160]);
});
