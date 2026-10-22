import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Link2, Search, Upload } from 'lucide-react';
import type { Post, SearchHit } from '../core/types';
import { BLOG_SEARCH_QUERY_LIMIT, normalizeBlogSearchRequest, type BlogSearchResult } from '../core/blog-search';
import { canonicalLinkedUrl } from '../core/security';
import { searchPosts } from '../core/search';
import { searchOwnBlog } from '../platform/bridge';
import { Busy, Empty, Notice } from './components';

type Props = {
 blogUrl: string;
 posts: Post[];
 keywords: string[];
 linkedUrls: string[];
 busy: boolean;
 canInsert: boolean;
 demo: boolean;
 onInsert: (post: Post) => void;
 onSettings: () => void;
 onRegister: () => void;
 onOpened: () => void;
 onImport: () => void;
 onDemo: () => void;
};

export function OwnPostsPanel(props: Props) {
 const { blogUrl, posts, keywords, linkedUrls, busy, canInsert } = props;
 const [source, setSource] = useState<'blog' | 'saved'>('blog');
 const [query, setQuery] = useState(''), [recommended, setRecommended] = useState(false);
 const [result, setResult] = useState<BlogSearchResult | null>(null);
 const [loading, setLoading] = useState<{ query: string; page: number } | null>(null);
 const [error, setError] = useState<{ query: string; page: number; text: string } | null>(null);
 const [limit, setLimit] = useState(40);
 const serial = useRef(0), pending = useRef<{ key: string; page: number } | null>(null);
 const currentBlog = useRef(blogUrl); currentBlog.current = blogUrl;
 useEffect(() => {
  serial.current++; pending.current = null;
  setResult(null); setLoading(null); setError(null); setQuery(''); setRecommended(false);
  return () => { serial.current++; pending.current = null; };
 }, [blogUrl]);
 useEffect(() => setLimit(40), [query, recommended, source]);
 const ownPosts = posts.filter(post => post.blogId === blogUrl.split('/').at(-1));
 const links = useMemo(() => new Set(linkedUrls.flatMap(url => canonicalLinkedUrl(url) ?? [])), [linkedUrls]);
 const localQuery = recommended ? keywords.join(' ') : query;
 const localHits = localQuery.trim() ? searchPosts(ownPosts, localQuery, linkedUrls) : ownPosts.map(post => ({ post, score: 0, keywords: [], inserted: links.has(post.url) }));
 const remoteHits: SearchHit[] = result?.posts.map(post => ({ post, score: 0, keywords: searchPosts([post], result.query)[0]?.keywords ?? [], inserted: links.has(post.url) })) ?? [];
 const hits = source === 'blog' ? remoteHits : localHits.slice(0, limit);
 const samePending = loading?.query === query.replace(/\s+/gu, ' ').trim();

 async function search(input = query, page = 1) {
  let request;
  try { request = normalizeBlogSearchRequest({ blogUrl, query: input, page }); }
  catch (failure) { setError({ query: input, page, text: failure instanceof Error ? failure.message : '검색어를 확인해 주세요.' }); return; }
  const key = request.blogUrl + '\n' + request.query;
  if (pending.current?.key === key && pending.current.page === page) return;
  const previous = result;
  if (page > 1 && (!previous || previous.blogUrl !== request.blogUrl || previous.query !== request.query || page !== previous.page + 1)) return;
  const id = ++serial.current;
  pending.current = { key, page };
  setSource('blog'); setQuery(request.query); setRecommended(false); setError(null); setLoading({ query: request.query, page });
  if (page === 1) setResult(null);
  try {
   const next = await searchOwnBlog(request.blogUrl, request.query, page);
   if (id !== serial.current || request.blogUrl !== currentBlog.current) return;
   if (page > 1 && previous) {
    const merged = new Map(previous.posts.map(post => [post.url, post]));
    for (const post of next.posts) if (!merged.has(post.url)) merged.set(post.url, post);
    if (merged.size === previous.posts.length && next.hasMore) throw new Error('새 검색 결과를 확인하지 못했어요. 처음부터 다시 검색해 주세요.');
    setResult({ ...next, posts: [...merged.values()] });
   } else setResult(next);
  } catch (failure) {
   if (id === serial.current && request.blogUrl === currentBlog.current) setError({ query: request.query, page, text: failure instanceof Error ? failure.message : '검색 결과를 가져오지 못했어요.' });
  } finally {
   if (id === serial.current) { pending.current = null; setLoading(null); }
  }
 }

 return <>
  <div className="section-title"><h2>관련 내 글 찾기</h2><span className="count">{source === 'saved' ? ownPosts.length + '개 저장' : result ? result.total.toLocaleString('ko-KR') + '개 검색' : '내 블로그 검색'}</span></div>
  <div className="segmented post-source" aria-label="내 글 검색 대상">
   <button type="button" className={source === 'blog' ? 'active' : ''} aria-pressed={source === 'blog'} onClick={() => setSource('blog')}>블로그 검색</button>
   <button type="button" className={source === 'saved' ? 'active' : ''} aria-pressed={source === 'saved'} onClick={() => setSource('saved')}>저장한 글</button>
  </div>
  <form className="post-search-form" onSubmit={event => { event.preventDefault(); if (source === 'blog') void search(); }}>
   <div className="searchbox"><Search size={18}/><input aria-label="내 글 검색" placeholder={source === 'blog' ? '내 블로그에서 키워드 검색' : '저장한 글의 제목 · 태그 · 발췌 검색'} maxLength={BLOG_SEARCH_QUERY_LIMIT} value={query} onChange={event => { setQuery(event.target.value); setRecommended(false); }}/></div>
   {source === 'blog' && <button className="primary" type="submit" disabled={!blogUrl || !query.trim() || samePending}>{samePending ? '검색 중' : '검색'}</button>}
  </form>
  {!!keywords.length && <div className="keyword-chips" aria-label="현재 글 검색어 추천">{keywords.slice(0, 5).map(word => <button type="button" key={word} disabled={!blogUrl} onClick={() => void search(word)}>{word}</button>)}</div>}
  {source === 'saved' && <button className="text-btn" type="button" aria-pressed={recommended} onClick={() => { setRecommended(value => !value); setQuery(''); }}>{recommended ? '저장한 글 전체 보기' : '현재 글 키워드로 추천'}</button>}
  {source === 'blog' && <p className="helper">글을 등록하지 않아도 내 블로그의 공개 글을 검색해요.{props.demo && ' 실제 검색은 설치된 확장 프로그램에서 사용할 수 있어요.'}</p>}
  {!blogUrl ? <Empty title="내 블로그 주소를 설정해 주세요" body="주소를 한 번 저장하면 글을 개별 등록하지 않고 검색할 수 있어요."><button className="primary" onClick={props.onSettings}>블로그 주소 설정</button>{props.demo && <button className="text-btn" onClick={props.onDemo}>예시 글 3개 불러오기</button>}</Empty> : <>
   {source === 'blog' && result && <p className="post-search-summary" role="status">‘{result.query}’ 검색 결과 · {result.posts.length}개 표시 / {result.total.toLocaleString('ko-KR')}개</p>}
   {source === 'blog' && loading && <div className="post-search-status" role="status"><Busy label={loading.page === 1 ? '내 블로그에서 글을 찾고 있어요.' : '다음 검색 결과를 불러오고 있어요.'}/></div>}
   {source === 'blog' && error && <div role="alert"><Notice tone="warning">{error.text}</Notice><button type="button" className="text-btn" onClick={() => void search(error.query, error.page)} disabled={!!loading}>다시 시도</button></div>}
   {source === 'blog' && !result && !loading && !error && <Empty title="검색어로 내 글을 찾아보세요" body="검색어를 입력하고 검색을 누르거나 현재 글의 추천 검색어를 선택해 주세요."/>}
   {source === 'blog' && result && !result.posts.length && <Empty title="일치하는 공개 글이 없어요" body="다른 검색어로 찾아보세요. 비공개 글은 검색 목록에 포함되지 않아요."/>}
   {source === 'saved' && !ownPosts.length && <Empty title="저장한 글이 없어요" body="블로그 검색은 글을 저장하지 않아도 사용할 수 있어요."/>}
   {source === 'saved' && !!ownPosts.length && !hits.length && <Empty title="일치하는 저장 글이 없어요" body="다른 키워드로 검색하거나 블로그 검색을 이용해 주세요."/>}
   {!!hits.length && <div className="post-list">{hits.map(({ post, keywords: matched, inserted }, index) => <article className="post-card" key={post.url}>
    <span className="post-rank">{index + 1}</span><div className="post-info"><h3>{post.title}</h3>
     <div className="post-meta"><time>{post.publishedAt.replaceAll('-', '.') || '날짜 정보 없음'}</time>{inserted ? <span className="tiny-tag">이미 삽입됨</span> : matched.slice(0, 3).map(word => <span className="keyword" key={word}>{word}</span>)}</div>
     <p>{post.excerpt || '원문에서 글 내용을 확인해 주세요.'}</p>
     <div className="button-row"><a className="secondary" href={post.url} target="_blank" rel="noopener noreferrer">원문 열기<ArrowUpRight size={14}/></a><button className="outline-green" disabled={inserted || busy || !canInsert} onClick={() => props.onInsert(post)}><Link2 size={14}/>미리보기 삽입</button></div>
    </div>
   </article>)}</div>}
   {source === 'blog' && result?.hasMore && <button type="button" className="secondary full" disabled={!!loading} onClick={() => void search(result.query, result.page + 1)}>검색 결과 더 보기</button>}
   {source === 'saved' && localHits.length > limit && <button type="button" className="secondary full" onClick={() => setLimit(value => value + 40)}>저장한 글 더 보기 · {localHits.length - limit}개 남음</button>}
  </>}
  <details className="register-area"><summary>내 글 직접 추가 · 파일 가져오기</summary><p className="helper">직접 추가한 자료는 ‘저장한 글’에서 검색하고 추천에 사용할 수 있어요.</p><div className="button-row"><button className="secondary" onClick={props.onRegister}><Link2 size={14}/>URL 등록</button><button className="secondary" disabled={busy} onClick={props.onOpened}><BookOpen size={14}/>열린 내 글</button><button className="secondary" onClick={props.onImport}><Upload size={14}/>파일</button></div></details>
  <p className="helper">본문에 커서를 놓고 미리보기 삽입을 누르면 그 위치에 링크 카드를 넣어요.</p>
 </>;
}
