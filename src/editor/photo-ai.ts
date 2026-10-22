import type {EditorReader} from './reader';
import type {Snapshot} from '../core/types';
import {PendingNativeEditError} from './native-operation';
import {photoAiContent,photoAiStatus} from '../core/photo-ai';

export function imageAiToggle(image:HTMLImageElement):HTMLButtonElement|undefined{
 const own=image.closest('.se-module-image')?.querySelectorAll<HTMLButtonElement>('.se-set-ai-mark-button-toggle');
 if(own?.length)return own.length===1?own[0]:undefined;
 // Live collage/slide layouts expose one native AI label for the whole group.
 const shared=[...image.closest('.se-imageGroup')?.querySelectorAll<HTMLButtonElement>('.se-set-ai-mark-button-toggle')??[]].filter(button=>!button.closest('.se-module-image'));
 return shared?.length===1?shared[0]:undefined;
}
export function imageAiMarked(image:HTMLImageElement):boolean|undefined{
 const button=imageAiToggle(image);
 return button?button.classList.contains('se-is-selected'):undefined;
}

async function setPhotoAi(reader:EditorReader,didEdit:()=>void,guard:()=>void,desired?:boolean[]):Promise<void>{
 const before=reader.read(),content=photoAiContent(before),status=photoAiStatus(before.blocks);
 if(!status.total)throw new Error('AI 활용 설정을 켤 사진이 없어요.');
 if(status.unknown)throw new Error('일부 사진의 AI 활용 설정을 확인하지 못했어요. 글쓰기 탭을 새로고침해 주세요.');
 const root=reader.getRoot();
 if(!root)throw new Error('네이버 글쓰기 화면에 다시 연결해 주세요.');
 if([...document.querySelectorAll<HTMLElement>('.se-popup')].some(el=>!el.hidden&&getComputedStyle(el).display!=='none'&&el.getBoundingClientRect().height>0))throw new Error('열려 있는 네이버 창을 닫은 뒤 다시 실행해 주세요.');
 const images=before.blocks.filter(b=>b.photo).flatMap(b=>[...reader.elements.get(b.id)!.querySelectorAll<HTMLImageElement>('img.se-image-resource')]);
 if(images.length!==status.total)throw new Error('사진 수와 AI 활용 설정 수를 확인하지 못했어요. 사진 목록을 새로고침해 주세요.');
 const states=images.map(image=>imageAiMarked(image));
 const controls=images.map(image=>imageAiToggle(image));
 const target=desired??images.map(()=>true);
 if(target.length!==images.length||target.some(value=>typeof value!=='boolean')||controls.some((button,i)=>controls.some((other,j)=>button===other&&target[i]!==target[j])))throw new Error('복원할 사진 AI 활용 설정을 확인하지 못했어요.');
 if(controls.some(button=>!button||button.matches(':disabled,[aria-disabled="true"]')))throw new Error('사용할 수 없는 사진 AI 활용 설정이 있어요. 네이버 화면을 확인해 주세요.');
 const check=()=>{
  guard();const current=reader.read();
  if(reader.getRoot()!==root||current.sessionId!==before.sessionId||current.documentKey!==before.documentKey||photoAiContent(current)!==content||images.some((image,i)=>!root.contains(image)||imageAiToggle(image)!==controls[i]||imageAiMarked(image)!==states[i]))throw new Error('AI 활용 설정 중 본문이나 사진이 바뀌었어요. 현재 상태를 확인한 뒤 다시 실행해 주세요.');
 };
 for(let i=0;i<images.length;i++){
  check();if(states[i]===target[i])continue;
  const button=controls[i]!;
  if(button.matches(':disabled,[aria-disabled="true"]'))throw new Error('사용할 수 없는 사진 AI 활용 설정이 있어요. 네이버 화면을 확인해 주세요.');
  // Naver's native toggle accepts click even on an unselected/offscreen photo.
  // No photo selection, scrolling, DOM rewriting or private editor API needed.
  button.click();didEdit();
  const deadline=Date.now()+4000;
  while(imageAiMarked(images[i])!==target[i]&&Date.now()<deadline){guard();await new Promise(resolve=>setTimeout(resolve,40));}
  if(imageAiMarked(images[i])!==target[i])throw new PendingNativeEditError('사진 AI 활용 설정의 완료를 아직 확인하지 못했어요.');
  for(let j=0;j<controls.length;j++)if(controls[j]===button)states[j]=target[i];
  check();
 }
 if(images.some((image,i)=>imageAiMarked(image)!==target[i]))throw new Error('모든 사진의 AI 활용 설정을 확인하지 못했어요.');
}

export function enablePhotoAi(reader:EditorReader,didEdit:()=>void,guard:()=>void):Promise<void>{return setPhotoAi(reader,didEdit,guard);}

// Restore these boolean settings through the same public native toggles.
// Naver may coalesce AI changes into a history entry with a preceding caption
// edit. Keyboard undo can cross that boundary; setting the exact saved values
// never consumes the author's earlier text/format history.
export async function restorePhotoAi(reader:EditorReader,baseline:Snapshot,guard:()=>void):Promise<void>{
 if(photoAiContent(reader.read())!==photoAiContent(baseline))throw new Error('본문 상태가 달라져 AI 활용 설정을 되돌릴 수 없어요.');
 const values=baseline.blocks.filter(b=>b.photo).flatMap(b=>b.photo!.items??[]).map(item=>item.aiMarked);
 if(values.some(value=>typeof value!=='boolean'))throw new Error('이전 AI 활용 설정을 확인하지 못했어요.');
 await setPhotoAi(reader,()=>{},guard,values as boolean[]);
 if(reader.read().revision!==baseline.revision)throw new Error('사진 AI 활용 설정의 정확한 복원을 확인하지 못했어요.');
}
