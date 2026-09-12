import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

const files = [
  '../app/lib/editor-viewport.ts',
  '../app/lib/touch-gestures.ts',
  '../app/editor/viewport/viewport-controller.ts',
  '../app/editor/viewport/svg-image-space.ts',
];

test('canonical viewport and touch stack contain no normalized annotation-space helpers', async () => {
  const sources = await Promise.all(files.map((path) => fs.readFile(new URL(path, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /DEFAULT_ANNOTATION_SPACE/);
  assert.doesNotMatch(source, /screenToAnnotation/);
  assert.doesNotMatch(source, /annotationToScreen/);
  assert.doesNotMatch(source, /annotationToImage/);
  assert.doesNotMatch(source, /imageToAnnotation/);
  assert.doesNotMatch(source, /nearestTouchVertex/);
  assert.doesNotMatch(source, /1000\s*[x×]\s*650/i);
});
