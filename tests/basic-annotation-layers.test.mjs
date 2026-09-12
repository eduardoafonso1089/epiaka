import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const box = await fs.readFile(new URL("../app/editor/layers/box-layer.tsx", import.meta.url), "utf8");
const point = await fs.readFile(new URL("../app/editor/layers/point-layer.tsx", import.meta.url), "utf8");

test("box layer owns canonical resize and rotation rendering contracts", () => {
  assert.match(box, /BoxAnnotation/);
  assert.match(box, /const \{ x, y, width, height \} = annotation/);
  assert.match(box, /width=\{width\}/);
  assert.match(box, /height=\{height\}/);
  assert.match(box, /box-resize-handle/);
  assert.match(box, /box-rotation-handle/);
  assert.match(box, /onResizeStart/);
  assert.match(box, /onRotateStart/);
  assert.match(box, /vectorEffect="non-scaling-stroke"/);
  assert.doesNotMatch(box, /annotation\.w\b/);
  assert.doesNotMatch(box, /annotation\.h\b/);
  assert.doesNotMatch(box, /\.\.\/\.\.\/lib\/types/);
});

test("point layer owns canonical selected point scaling and drag contract", () => {
  assert.match(point, /PointAnnotation/);
  assert.match(point, /selected \? 1\.32 : 1/);
  assert.match(point, /movable-annotation/);
  assert.match(point, /data-annotation-id/);
  assert.match(point, /annotation\.x/);
  assert.match(point, /annotation\.y/);
  assert.doesNotMatch(point, /\.\.\/\.\.\/lib\/types/);
});
