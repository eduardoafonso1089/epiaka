import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageFraming, annotationPointerDelta, canvasLayout } from '../app/lib/editor-viewport.ts';

test('selecting an image object prevents all subsequent automatic fits of that image', () => {
  const framing = new ImageFraming();
  assert.equal(framing.fit('a', false), false);
  assert.equal(framing.fit('a', true), true);
  framing.keep('a');
  for (let i = 0; i < 10; i++) assert.equal(framing.fit('a', true), false);
  assert.equal(framing.fit('b', true), true);
});

test('selection before a delayed image fit preserves user framing', () => {
  const framing = new ImageFraming();
  framing.keep('a');
  assert.equal(framing.fit('a', true), false);
});

test('a stationary click and finger jitter never move a polygon at any zoom', () => {
  for (const width of [320, 1000, 4000]) {
    const start = { clientX: 150, clientY: 80, width, height: width * 0.65 };
    assert.deepEqual(annotationPointerDelta(start, 150, 80), { dx: 0, dy: 0, moved: false });
    assert.equal(annotationPointerDelta(start, 153, 83).moved, false);
  }
});

test('drag uses the original screen frame, independently of subsequent selection layout', () => {
  const start = { clientX: 150, clientY: 80, width: 500, height: 325 };
  assert.deepEqual(annotationPointerDelta(start, 160, 85), { dx: 20, dy: 10, moved: true });
});


test('mobile canvas at 92% has an explicit size and centered origin', () => {
  assert.deepEqual(canvasLayout({ width: 350, height: 480 }, { width: 1200, height: 780 }, 92), {
    width: 322, height: 209.3, left: 14, top: 135.35, surfaceWidth: 350, surfaceHeight: 480,
  });
});

test('zoomed canvas keeps full overflow dimensions and a reachable top-left corner', () => {
  assert.deepEqual(canvasLayout({ width: 350, height: 480 }, { width: 1200, height: 780 }, 200), {
    width: 700, height: 455, left: 0, top: 12.5, surfaceWidth: 700, surfaceHeight: 480,
  });
  const tall = canvasLayout({ width: 350, height: 480 }, { width: 500, height: 2000 }, 100);
  assert.equal(tall.height, 1400);
  assert.equal(tall.top, 0);
  assert.equal(tall.surfaceHeight, 1400);
});

test('touch navigation adds room beyond every overflowing image edge', () => {
  assert.deepEqual(canvasLayout({ width: 350, height: 480 }, { width: 1200, height: 780 }, 200, true), {
    width: 700, height: 455, left: 175, top: 12.5, surfaceWidth: 1050, surfaceHeight: 480,
  });
  const tall = canvasLayout({ width: 350, height: 480 }, { width: 500, height: 2000 }, 100, true);
  assert.equal(tall.top, 240);
  assert.equal(tall.surfaceHeight, 1880);
});
