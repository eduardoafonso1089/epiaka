import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import { savePoligomeProject, openPoligomeProject } from '../app/lib/project.ts';
import { getCopy } from '../app/lib/i18n.ts';

function installDownloadCapture() {
  const originalDocument=globalThis.document;
  const originalWindow=globalThis.window;
  const originalCreate=URL.createObjectURL;
  const originalRevoke=URL.revokeObjectURL;
  let saved;
  URL.createObjectURL=blob=>{saved=blob;return 'blob:fixture';};
  URL.revokeObjectURL=()=>{};
  globalThis.document={createElement:()=>({style:{},click(){},remove(){}}),body:{appendChild(){}}};
  globalThis.window={setTimeout:callback=>{callback();return 1;}};
  return {
    saved:()=>saved,
    restore(){
      globalThis.document=originalDocument;
      globalThis.window=originalWindow;
      URL.createObjectURL=originalCreate;
      URL.revokeObjectURL=originalRevoke;
    },
  };
}

test('project v3 persists polygon vertices with stable ids instead of flat pts', async () => {
  const capture=installDownloadCapture();
  const assets=[{id:'a',name:'image.png',src:'',missing:true,width:100,height:100}];
  const labels=[{id:'weed',name:'Weed',color:'#00ff00',key:'1'}];
  const annotations=[{id:'p',asset:'a',label:'weed',type:'polygon',pts:[10,20,30,40,50,60],holes:[]}];
  try {
    await savePoligomeProject('V3',assets,labels,annotations,'annotations',getCopy('en'));
    const zip=await JSZip.loadAsync(await capture.saved().arrayBuffer());
    const manifest=JSON.parse(await zip.file('project.json').async('string'));
    assert.equal(manifest.version,3);
    assert.equal('pts' in manifest.annotations[0],false);
    assert.deepEqual(manifest.annotations[0].vertices.map(vertex=>vertex.id),['p:outer:v0','p:outer:v1','p:outer:v2']);
    assert.deepEqual(manifest.annotations[0].vertices.map(({x,y})=>[x,y]),[[10,20],[30,40],[50,60]]);
  } finally { capture.restore(); }
});

test('project v3 loader rejects v2 manifests instead of migrating them', async () => {
  const zip=new JSZip();
  zip.file('project.json',JSON.stringify({
    format:'poligome-project',version:2,project_name:'Old',saved_at:new Date().toISOString(),
    assets:[{id:'a',name:'image.png',missing:true}],
    labels:[{id:'weed',name:'Weed',color:'#00ff00',key:'1'}],
    annotations:[{id:'p',asset:'a',label:'weed',type:'polygon',pts:[10,20,30,40,50,60]}],
  }));
  const bytes=await zip.generateAsync({type:'uint8array'});
  await assert.rejects(()=>openPoligomeProject(bytes,getCopy('en')));
});
