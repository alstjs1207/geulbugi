import { useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Busy, Notice } from './components';

type Props = {
 savedUrl: string;
 postCount: number;
 connected: boolean;
 onSave: (input: string) => Promise<string>;
};

export function BlogSettings({ savedUrl, postCount, connected, onSave }: Props) {
 const [input, setInput] = useState(savedUrl);
 const [saving, setSaving] = useState(false);
 const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
 const pending = useRef(false);

 async function submit(event: React.FormEvent) {
  event.preventDefault();
  if (pending.current) return;
  pending.current = true;
  setSaving(true);
  setFeedback(null);
  try {
   const stored = await onSave(input);
   setInput(stored);
   setFeedback({ text: '블로그 주소를 저장했어요.', error: false });
  } catch (error) {
   setFeedback({ text: error instanceof Error ? error.message : '블로그 주소를 저장하지 못했어요.', error: true });
  } finally {
   pending.current = false;
   setSaving(false);
  }
 }

 return <>
  <h3>내 블로그</h3>
  <p>내 블로그 주소를 한 번 저장하면 공개 글을 바로 검색할 수 있어요.</p>
  <form onSubmit={event => void submit(event)} aria-busy={saving}>
   <label className="stacked-label" htmlFor="blog-address">블로그 주소
    <input id="blog-address" value={input} disabled={saving} placeholder="https://blog.naver.com/아이디" onChange={event => { setInput(event.target.value); setFeedback(null); }}/>
   </label>
   <button className="primary" type="submit" disabled={saving}>{saving ? <Busy label="저장 중…"/> : '주소 저장'}</button>
   {feedback && <div role={feedback.error ? 'alert' : 'status'}><Notice tone={feedback.error ? 'warning' : 'success'}>{feedback.text}</Notice></div>}
  </form>
  {savedUrl && <p className="saved-blog-address">저장된 주소: <strong>{savedUrl}</strong></p>}
  <Notice>{connected ? '현재 글쓰기 화면과 연결되어 있어요.' : '현재 글쓰기 화면과 연결되지 않았어요. 주소 저장과 별도로 편집기 연결 확인이 필요해요.'} 주소를 저장하면 내 글 검색 범위가 설정돼요. 게시글을 개별 등록할 필요는 없어요.</Notice>
  <div className="storage-summary"><BookOpen size={24}/><div><strong>{postCount}개 글</strong><span>이 PC에 저장된 내 글 자료</span></div></div>
  <Notice>‘블로그 검색’은 네이버의 내 블로그 검색 결과를 불러와요. ‘저장한 글’에서는 이 PC의 제목·태그·원문 발췌로 검색과 추천을 이용해요.</Notice>
 </>;
}
