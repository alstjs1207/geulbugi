import type { PhotoUpload } from './types';

// Keep the JSON message, including base64 overhead, well below Chrome's limit.
export const PHOTO_UPLOAD_MAX_BYTES=20*1024*1024;
export const PHOTO_UPLOAD_MAX_FILES=20;
const formats:Record<string,string>={jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',png:'image/png',bmp:'image/bmp',heic:'image/heic',heif:'image/heif',webp:'image/webp'};
export const PHOTO_UPLOAD_ACCEPT=Object.keys(formats).map(ext=>'.'+ext).join(',');

function metadata(files:readonly {name:string;size:number}[]):void{
 if(!Array.isArray(files)||!files.length)throw new Error('추가할 사진을 선택해 주세요.');
 if(files.length>PHOTO_UPLOAD_MAX_FILES)throw new Error('사진은 한 번에 20장까지 선택해 주세요.');
 let total=0;
 for(const file of files){
  if(!file||typeof file.name!=='string'||!file.name||file.name.length>255||/[\/\\\u0000-\u001f]/u.test(file.name)||!formats[file.name.split('.').at(-1)!.toLowerCase()])throw new Error('JPG·PNG·GIF·BMP·HEIC·HEIF·WebP 사진을 선택해 주세요.');
  if(!Number.isSafeInteger(file.size)||file.size<=0)throw new Error('내용이 없는 사진 파일은 추가할 수 없어요.');
  total+=file.size;
  if(total>PHOTO_UPLOAD_MAX_BYTES)throw new Error('선택한 사진의 합계는 20MB 이하로 나누어 추가해 주세요.');
 }
}

export async function encodePhotoFiles(files:File[]):Promise<PhotoUpload[]>{
 metadata(files);
 return Promise.all(files.map(file=>new Promise<PhotoUpload>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('사진 파일을 읽지 못했어요. 다시 선택해 주세요.'));
  reader.onabort=()=>reject(new Error('사진 파일 읽기가 취소되었어요.'));
  reader.onload=()=>{const value=reader.result;if(typeof value!=='string'||!value.includes(',')){reject(new Error('사진 파일을 읽지 못했어요.'));return;}
   resolve({name:file.name,type:formats[file.name.split('.').at(-1)!.toLowerCase()],size:file.size,data:value.slice(value.indexOf(',')+1)});
  };
  reader.readAsDataURL(file);
 })));
}

export function decodePhotoFiles(payload:PhotoUpload[]):File[]{
 metadata(payload);
 return payload.map(file=>{
  const type=formats[file.name.split('.').at(-1)!.toLowerCase()];
  if(file.type!==type||typeof file.data!=='string'||file.data.length!==Math.ceil(file.size/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/u.test(file.data))throw new Error('사진 파일 자료를 확인하지 못했어요. 다시 선택해 주세요.');
  let binary:string;try{binary=atob(file.data);}catch{throw new Error('사진 파일 자료를 확인하지 못했어요. 다시 선택해 주세요.');}
  if(binary.length!==file.size)throw new Error('사진 파일 크기가 달라졌어요. 다시 선택해 주세요.');
  const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  return new File([bytes],file.name,{type});
 });
}
