import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const box = await fs.readFile(new URL("../app/editor/layers/box-layer.tsx", import.meta.url), "utf8");
const point = await fs.readFile(new URL("../app/editor/layers/point-layer.tsx", import.meta.url), "utf8");

test("box layer owns box resize and rotation rendering contracts", () => {
  assert.match(box, /box-resize-handle/);
  assert.match(box, /box-rotation-handle/);
  assert.match(box, /onResizeStart/);
  assert.match(box, /onRotateStart/);
  assert.match(box, /vectorEffect="non-scaling-stroke"/);
});

test("point layer owns selected point scaling and drag contract", () => {
  assert.match(point, /selected \? 1\.32 : 1/);
  assert.match(point, /movable-annotation/);
  assert.match(point, /onPointerDown/);
  assert.match(point, /annotation\.x/);
  assert.match(point, /annotation\.y/);
});
