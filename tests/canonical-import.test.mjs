import test from 'node:test';
import assert from 'node:assert/strict';
import { cocoAnnotationToEditor, cocoGeometryTypes } from '../app/editor/import/coco-import.ts';

function ids(){let value=0;return()=>`a${++value}`;}

test('COCO polygon becomes canonical vertices with stable ids',()=>{
  const makeId=ids();
  const result=cocoAnnotationToEditor(
    {segmentation:[[0,0,100,0,100,100]]},
    {assetId:'img',sourceWidth:1000,sourceHeight:650,labelId:'weed',geometryTypes:new Set(['polygon']),annotationId:makeId},
  );
  assert.equal(result.length,1);
  assert.equal(result[0].type,'polygon');
  assert.deepEqual(result[0].vertices.map(vertex=>vertex.id),['a1:outer:v0','a1:outer:v1','a1:outer:v2']);
  assert.equal('pts' in result[0],false);
});

test('COCO bbox uses canonical width and height',()=>{
  const result=cocoAnnotationToEditor(
    {bbox:[100,65,200,130]},
    {assetId:'img',sourceWidth:1000,sourceHeight:650,labelId:'weed',geometryTypes:new Set(['box']),annotationId:()=> 'b'},
  );
  assert.deepEqual(result[0],{id:'b',asset:'img',label:'weed',type:'box',x:100,y:65,width:200,height:130});
});

test('COCO keypoints can select dedicated labels',()=>{
  const result=cocoAnnotationToEditor(
    {keypoints:[50,50,2],keypoint_names:['Nasion']},
    {assetId:'img',sourceWidth:100,height:100,labelId:'ceph',geometryTypes:new Set(['point']),annotationId:()=> 'p',pointLabelId:name=>name.toLowerCase()},
  );
  assert.equal(result[0].type,'point');
  assert.equal(result[0].label,'nasion');
  assert.deepEqual([result[0].x,result[0].y],[500,325]);
});

test('COCO geometry discovery identifies available representations',()=>{
  assert.deepEqual(cocoGeometryTypes({segmentation:[[0,0,10,0,10,10]],bbox:[0,0,10,10]}),['polygon','box']);
});
