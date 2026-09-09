import assert from 'node:assert/strict';
import test from 'node:test';
import { installFileReader } from './helpers/raster-fixtures.mjs';
import { savePoligomeProject, openPoligomeProject } from '../app/lib/project.ts';
import { geoReference } from '../app/lib/georeference.ts';
import { getCopy } from '../app/lib/i18n.ts';

test('complete and annotations-only projects round-trip affine raster metadata', async () => {
  const restoreReader=installFileReader();
  const originalDocument=globalThis.document, originalWindow=globalThis.window;
  const originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL;
  let saved;
  URL.createObjectURL=blob=>{saved=blob;return 'blob:fixture';}; URL.revokeObjectURL=()=>{};
  globalThis.document={createElement:()=>({style:{},click(){},remove(){}}),body:{appendChild(){}}};
  globalThis.window={setTimeout:callback=>{callback();return 1;}};
  const asset={id:'a',name:'crop.png',src:'data:image/png;base64,iVBORw0KGgo=',local:true,width:100,height:50,
    geo:geoReference('source.tif',100,50,{transform:[2,1,500000,1,-2,7600000],crs:'EPSG:31983'})};
  const labels=[{id:'weed',name:'Weed',color:'#00ff00',key:'1'}];
  const annotations=[{id:'p',asset:'a',label:'weed',type:'point',x:100,y:100}];
  try {
    for(const mode of ['complete','annotations']) {
      await savePoligomeProject('Raster',[asset],labels,annotations,mode,getCopy('en'));
      const bytes=await saved.arrayBuffer();
      const loaded=await openPoligomeProject(bytes,getCopy('en'));
      assert.deepEqual(loaded.assets[0].geo,asset.geo);
      assert.equal(loaded.missingImages,mode==='annotations'?1:0);
      assert.equal(loaded.annotations.length,1);
    }
  } finally { restoreReader();globalThis.document=originalDocument;globalThis.window=originalWindow;URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke; }
});
