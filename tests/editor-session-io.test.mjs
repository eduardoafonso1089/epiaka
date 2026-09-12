import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../app/editor/session/editor-session-io.ts',import.meta.url),'utf8');

test('session IO uses V4 image-pixel project APIs and canonical annotations',()=>{
  assert.match(source,/openPoligomeProjectV4/);
  assert.match(source,/savePoligomeProjectV4/);
  assert.match(source,/EditorAnnotation\[\]/);
  assert.doesNotMatch(source,/fromLegacyAnnotations|toLegacyAnnotations|ProjectV3/);
});

test('session IO composes real canonical codecs',()=>{
  assert.match(source,/annotationToCoco/);
  assert.match(source,/annotationToYolo/);
  assert.match(source,/annotationToGeoJsonGeometry/);
  assert.match(source,/cocoAnnotationToEditor/);
});
