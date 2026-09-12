import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vertexHandles = readFileSync(new URL('../app/editor/layers/vertex-handles.tsx', import.meta.url), 'utf8');
const polygonLayer = readFileSync(new URL('../app/editor/layers/polygon-layer.tsx', import.meta.url), 'utf8');
const polylineLayer = readFileSync(new URL('../app/editor/layers/polyline-layer.tsx', import.meta.url), 'utf8');

test('vertex handles adapt persisted flat points to stable editor vertex ids', () => {
  assert.match(vertexHandles, /verticesFromFlatPoints/);
  assert.match(vertexHandles, /data-vertex-id/);
  assert.match(vertexHandles, /\$\{annotationId\}:v\$\{index\}/);
});

test('polygon and polyline layers share the same vertex controls', () => {
  assert.match(polygonLayer, /<VertexHandles/);
  assert.match(polylineLayer, /<VertexHandles/);
  assert.match(polylineLayer, /open/);
});

test('extracted layers remain presentational and expose annotation ids', () => {
  assert.match(polygonLayer, /data-annotation-id=\{annotation\.id\}/);
  assert.match(polylineLayer, /data-annotation-id=\{annotation\.id\}/);
  assert.doesNotMatch(polygonLayer, /useState\(/);
  assert.doesNotMatch(polylineLayer, /useState\(/);
});
