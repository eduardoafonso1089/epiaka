import test from 'node:test';
import assert from 'node:assert/strict';
import { linkedVertices, nearestVertexIndex, nearbyVertexIndex, insertedVertexIndex } from '../app/editor/interactions/vertex-interactions.ts';

test('nearest vertex respects marker aspect and hit radius', () => {
  const points = [100, 100, 200, 100, 200, 200];
  assert.equal(nearestVertexIndex(points, { x: 198, y: 102 }, { maxDistance: 10 }), 1);
  assert.equal(nearestVertexIndex(points, { x: 150, y: 150 }, { maxDistance: 10 }), -1);
});

test('linked vertices groups near-coincident polygon and line nodes', () => {
  const annotations = [
    { id: 'a', asset: 'img', label: 'c', type: 'polygon', pts: [10, 10, 20, 10, 20, 20] },
    { id: 'b', asset: 'img', label: 'c', type: 'line', pts: [11, 11, 30, 30] },
  ];
  assert.deepEqual(linkedVertices(annotations, { x: 10, y: 10 }, 2), [
    { annotationId: 'a', vertexIndex: 0 },
    { annotationId: 'b', vertexIndex: 0 },
  ]);
});

test('nearby and inserted vertex helpers preserve legacy index semantics', () => {
  const points = [0, 0, 100, 0, 100, 100];
  assert.equal(nearbyVertexIndex(points, 102, 1, 5), 1);
  assert.equal(nearbyVertexIndex(points, 50, 50, 5), -1);
  assert.equal(insertedVertexIndex(2), 3);
});
