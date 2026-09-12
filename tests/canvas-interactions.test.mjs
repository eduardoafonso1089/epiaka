import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../app/editor/interactions/use-canvas-interactions.ts',import.meta.url),'utf8');

test('canvas interactions use gesture transactions for continuous edits',()=>{
  assert.match(source,/begin-gesture/);
  assert.match(source,/commit-gesture/);
  assert.match(source,/cancel-gesture/);
});

test('canvas interactions address vertices by stable id',()=>{
  assert.match(source,/vertexId/);
  assert.doesNotMatch(source,/vertexIndex/);
  assert.match(source,/update-vertex/);
  assert.match(source,/insert-vertex/);
});

test('canvas interactions operate on canonical box width and height',()=>{
  assert.match(source,/annotation\.width/);
  assert.match(source,/annotation\.height/);
  assert.doesNotMatch(source,/annotation\.w\b/);
  assert.doesNotMatch(source,/annotation\.h\b/);
});

test('marquee selection is scoped to the active asset and rendered from canonical selection state',()=>{
  assert.match(source,/activeAssetId/);
  assert.match(source,/annotation\.asset === activeAssetId/);
  assert.match(source,/selectionFromMarquee\(selectionScope/);
  assert.match(source,/selectionMarquee/);
});

test('modifier clicks update selection without starting a drag transaction',()=>{
  const shiftBranch=source.indexOf('if (event.shiftKey)');
  const additiveBranch=source.indexOf('if (additive)');
  const beginGesture=source.indexOf('dispatch({ type: "begin-gesture" })',additiveBranch);
  assert.ok(shiftBranch >= 0 && additiveBranch > shiftBranch && beginGesture > additiveBranch);
  assert.match(source,/toggle-selection/);
  assert.match(source,/selectRange/);
});
