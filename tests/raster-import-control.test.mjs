import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('canonical raster control preserves georeference metadata and keeps localized crop mode available', async () => {
  const source = await fs.readFile(new URL('../app/editor/import/raster-import-control.tsx', import.meta.url), 'utf8');
  assert.match(source, /readRasterSidecars/);
  assert.match(source, /CogCropDialog/);
  assert.match(source, /geo:\s*recorte\.geo/);
  assert.match(source, /URL\.createObjectURL\(recorte\.blob\)/);
  assert.match(source, /getCopy\(language \?\? storedLanguage\(\)\)/);
  assert.match(source, /copy\.cogOpenTiff/);
  assert.match(source, /copy\.cogModeRect/);
});

test('canonical raster control opens local and remote COGs as native tiled assets independent of UI language', async () => {
  const source = await fs.readFile(new URL('../app/editor/import/raster-import-control.tsx', import.meta.url), 'utf8');
  assert.match(source, /createTiledRasterAsset/);
  assert.match(source, /copy\.cogOpenTiff/);
  assert.match(source, /COG URL/);
  assert.match(source, /new URL\(value\)/);
  assert.match(source, /\^https\?:\$/);
  assert.match(source, /origin:\s*source/);
});

test('canonical workbench installs raster assets and renders tiled COGs behind annotations', async () => {
  const source = await fs.readFile(new URL('../app/editor/workbench/canonical-editor-workbench.tsx', import.meta.url), 'utf8');
  assert.match(source, /RasterImportControl/);
  assert.match(source, /CogTiledLayer/);
  assert.match(source, /asset\?\.raster\?\.mode === "tiled"/);
  assert.match(source, /setAssets\(\(items\) => \[\.\.\.items, result\.asset\]\)/);
  assert.match(source, /setCurrent\(result\.asset\.id\)/);
  assert.match(source, /if \(result\.objectUrl\) objectUrls\.current\.push\(result\.objectUrl\)/);
});
