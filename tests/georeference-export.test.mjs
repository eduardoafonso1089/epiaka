import assert from 'node:assert/strict';
import test from 'node:test';
import { annotationsToGeoJson, paraCoordenada } from '../app/lib/exporters.ts';
import { geoReference } from '../app/lib/georeference.ts';
import { toWgs84 } from '../app/lib/projections.ts';

const geo = (crs, transform) => geoReference('source.tif',2000,1000,{crs,transform});
const asset = (id, crs, transform) => ({id,name:`${id}.png`,src:'',geo:geo(crs,transform)});
const point = id => ({id:`p-${id}`,asset:id,label:'weed',type:'point',x:0,y:0});

test('source pixel mapping preserves rotated transforms and crop scaling independently of PNG dimensions', () => {
  const image = asset('a','EPSG:4326',[0.01,0.002,-47,0.003,-0.01,-21]);
  image.geo.window={x:100,y:50,w:800,h:600}; image.geo.cropWidth=400; image.geo.cropHeight=300;
  assert.deepEqual(paraCoordenada(image,500,325),[-41.3,-23]);
});

test('legacy north-up georeferences retain their coordinate mapping', () => {
  const image=asset('a','EPSG:4326',[0.01,0,-47,0,-0.01,-21]); delete image.geo.transform;
  assert.deepEqual(paraCoordenada(image,500,325),[-37,-26]);
});

test('mixed UTM zones are reprojected to RFC 7946 WGS84 without a legacy CRS member', () => {
  const result=annotationsToGeoJson([asset('a','EPSG:32622',[1,0,500000,0,-1,0]),asset('b','EPSG:32623',[1,0,500000,0,-1,0])],[],[point('a'),point('b')]);
  assert.equal(result.total,2); assert.equal('crs' in result.colecao,false);
  assert.ok(Math.abs(result.colecao.features[0].geometry.coordinates[0]+51)<1e-8);
  assert.ok(Math.abs(result.colecao.features[1].geometry.coordinates[0]+45)<1e-8);
});

test('SIRGAS 2000 / UTM 23S and a supplied PROJ definition work offline', () => {
  const p=toWgs84('EPSG:31983')([500000,10000000]);
  assert.ok(Math.abs(p[0]+45)<1e-8); assert.ok(Math.abs(p[1])<1e-8);
  assert.deepEqual(toWgs84('+proj=longlat +datum=WGS84 +no_defs')([-47,-21]),[-47,-21]);
});

test('missing/unknown CRS and unreferenced annotated assets fail explicitly', () => {
  assert.throws(()=>annotationsToGeoJson([asset('a','sem CRS',[1,0,0,0,-1,0])],[],[point('a')]),/rasterUnknownCrs/);
  assert.throws(()=>annotationsToGeoJson([asset('a','EPSG:999999',[1,0,0,0,-1,0])],[],[point('a')]),/rasterUnknownCrs/);
  assert.throws(()=>annotationsToGeoJson([{id:'a',name:'plain.png'}],[],[point('a')]),/rasterMissingReference/);
});

test('unannotated images with unknown CRS do not block a valid export', () => {
  assert.equal(annotationsToGeoJson([asset('a','EPSG:4326',[1,0,0,0,-1,0]),asset('b','sem CRS',[1,0,0,0,-1,0])],[],[point('a')]).total,1);
});

test('polygons and holes are closed and wound correctly; lines stay open', () => {
  const image=asset('a','EPSG:4326',[0.0001,0,-47,0,-0.0001,-21]);
  const annotation={id:'poly',asset:'a',label:'weed',type:'polygon',pts:[0,0,100,0,100,100,0,100],holes:[[20,20,40,20,40,40,20,40]]};
  const result=annotationsToGeoJson([image],[],[annotation,{...annotation,id:'line',type:'line',pts:[0,0,100,100]}]);
  const rings=result.colecao.features[0].geometry.coordinates;
  const area=ring=>ring.slice(0,-1).reduce((sum,p,i)=>sum+p[0]*ring[i+1][1]-ring[i+1][0]*p[1],0);
  assert.deepEqual(rings[0][0],rings[0].at(-1)); assert.ok(area(rings[0])>0); assert.ok(area(rings[1])<0);
  assert.equal(result.colecao.features[1].geometry.type,'LineString'); assert.equal(result.colecao.features[1].geometry.coordinates.length,2);
});

test('invalid/nonfinite coordinates cannot become nulls in exported JSON', () => {
  assert.throws(()=>annotationsToGeoJson([asset('a','EPSG:4326',[1,0,0,0,-1,0])],[],[{...point('a'),x:NaN}]),/rasterInvalidCoordinates/);
});
