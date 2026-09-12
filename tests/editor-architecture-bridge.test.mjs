import test from 'node:test';
import assert from 'node:assert/strict';
import { interactionModeForTool } from '../app/editor/runtime/editor-architecture-bridge.tsx';

test('annotation tools map to a single explicit interaction family', () => {
  assert.equal(interactionModeForTool('select'), 'select');
  assert.equal(interactionModeForTool('pan'), 'pan');
  for (const tool of ['box', 'polygon', 'ring', 'freehand', 'line', 'point']) {
    assert.equal(interactionModeForTool(tool), 'draw');
  }
  for (const tool of ['reshape', 'split']) {
    assert.equal(interactionModeForTool(tool), 'edit');
  }
  assert.equal(interactionModeForTool('transform'), 'resize');
  assert.equal(interactionModeForTool('sam'), 'model');
});

test('unknown tools degrade safely to selection instead of creating overlapping modes', () => {
  assert.equal(interactionModeForTool('future-tool'), 'select');
});
