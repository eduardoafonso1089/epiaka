import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controls=readFileSync(new URL('../app/editor/export/export-controls.tsx',import.meta.url),'utf8');
const raster=readFileSync(new URL('../app/editor/import/raster-import-control.tsx',import.meta.url),'utf8');
const tiled=readFileSync(new URL('../app/editor/raster/cog-tiled-layer.tsx',import.meta.url),'utf8');

test('new canonical controls translate thrown domain codes before showing UI text',()=>{
  for (const source of [controls,raster,tiled]) assert.match(source,/translateErrorCode/);
  assert.doesNotMatch(controls,/onMessage\?\.\(error instanceof Error \? error\.message/);
  assert.doesNotMatch(raster,/: error instanceof Error \? error\.message/);
  assert.doesNotMatch(tiled,/Falha ao abrir COG tiled/);
});

test('YOLO archive README uses the active locale copy',()=>{
  assert.match(controls,/exportEditorYoloZip\(assets, labels, annotations, copy\.yoloReadme\)/);
});
