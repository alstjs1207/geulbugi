import { useId, type ReactNode } from 'react';
import type { Preset, Snapshot } from '../core/types';
import { Busy } from './components';
import {naverFormatIssue} from '../core/naver-format-options';
import {quoteTarget} from '../core/quote-target';

export function formatApplyState(snapshot:Snapshot|null,preset:Preset|undefined,busy:boolean){
 const quote=preset?.format.paragraphStyle==='quote';
 const presetIssue=preset&&naverFormatIssue(preset.format);
 let reason:string|undefined;
 if(busy)reason='진행 중인 작업이 끝날 때까지 기다려 주세요.';
 else if(!snapshot?.editable)reason='네이버 PC 글쓰기 화면을 열어 주세요.';
 else if(snapshot.issue)reason='복구 안내를 진행한 뒤 다시 적용해 주세요.';
 else if(snapshot.uploadBusy)reason='사진 업로드가 끝난 뒤 적용해 주세요.';
 else if(snapshot.mediaPending||snapshot.mediaPreparing)reason=snapshot.mediaPreparing?'사진 정보를 자동으로 확인하고 있어요. 잠시 기다려 주세요.':'사진 자동 확인을 마치지 못했어요. 사진 다시 확인을 눌러 주세요.';
 else if(!preset)reason='적용할 서식 프리셋을 선택해 주세요.';
 else if(presetIssue)reason=presetIssue;
 else if(quote){try{quoteTarget(snapshot);}catch(error){reason=error instanceof Error?error.message:String(error);}}
 else if(!snapshot.selection?.valid)reason=snapshot.selectionIssue??'본문에서 적용할 글자를 드래그해 주세요.';
 else if(snapshot.selection.collapsed)reason='적용할 글자를 드래그해 주세요.';
 return {quote,reason,presetIssue};
}

export function FormatApplyControls({snapshot,preset,busy,onApply,onEditPreset,undo}:{snapshot:Snapshot|null;preset:Preset|undefined;busy:boolean;onApply:()=>void;onEditPreset?:()=>void;undo:ReactNode}){
 const hintId=useId(),state=formatApplyState(snapshot,preset,busy);
 const multiple=snapshot?.selection?.valid&&snapshot.selection.blockId!==snapshot.selection.endBlockId;
 return <>
  {state.reason&&<p id={hintId} className="apply-help" role="status">{state.reason}</p>}
  {state.presetIssue&&onEditPreset&&<button className="secondary small" disabled={busy} onClick={onEditPreset}>프리셋 수정</button>}
  <div className="button-row"><button className="primary" disabled={!!state.reason} aria-describedby={state.reason?hintId:undefined} onClick={onApply}>{busy?<Busy label="적용 중"/>:state.quote?multiple?'선택 문단에 적용':'현재 문단에 적용':'선택 영역에 적용'}</button>{undo}</div>
 </>;
}
