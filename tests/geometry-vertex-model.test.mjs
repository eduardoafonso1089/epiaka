import test from "node:test";
import assert from "node:assert/strict";
import {
  deletePolygonVertex,
  edgeMidpoints,
  insertPolygonVertex,
  updatePolygonVertex,
} from "../app/lib/geometry.ts";

test("vertex geometry keeps flat persisted representation", () => {
  const points = [10, 10, 100, 10, 100, 100, 10, 100];
  const inserted = insertPolygonVertex(points, 0, 55, 10);
  assert.deepEqual(inserted, [10, 10, 55, 10, 100, 10, 100, 100, 10, 100]);

  const moved = updatePolygonVertex(inserted, 1, 60, 20);
  assert.deepEqual(moved, [10, 10, 60, 20, 100, 10, 100, 100, 10, 100]);

  const deleted = deletePolygonVertex(moved, 1);
  assert.deepEqual(deleted, points);
});

test("vertex geometry preserves overlap guards and editor bounds", () => {
  const points = [10, 10, 100, 10, 100, 100];
  assert.equal(updatePolygonVertex(points, 0, 99, 10), points);
  assert.deepEqual(updatePolygonVertex(points, 0, -50, 900), [0, 650, 100, 10, 100, 100]);
  assert.equal(insertPolygonVertex(points, 0, 12, 12), points);
});

test("edge midpoint semantics remain compatible for polygons and open lines", () => {
  assert.deepEqual(edgeMidpoints([0, 0, 100, 0, 100, 100]), [
    { x: 50, y: 0, edgeIndex: 0 },
    { x: 100, y: 50, edgeIndex: 1 },
    { x: 50, y: 50, edgeIndex: 2 },
  ]);
  assert.deepEqual(edgeMidpoints([0, 0, 100, 0, 100, 100], true), [
    { x: 50, y: 0, edgeIndex: 0 },
    { x: 100, y: 50, edgeIndex: 1 },
  ]);
});
