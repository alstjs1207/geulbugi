// @vitest-environment jsdom
import {describe,expect,it} from 'vitest';
import {encodePhotoFiles,decodePhotoFiles,PHOTO_UPLOAD_MAX_BYTES,PHOTO_UPLOAD_MAX_FILES} from '../src/core/photo-upload';
import type {PhotoUpload} from '../src/core/types';
const payload:PhotoUpload={name:'사진.png',type:'image/png',size:3,data:'AQID'};
describe('selected photo transfer',()=>{
 it.each(['jpg','jpeg','gif','png','bmp','heic','heif','webp'])('keeps %s file names, order and bytes through JSON messages',async extension=>{
  const files=[new File([new Uint8Array([0,255,128,1])],'사진 1.'+extension),new File([new Uint8Array([2,3,4])],'사진 2.'+extension)];
  const encoded=await encodePhotoFiles(files),decoded=decodePhotoFiles(JSON.parse(JSON.stringify(encoded)));
  expect(decoded.map(file=>file.name)).toEqual(files.map(file=>file.name));expect(decoded.map(file=>file.size)).toEqual([4,3]);
  expect((await encodePhotoFiles(decoded)).map(file=>file.data)).toEqual(encoded.map(file=>file.data));
 });
 it('rejects unsupported, empty, oversized and too many files before reading them',async()=>{
  await expect(encodePhotoFiles([new File(['x'],'posts.json')])).rejects.toThrow('사진을 선택');
  await expect(encodePhotoFiles([new File([],'empty.png')])).rejects.toThrow('내용이 없는');
  const big=new File(['x'],'big.png');Object.defineProperty(big,'size',{value:PHOTO_UPLOAD_MAX_BYTES+1});
  await expect(encodePhotoFiles([big])).rejects.toThrow('20MB');
  await expect(encodePhotoFiles(Array.from({length:PHOTO_UPLOAD_MAX_FILES+1},()=>new File(['x'],'a.png')))).rejects.toThrow('20장');
 });
 it.each([[],[{...payload,data:'%%!!'}],[{...payload,size:2}],[{...payload,type:'text/html'}],[{...payload,name:'../photo.png'}],[{...payload,data:'AA=='}]].map(files=>({files})))('rejects malformed runtime photo payloads: $files',({files})=>{
  expect(()=>decodePhotoFiles(files)).toThrow();
 });
 it('accepts a full 20MB batch without regex or string-iterator stack failures',()=>{
  const data='AAAA'.repeat(PHOTO_UPLOAD_MAX_BYTES/3|0)+'AAA=';
  expect(decodePhotoFiles([{...payload,size:PHOTO_UPLOAD_MAX_BYTES,data}])[0].size).toBe(PHOTO_UPLOAD_MAX_BYTES);
 });
});
