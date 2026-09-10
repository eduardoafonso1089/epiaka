import test from 'node:test';
import assert from 'node:assert/strict';
import { ImageFraming, annotationPointerDelta } from '../app/lib/editor-viewport.ts';

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
