import assert from "node:assert/strict";
import test from "node:test";
import { annotationBounds, boxCorners } from "../app/lib/geometry.ts";

test("computes corners and selection bounds for a rotated bounding box", () => {
  const box = {
    id: "rotated",
    asset: "image",
    label: "object",
    type: "box",
    x: 400,
    y: 260,
    w: 200,
    h: 130,
    rotation: Math.PI / 2,
  };

  assert.deepEqual(
    boxCorners(box).map((coordinate) => Math.round(coordinate)),
    [565, 225, 565, 425, 435, 425, 435, 225],
  );
  const bounds = annotationBounds(box);
  assert.deepEqual(
    Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, Math.round(value)])),
    { x: 435, y: 225, width: 130, height: 200 },
  );
});
