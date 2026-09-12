import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewportTransform } from '../app/lib/editor-viewport.ts';

test('screen -> annotation -> screen is reversible', () => {
  const transform = new ViewportTransform(
    { left: 50, top: 25, width: 800, height: 520 },
    { width: 1920, height: 1080 },
  );
  const screen = { x: 410, y: 251 };
  const annotation = transform.screenToAnnotation(screen);
  const restored = transform.annotationToScreen(annotation);
  assert.ok(Math.abs(restored.x - screen.x) < 1e-9);
  assert.ok(Math.abs(restored.y - screen.y) < 1e-9);
});

test('annotation -> image -> annotation is reversible for arbitrary source images', () => {
  const transform = new ViewportTransform(
    { left: 0, top: 0, width: 1000, height: 650 },
    { width: 4032, height: 3024 },
  );
  const annotation = { x: 731.5, y: 284.25 };
  const image = transform.annotationToImage(annotation);
  const restored = transform.imageToAnnotation(image);
  assert.ok(Math.abs(restored.x - annotation.x) < 1e-9);
  assert.ok(Math.abs(restored.y - annotation.y) < 1e-9);
});

test('screen coordinates clamp to annotation bounds by default', () => {
  const transform = new ViewportTransform(
    { left: 100, top: 100, width: 500, height: 325 },
    { width: 1000, height: 650 },
  );
  assert.deepEqual(transform.screenToAnnotation({ x: -100, y: 1000 }), { x: 0, y: 650 });
});

test('screen deltas are independent of image resolution', () => {
  const low = new ViewportTransform(
    { left: 0, top: 0, width: 500, height: 325 },
    { width: 640, height: 480 },
  );
  const high = new ViewportTransform(
    { left: 0, top: 0, width: 500, height: 325 },
    { width: 8000, height: 6000 },
  );
  assert.deepEqual(low.screenDeltaToAnnotation(10, 5), high.screenDeltaToAnnotation(10, 5));
  assert.deepEqual(low.screenDeltaToAnnotation(10, 5), { x: 20, y: 10 });
});
