import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

test('canonical raster control preserves georeference metadata and uses the shared cropper', async () => {
  const source = await fs.readFile(new URL('../app/editor/import/raster-import-control.tsx', import.meta.url), 'utf8');
  assert.match(source, /readRasterSidecars/);
  assert.match(source, /CogCropDialog/);
  assert.match(source, /geo:\s*recorte\.geo/);
  assert.match(source, /URL\.createObjectURL\(recorte\.blob\)/);
  assert.match(source, /GeoTIFF \/ COG/);
});

test('canonical workbench installs raster crops as active V4 assets', async () => {
  const source = await fs.readFile(new URL('../app/editor/workbench/canonical-editor-workbench.tsx', import.meta.url), 'utf8');
  assert.match(source, /RasterImportControl/);
  assert.match(source, /setAssets\(\(items\) => \[\.\.\.items, result\.asset\]\)/);
  assert.match(source, /setCurrent\(result\.asset\.id\)/);
  assert.match(source, /objectUrls\.current\.push\(result\.objectUrl\)/);
});
