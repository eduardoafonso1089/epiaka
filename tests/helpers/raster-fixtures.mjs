import { deflateSync } from 'node:zlib';
import { writeArrayBuffer } from 'geotiff';

// Browser FileReader contract used by geotiff.fromBlob; the TIFF decoder is real.
export function installFileReader() {
  const original = globalThis.FileReader;
  globalThis.FileReader = class {
    abort() {}
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(result => { this.result = result; this.onload?.({ target: this }); }, error => { this.error = error; this.onerror?.(error); });
    }
  };
  return () => { globalThis.FileReader = original; };
}

export function tiffFile(data, metadata = {}, removeTags = []) {
  const buffer = writeArrayBuffer(data, { width: 2, height: 2, ...metadata });
  // The geotiff writer supplies geographic defaults. Remove selected tags to exercise
  // plain TIFF input, using reserved private tags of the same layout.
  const view = new DataView(buffer);
  const little = view.getUint16(0) === 0x4949;
  const ifd = view.getUint32(4, little);
  for (let n = view.getUint16(ifd, little), i = 0; i < n; i++) {
    const offset = ifd + 2 + i * 12;
    if (removeTags.includes(view.getUint16(offset, little))) view.setUint16(offset, 65000 + i, little);
  }
  return new File([buffer], 'fixture.tif', { type: 'image/tiff' });
}

/** Tiny multipage TIFF builder: actual IFDs/strips, no decoder mocks or external tools. */
export function pyramidFile() {
  const frames = [
    {width:8,height:8,flag:0,value:50},
    {width:8,height:8,flag:4,value:255},
    {width:4,height:4,flag:5,value:255},
    {width:4,height:4,flag:1,value:100},
    {width:4,height:4,flag:0,value:200}, // unrelated page, never an overview
  ];
  const payloads=frames.map(f=>{
    const raw=new Uint8Array(f.width*f.height).fill(f.value);
    if(f.flag&4)raw[0]=0;
    return deflateSync(raw);
  });
  const ifdSize=2+10*12+4;
  const buffer=new ArrayBuffer(8+frames.length*ifdSize+payloads.reduce((n,data)=>n+data.length,0));
  const v=new DataView(buffer); v.setUint16(0,0x4949); v.setUint16(2,42,true); v.setUint32(4,8,true);
  let dataOffset=8+frames.length*ifdSize;
  frames.forEach((f,i)=>{
    const offset=8+i*ifdSize;
    v.setUint16(offset,10,true);
    const entries=[[254,4,f.flag],[256,4,f.width],[257,4,f.height],[258,3,8],[259,3,8],[262,3,f.flag&4?4:1],[273,4,dataOffset],[277,3,1],[278,4,f.height],[279,4,payloads[i].length]];
    entries.forEach(([tag,type,value],j)=>{
      const p=offset+2+j*12; v.setUint16(p,tag,true);v.setUint16(p+2,type,true);v.setUint32(p+4,1,true);
      if(type===3)v.setUint16(p+8,value,true);else v.setUint32(p+8,value,true);
    });
    v.setUint32(offset+2+10*12,i<frames.length-1?offset+ifdSize:0,true);
    new Uint8Array(buffer,dataOffset,payloads[i].length).set(payloads[i]);
    dataOffset+=payloads[i].length;
  });
  return new File([buffer],'pyramid.tif');
}
