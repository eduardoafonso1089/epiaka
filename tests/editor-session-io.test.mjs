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

test('session IO stays a narrow project and demo boundary instead of re-exporting codec facades',()=>{
  assert.match(source,/createCanonicalDemoProject/);
  assert.doesNotMatch(source,/annotationToCoco|annotationToYolo|annotationToGeoJsonGeometry|cocoAnnotationToEditor|cocoGeometryTypes/);
  assert.doesNotMatch(source,/editorAnnotationsToCoco|editorAnnotationToYolo|editorAnnotationToGeoJson|importEditorCocoAnnotation|editorCocoGeometryTypes/);
});
