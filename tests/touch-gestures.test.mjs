import assert from "node:assert/strict";
import test from "node:test";
import { TouchGesture, pinchZoom, nearestTouchVertex, touchToolUsesTap } from "../app/lib/touch-gestures.ts";

test("one finger commits one point only on release, tolerating small finger jitter", () => {
  const gesture = new TouchGesture();
  assert.equal(gesture.down(1, 50, 70), false);
  gesture.move(1, 54, 73);
  assert.deepEqual(gesture.end(1), { tracked: true, blocked: false, tap: true });
  assert.equal(gesture.end(1).tap, false);
});

test("dragging or dragging back to the origin does not create a polygon point", () => {
  const gesture = new TouchGesture();
  gesture.down(1, 50, 70);
  gesture.move(1, 80, 70);
  gesture.move(1, 50, 70);
  assert.equal(gesture.end(1).tap, false);
});

test("second finger switches to navigation and neither release commits a point", () => {
  const gesture = new TouchGesture();
  gesture.down(1, 50, 70);
  assert.equal(gesture.down(2, 150, 70), true);
  assert.deepEqual(gesture.pair(), { x: 100, y: 70, distance: 100 });
  assert.deepEqual(gesture.end(2), { tracked: true, blocked: true, tap: false });
  gesture.move(1, 80, 70);
  assert.equal(gesture.navigating, true);
  assert.equal(gesture.end(1).blocked, true);
  gesture.down(3, 50, 70);
  assert.equal(gesture.end(3).tap, true);
});

test("three fingers and reversed release order remain locked until all lift", () => {
  const gesture = new TouchGesture();
  gesture.down(1, 0, 0); gesture.down(2, 20, 0); gesture.down(3, 40, 0);
  assert.equal(gesture.end(1).tap, false);
  assert.deepEqual(gesture.pair(), { x: 30, y: 0, distance: 20 });
  assert.equal(gesture.end(2).tap, false);
  assert.equal(gesture.navigating, true);
  assert.equal(gesture.end(3).tap, false);
  assert.equal(gesture.navigating, false);
});

test("pointer cancellation never commits a tap and a new gesture can start", () => {
  const gesture = new TouchGesture();
  gesture.down(1, 1, 1);
  assert.deepEqual(gesture.end(1, true), { tracked: true, blocked: true, tap: false });
  gesture.down(2, 1, 1);
  assert.equal(gesture.end(2).tap, true);
});

test("cancelling one pointer of a pinch does not reactivate drawing with the other", () => {
  const gesture = new TouchGesture();
  gesture.down(1, 1, 1); gesture.down(2, 10, 10);
  gesture.end(1, true);
  assert.equal(gesture.navigating, true);
  assert.equal(gesture.end(2).tap, false);
});

test("pinch zoom preserves starting zoom and clamps both zoom limits", () => {
  assert.equal(pinchZoom(92, 100, 200), 184);
  assert.equal(pinchZoom(92, 100, 50), 46);
  assert.equal(pinchZoom(300, 100, 200), 400);
  assert.equal(pinchZoom(20, 100, 1), 10);
  assert.equal(pinchZoom(92, 0, 100), 400);
});

test("all discrete creation tools defer touch actions; drawing and editing support dragging", () => {
  for (const tool of ["polygon", "ring", "line", "point", "sam", "split"]) assert.equal(touchToolUsesTap(tool), true, tool);
  for (const tool of ["box", "freehand", "reshape", "select", "transform", "pan"]) assert.equal(touchToolUsesTap(tool), false, tool);
});

test("overlapping vertex targets choose the closest point on a narrow mobile canvas", () => {
  const points = [100, 100, 180, 100, 300, 400];
  assert.equal(nearestTouchVertex(points, 110, 100, 320, 208), 0);
  assert.equal(nearestTouchVertex(points, 170, 100, 320, 208), 1);
  assert.equal(nearestTouchVertex(points, 500, 500, 320, 208), -1);
});

test("vertex hit radius uses screen pixels at different zoom levels and aspect ratios", () => {
  const points = [100, 100];
  assert.equal(nearestTouchVertex(points, 160, 100, 320, 208), 0);
  assert.equal(nearestTouchVertex(points, 160, 100, 1280, 832), -1);
  assert.equal(nearestTouchVertex(points, 100, 140, 320, 650), -1);
  assert.equal(nearestTouchVertex(points, 100, 140, 320, 208), 0);
});
