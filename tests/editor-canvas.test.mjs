import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas=readFileSync(new URL('../app/editor/canvas/editor-canvas.tsx',import.meta.url),'utf8');
const dispatcher=readFileSync(new URL('../app/editor/layers/annotation-layer.tsx',import.meta.url),'utf8');
const selection=readFileSync(new URL('../app/editor/selection/selection-model.ts',import.meta.url),'utf8');

test('canonical canvas renders through the annotation dispatcher in source-image space',()=>{
  assert.match(canvas,/EditorAnnotation\[\]/);
  assert.match(canvas,/imageSize/);
  assert.match(canvas,/viewBox=\{`0 0 \$\{width\} \$\{height\}`\}/);
  assert.doesNotMatch(canvas,/viewBox="0 0 1000 650"/);
  assert.match(canvas,/<AnnotationLayer/);
  assert.match(canvas,/<SelectionLayer/);
  assert.doesNotMatch(canvas,/\.pts\b/);
  assert.doesNotMatch(canvas,/\.w\b|\.h\b/);
  assert.doesNotMatch(canvas,/lib\/geometry/);
});

test('annotation dispatcher owns geometry-specific layer routing',()=>{
  for(const component of ['PolygonLayer','PolylineLayer','BoxLayer','PointLayer']) assert.match(dispatcher,new RegExp(component));
  assert.match(dispatcher,/vertexId/);
  assert.doesNotMatch(dispatcher,/vertexIndex/);
  assert.doesNotMatch(dispatcher,/\.pts\b/);
});

test('selection model is independent from legacy annotation and geometry modules',()=>{
  assert.match(selection,/EditorAnnotation/);
  assert.match(selection,/annotation-geometry/);
  assert.doesNotMatch(selection,/lib\/types/);
  assert.doesNotMatch(selection,/lib\/geometry/);
});
