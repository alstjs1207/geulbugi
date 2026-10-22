import {useEffect,useRef,useState} from 'react';
import {Plus} from 'lucide-react';
import type {PhotoUpload} from '../core/types';
import {encodePhotoFiles,PHOTO_UPLOAD_ACCEPT} from '../core/photo-upload';

export function PhotoUploadButton({disabled,onUpload,onError,onCancel}:{disabled:boolean;onUpload:(files:PhotoUpload[])=>Promise<unknown>;onError:(text:string)=>void;onCancel:()=>void}){
 const input=useRef<HTMLInputElement>(null),upload=useRef<typeof onUpload|null>(null);
 const [phase,setPhase]=useState<'idle'|'choosing'|'sending'>('idle');
 const cancel=()=>{if(!upload.current)return;upload.current=null;setPhase('idle');onCancel();};
 useEffect(()=>{const node=input.current;if(!node)return;node.addEventListener('cancel',cancel);return()=>node.removeEventListener('cancel',cancel);},[onCancel]);
 async function selected(files:File[]){
  if(!files.length){cancel();return;}
  const action=upload.current;if(!action)return;
  // Claim this selection once, retaining the document and target from the click.
  upload.current=null;setPhase('sending');
  try{await action(await encodePhotoFiles(files));}catch(error){onError(error instanceof Error?error.message:String(error));}
  finally{if(input.current)input.current.value='';setPhase('idle');}
 }
 return <><button className="outline-green small" disabled={disabled||phase!=='idle'} onClick={()=>{
  if(upload.current||!input.current)return;
  upload.current=onUpload;setPhase('choosing');input.current.value='';
  // Open synchronously in the user's click; an extension message loses activation.
  try{input.current.click();}catch{upload.current=null;setPhase('idle');onError('사진 선택 창을 열지 못했어요. 다시 눌러 주세요.');}
 }}><Plus size={15}/>{phase==='choosing'?'사진 선택 중':phase==='sending'?'사진 전달 중':'새 사진'}</button>
 {phase==='choosing'&&<button className="text-btn small" onClick={cancel}>사진 선택 취소</button>}
 <input ref={input} type="file" accept={PHOTO_UPLOAD_ACCEPT} multiple hidden aria-label="추가할 사진 선택" onChange={event=>void selected(Array.from(event.currentTarget.files??[]))}/></>;
}
