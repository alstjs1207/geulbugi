import type {Snapshot} from './types';

export const PUBLISH_TIME_RECONNECT='글쓰기 탭에 이전 확장 코드가 연결돼 있어요. 초안을 임시저장한 뒤 확장 관리에서 글부기를 새로고침하고, 네이버 글쓰기 탭도 새로고침해 주세요.';

export function supportsPublishTime(snapshot:Pick<Snapshot,'adapterSignature'|'capabilities'>):boolean{
 // 0.1.14 supports reservations but predates explicit capability reporting.
 if(snapshot.capabilities!==undefined)return Array.isArray(snapshot.capabilities)&&snapshot.capabilities.includes('publish-time');
 return snapshot.adapterSignature==='naver-one-public-ui-v27';
}

export function isUnsupportedEditorRequest(error:string):boolean{
 return error.trim().startsWith('지원하지 않는 편집 요청');
}

export const PHOTO_AI_RECONNECT=PUBLISH_TIME_RECONNECT;
export function supportsPhotoAi(snapshot:Pick<Snapshot,'capabilities'>):boolean{return snapshot.capabilities?.includes('photo-ai-on')===true;}
