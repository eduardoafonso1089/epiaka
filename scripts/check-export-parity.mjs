import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import JSZip from 'jszip';

const root = process.cwd();
const mainRoot = resolve('.tmp-export-main');
const justifications = JSON.parse(readFileSync('tests/fixtures/export-parity-justifications.json', 'utf8'));

function round(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(8)) : value;
  if (Array.isArray(value)) return value.map(round);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, round(item)]));
  }
  return value;
}

function normalizeCoco(document) {
  const clone = JSON.parse(JSON.stringify(document));
  if (clone.info) delete clone.info.version;
  for (const annotation of clone.annotations ?? []) {
    if ((annotation.num_keypoints ?? 0) > 0) {
      delete annotation.bbox;
      delete annotation.area;
    }
  }
  return round(clone);
}

function geoReferenceFor(asset) {
  return {
    source: 'demo.tif', crs: 'EPSG:4326', originX: -45, originY: -20,
    scaleX: 0.0001, scaleY: -0.0001,
    sourceWidth: asset.width, sourceHeight: asset.height,
    window: { x: 0, y: 0, w: asset.width, h: asset.height },
    cropWidth: asset.width, cropHeight: asset.height,
    transform: [0.0001, 0, -45, 0, -0.0001, -20],
  };
}

function normalizeProjectAnnotation(annotation, asset, legacy) {
  const scaleX = legacy ? asset.width / 1000 : 1;
  const scaleY = legacy ? asset.height / 650 : 1;
  if (annotation.type === 'box') {
    return round({
      id: annotation.id, asset: annotation.asset, label: annotation.label, type: annotation.type,
      x: annotation.x * scaleX, y: annotation.y * scaleY,
      width: (legacy ? annotation.w : annotation.width) * scaleX,
      height: (legacy ? annotation.h : annotation.height) * scaleY,
      rotation: annotation.rotation ?? 0,
    });
  }
  if (annotation.type === 'point') {
    return round({ id: annotation.id, asset: annotation.asset, label: annotation.label, type: annotation.type, x: annotation.x * scaleX, y: annotation.y * scaleY });
  }
  const scaleFlat = (flat) => flat.map((coordinate, index) => coordinate * (index % 2 ? scaleY : scaleX));
  if (legacy) {
    return round({ id: annotation.id, asset: annotation.asset, label: annotation.label, type: annotation.type,
      vertices: scaleFlat(annotation.pts ?? []), holes: (annotation.holes ?? []).map(scaleFlat) });
  }
  return round({ id: annotation.id, asset: annotation.asset, label: annotation.label, type: annotation.type,
    vertices: annotation.vertices.flatMap((vertex) => [vertex.x, vertex.y]),
    holes: (annotation.holes ?? []).map((hole) => hole.flatMap((vertex) => [vertex.x, vertex.y])) });
}

async function zipSnapshot(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const output = {};
  for (const name of Object.keys(zip.files).sort()) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (/\.(txt|yaml|json)$/i.test(name)) output[name] = await entry.async('string');
    else output[name] = createHash('sha256').update(await entry.async('uint8array')).digest('hex');
  }
  return output;
}

async function projectManifest(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const document = JSON.parse(await zip.file('project.json').async('string'));
  if ('saved_at' in document) document.saved_at = '<timestamp>';
  return document;
}

rmSync(mainRoot, { recursive: true, force: true });
execFileSync('git', ['worktree', 'add', '--detach', mainRoot, 'origin/main'], { stdio: 'ignore' });
if (!existsSync(resolve(mainRoot, 'node_modules'))) symlinkSync(resolve(root, 'node_modules'), resolve(mainRoot, 'node_modules'), 'dir');

const objectBlobs = new Map();
let objectId = 0;
let lastBlob = null;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalFetch = globalThis.fetch;
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
URL.createObjectURL = (blob) => { const url = `blob:parity-${++objectId}`; objectBlobs.set(url, blob); lastBlob = blob; return url; };
URL.revokeObjectURL = () => {};
globalThis.document = { createElement: () => ({ style: {}, click() {}, remove() {} }), body: { appendChild() {} } };
globalThis.window = { setTimeout: (callback) => { callback(); return 1; } };
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.startsWith('/demo/')) return new Response(new Blob([`fixture:${url}`], { type: 'image/jpeg' }), { status: 200 });
  if (objectBlobs.has(url)) return new Response(objectBlobs.get(url), { status: 200 });
  return new Response(null, { status: 404 });
};

const moduleAt = (base, path) => import(`${pathToFileURL(resolve(base, path)).href}?parity=${Date.now()}-${Math.random()}`);

async function snapshot(base, legacy) {
  const demoModule = await moduleAt(base, 'app/lib/demo.ts');
  const i18n = await moduleAt(base, 'app/lib/i18n.ts');
  const demo = legacy ? await demoModule.createDemoProject('pt') : await demoModule.createCanonicalDemoProject('pt');
  const assets = demo.assets.map((asset) => ({ ...asset, geo: geoReferenceFor(asset) }));
  let coco, yolo, geojson, manifest;

  if (legacy) {
    const exporters = await moduleAt(base, 'app/lib/exporters.ts');
    lastBlob = null;
    exporters.exportCoco(assets, demo.labels, demo.annotations);
    coco = JSON.parse(await lastBlob.text());
    lastBlob = null;
    await exporters.exportYoloZip(assets, demo.labels, demo.annotations, 'golden');
    yolo = await zipSnapshot(lastBlob);
    geojson = exporters.annotationsToGeoJson(assets, demo.labels, demo.annotations).colecao;
    const project = await moduleAt(base, 'app/lib/project.ts');
    lastBlob = null;
    await project.savePoligomeProject(demo.name, assets, demo.labels, demo.annotations, 'annotations', i18n.getCopy('pt'));
    manifest = await projectManifest(lastBlob);
  } else {
    const exporters = await moduleAt(base, 'app/editor/export/export-files.ts');
    coco = JSON.parse(JSON.stringify(exporters.buildCocoDocument(assets, demo.labels, demo.annotations)));
    yolo = await zipSnapshot(await exporters.exportEditorYoloZip(assets, demo.labels, demo.annotations, 'golden'));
    geojson = JSON.parse(JSON.stringify(exporters.buildGeoJson(assets, demo.labels, demo.annotations)));
    const project = await moduleAt(base, 'app/lib/project.ts');
    lastBlob = null;
    await project.savePoligomeProjectV4(demo.name, assets, demo.labels, demo.annotations, 'annotations', i18n.getCopy('pt'));
    manifest = await projectManifest(lastBlob);
  }

  const assetMap = new Map(assets.map((asset) => [asset.id, asset]));
  return {
    coco, yolo, geojson, manifest,
    semanticProject: round({
      project_name: manifest.project_name,
      assets: manifest.assets.map((asset) => ({ id: asset.id, name: asset.name, width: asset.width, height: asset.height, missing: asset.missing })),
      labels: manifest.labels,
      annotations: manifest.annotations.map((annotation) => normalizeProjectAnnotation(annotation, assetMap.get(annotation.asset), legacy)),
    }),
  };
}

async function nonUniformYoloSnapshot(base, legacy) {
  const width = 4032;
  const height = 3024;
  const scaleX = width / 1000;
  const scaleY = height / 650;
  const asset = { id: 'nonuniform', name: 'nonuniform.jpg', src: '/demo/nonuniform.jpg', local: false, width, height };
  const labels = [{ id: 'target', name: 'target', color: '#6c8cff', key: '' }];
  const legacyAnnotations = [
    { id: 'box', asset: asset.id, label: labels[0].id, type: 'box', x: 100, y: 65, w: 300, h: 195, rotation: 0 },
    { id: 'polygon', asset: asset.id, label: labels[0].id, type: 'polygon', pts: [100, 65, 900, 65, 900, 585, 100, 585] },
  ];
  const canonicalAnnotations = [
    { id: 'box', asset: asset.id, label: labels[0].id, type: 'box', x: 100 * scaleX, y: 65 * scaleY, width: 300 * scaleX, height: 195 * scaleY, rotation: 0 },
    { id: 'polygon', asset: asset.id, label: labels[0].id, type: 'polygon', vertices: [
      { id: 'p0', x: 100 * scaleX, y: 65 * scaleY },
      { id: 'p1', x: 900 * scaleX, y: 65 * scaleY },
      { id: 'p2', x: 900 * scaleX, y: 585 * scaleY },
      { id: 'p3', x: 100 * scaleX, y: 585 * scaleY },
    ], holes: [] },
  ];
  lastBlob = null;
  if (legacy) {
    const exporters = await moduleAt(base, 'app/lib/exporters.ts');
    await exporters.exportYoloZip([asset], labels, legacyAnnotations, 'golden-nonuniform');
  } else {
    const exporters = await moduleAt(base, 'app/editor/export/export-files.ts');
    await exporters.exportEditorYoloZip([asset], labels, canonicalAnnotations, 'golden-nonuniform');
  }
  return zipSnapshot(lastBlob);
}

try {
  const main = await snapshot(mainRoot, true);
  const refactor = await snapshot(root, false);
  const mainNonUniformYolo = await nonUniformYoloSnapshot(mainRoot, true);
  const refactorNonUniformYolo = await nonUniformYoloSnapshot(root, false);
  assert.deepEqual(normalizeCoco(refactor.coco), normalizeCoco(main.coco), 'COCO demo golden diverged beyond explicitly tracked differences');
  assert.equal(refactor.coco.info.version, main.coco.info.version, 'COCO metadata version must remain externally compatible');
  assert.deepEqual(round(refactor.yolo), round(main.yolo), 'YOLO demo golden diverged');
  assert.deepEqual(round(refactorNonUniformYolo), round(mainNonUniformYolo), 'YOLO non-uniform source-dimension golden diverged');
  assert.equal(refactorNonUniformYolo['labels/train/0001-nonuniform.txt'], '0 0.250000 0.250000 0.300000 0.300000\n0 0.100000 0.100000 0.900000 0.100000 0.900000 0.900000 0.100000 0.900000');
  assert.deepEqual(round(refactor.geojson), round(main.geojson), 'GeoJSON demo golden diverged');
  assert.deepEqual(refactor.semanticProject, main.semanticProject, 'semantic .plgm demo content diverged');

  assert.equal(main.manifest.version, justifications['project.manifest.version'].main);
  assert.equal(refactor.manifest.version, justifications['project.manifest.version'].refactor);
  assert.equal(main.manifest.coordinate_space ?? null, justifications['project.coordinate_space'].main);
  assert.equal(refactor.manifest.coordinate_space ?? null, justifications['project.coordinate_space'].refactor);
  for (const [name, item] of Object.entries(justifications)) assert.ok(item.reason?.trim(), `${name} requires a reason`);
  console.log('Cross-branch goldens passed: demo COCO/YOLO/GeoJSON/.plgm parity plus non-uniform YOLO source-dimension parity; intentional differences are explicitly justified.');
} finally {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  globalThis.fetch = originalFetch;
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  try { execFileSync('git', ['worktree', 'remove', '--force', mainRoot], { stdio: 'ignore' }); } catch {}
  rmSync(mainRoot, { recursive: true, force: true });
}
