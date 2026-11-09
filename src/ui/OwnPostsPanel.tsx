import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Link2, RefreshCw, Search, Upload } from 'lucide-react';
import type { Post, SearchHit } from '../core/types';
import { BLOG_SEARCH_QUERY_LIMIT, normalizeBlogSearchRequest, type BlogSearchResult } from '../core/blog-search';
import { canonicalLinkedUrl } from '../core/security';
import { searchPosts } from '../core/search';
import { loadBlogCategories, loadRecentBlog, openExtensionManager, searchOwnBlog } from '../platform/bridge';
import { RECENT_BLOG_RELOAD_MESSAGE, type RecentBlogResult } from '../core/blog-recent';
import type { BlogCategory } from '../core/blog-categories';
import { Busy, Empty, Notice } from './components';

type Props = {
 active?: boolean;
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
 const { blogUrl, posts, keywords, linkedUrls, busy, canInsert, active = true } = props;
 const [source, setSource] = useState<'blog' | 'saved'>('blog');
 const [query, setQuery] = useState(''), [recommended, setRecommended] = useState(false);
 const [result, setResult] = useState<BlogSearchResult | null>(null);
 const [recent, setRecent] = useState<RecentBlogResult | null>(null);
 const [mode, setMode] = useState<'recent' | 'search'>('recent');
 const [recentLoading, setRecentLoading] = useState(false);
 const [recentError, setRecentError] = useState('');
 const [category, setCategory] = useState({ blogUrl, id: '0' });
 const categoryNo = category.blogUrl === blogUrl ? category.id : '0';
 const [categoryList, setCategoryList] = useState<{ blogUrl: string; items: BlogCategory[] } | null>(null);
 const categories = categoryList?.blogUrl === blogUrl ? categoryList.items : [];
 const categoryName = categories.find(item => item.id === categoryNo)?.name ?? '전체 카테고리';
 const [categoriesLoading, setCategoriesLoading] = useState(false), [categoriesError, setCategoriesError] = useState('');
 const categorySerial = useRef(0);
 const [loading, setLoading] = useState<{ query: string; page: number } | null>(null);
 const [error, setError] = useState<{ query: string; page: number; text: string } | null>(null);
 const [limit, setLimit] = useState(40);
 const serial = useRef(0), pending = useRef<{ key: string; page: number } | null>(null);
 const currentBlog = useRef(blogUrl); currentBlog.current = blogUrl;
 useEffect(() => {
  serial.current++; pending.current = null;
  setResult(null); setLoading(null); setError(null); setQuery(''); setRecommended(false);
  setRecent(null); setRecentLoading(false); setRecentError(''); setMode('recent');
  if (active && blogUrl) void refreshRecent();
  return () => { serial.current++; pending.current = null; };
 }, [blogUrl, active, categoryNo]);
 useEffect(() => {
  if (active && blogUrl && !props.demo) void refreshCategories();
  return () => { categorySerial.current++; };
 }, [blogUrl, active, props.demo]);
 useEffect(() => setLimit(40), [query, recommended, source]);
 const ownPosts = posts.filter(post => post.blogId === blogUrl.split('/').at(-1));
 const links = useMemo(() => new Set(linkedUrls.flatMap(url => canonicalLinkedUrl(url) ?? [])), [linkedUrls]);
 const localQuery = recommended ? keywords.join(' ') : query;
 const localHits = localQuery.trim() ? searchPosts(ownPosts, localQuery, linkedUrls) : ownPosts.map(post => ({ post, score: 0, keywords: [], inserted: links.has(post.url) }));
 const displayedPosts = mode === 'recent' ? recent?.posts : result?.posts;
 const remoteHits: SearchHit[] = displayedPosts?.map(post => ({ post, score: 0, keywords: mode === 'search' && result ? searchPosts([post], result.query)[0]?.keywords ?? [] : [], inserted: links.has(post.url) })) ?? [];
 const hits = source === 'blog' ? remoteHits : localHits.slice(0, limit);
 const samePending = loading?.query === query.replace(/\s+/gu, ' ').trim();

 async function refreshCategories() {
  const id = ++categorySerial.current;
  setCategoriesLoading(true); setCategoriesError('');
  try {
   const items = await loadBlogCategories(blogUrl);
   if (id !== categorySerial.current || blogUrl !== currentBlog.current) return;
   setCategoryList({ blogUrl, items });
   setCategory(current => current.blogUrl === blogUrl && current.id !== '0' && !items.some(item => item.id === current.id) ? { blogUrl, id: '0' } : current);
  } catch (failure) {
   if (id === categorySerial.current) setCategoriesError(failure instanceof Error ? failure.message : '카테고리를 불러오지 못했어요.');
  } finally { if (id === categorySerial.current) setCategoriesLoading(false); }
 }

 async function refreshRecent() {
  const key = blogUrl + '\nrecent\n' + categoryNo;
  if (pending.current?.key === key) return;
  const id = ++serial.current;
  pending.current = { key, page: 1 };
  setSource('blog'); setMode('recent'); setQuery(''); setRecommended(false);
  setResult(null); setLoading(null); setError(null); setRecentLoading(true); setRecentError('');
  try {
   const next = await (categoryNo === '0' ? loadRecentBlog(blogUrl) : loadRecentBlog(blogUrl, categoryNo));
   if (id === serial.current && blogUrl === currentBlog.current) setRecent(next);
  } catch (failure) {
   if (id === serial.current && blogUrl === currentBlog.current) setRecentError(failure instanceof Error ? failure.message : '최근 글을 가져오지 못했어요. 새로고침해 주세요.');
  } finally {
   if (id === serial.current) { pending.current = null; setRecentLoading(false); }
  }
 }

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
  setSource('blog'); setMode('search'); setRecentLoading(false); setRecentError(''); setQuery(request.query); setRecommended(false); setError(null); setLoading({ query: request.query, page });
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
  <div className="section-title"><h2>관련 내 글 찾기</h2><span className="count">{source === 'saved' ? ownPosts.length + '개 저장' : mode === 'recent' ? '최근 글' : result ? result.total.toLocaleString('ko-KR') + '개 검색' : '내 블로그 검색'}</span></div>
  <div className="segmented post-source" aria-label="내 글 검색 대상">
   <button type="button" className={source === 'blog' ? 'active' : ''} aria-pressed={source === 'blog'} onClick={() => setSource('blog')}>블로그 검색</button>
   <button type="button" className={source === 'saved' ? 'active' : ''} aria-pressed={source === 'saved'} onClick={() => setSource('saved')}>저장한 글</button>
  </div>
  <form className="post-search-form" onSubmit={event => { event.preventDefault(); if (source === 'blog') void search(); }}>
   <div className="searchbox"><Search size={18}/><input aria-label="내 글 검색" placeholder={source === 'blog' ? '내 블로그에서 키워드 검색' : '저장한 글의 제목 · 태그 · 발췌 검색'} maxLength={BLOG_SEARCH_QUERY_LIMIT} value={query} onChange={event => { setQuery(event.target.value); setRecommended(false); }}/></div>
   {source === 'blog' && <button className="primary" type="submit" disabled={!blogUrl || !query.trim() || samePending}>{samePending ? '검색 중' : '검색'}</button>}
  </form>
  {source === 'blog' && mode === 'recent' && blogUrl && <>
   <label className="post-category-filter"><span>카테고리</span><select aria-label="내 글 카테고리" value={categoryNo} disabled={categoriesLoading} onChange={event => { serial.current++; pending.current = null; setRecent(null); setResult(null); setCategory({ blogUrl, id: event.target.value }); }}>
    <option value="0">전체 카테고리</option>
    {categories.map(item => <option key={item.id} value={item.id}>{item.depth ? '└ ' : ''}{item.name}</option>)}
   </select></label>
   {categoriesLoading && <p className="helper" role="status">카테고리를 불러오고 있어요.</p>}
   {categoriesError && <div className="category-load-error"><p className="helper">{categoriesError}</p><button type="button" className="text-btn" onClick={() => void refreshCategories()}>카테고리 다시 불러오기</button></div>}
  </>}
  {source === 'blog' && blogUrl && <div className="button-row recent-post-controls">
   {mode === 'search' && <button type="button" className="text-btn" onClick={() => void refreshRecent()}>최근 글 보기</button>}
   <button type="button" className="text-btn" disabled={recentLoading} onClick={() => void refreshRecent()}><RefreshCw size={14}/>{recentLoading ? '불러오는 중' : '새로고침'}</button>
  </div>}
  {!!keywords.length && <div className="keyword-chips" aria-label="현재 글 검색어 추천">{keywords.slice(0, 5).map(word => <button type="button" key={word} disabled={!blogUrl} onClick={() => void search(word)}>{word}</button>)}</div>}
  {source === 'saved' && <button className="text-btn" type="button" aria-pressed={recommended} onClick={() => { setRecommended(value => !value); setQuery(''); }}>{recommended ? '저장한 글 전체 보기' : '현재 글 키워드로 추천'}</button>}
  {source === 'blog' && <p className="helper">글을 등록하지 않아도 최근 공개 글을 최대 10개 보여줘요. 검색 결과는 최근 작성일순이에요.{props.demo && ' 실제 조회는 설치된 확장 프로그램에서 사용할 수 있어요.'}</p>}
  {!blogUrl ? <Empty title="내 블로그 주소를 설정해 주세요" body="주소를 한 번 저장하면 글을 개별 등록하지 않고 검색할 수 있어요."><button className="primary" onClick={props.onSettings}>블로그 주소 설정</button>{props.demo && <button className="text-btn" onClick={props.onDemo}>예시 글 3개 불러오기</button>}</Empty> : <>
   {source === 'blog' && mode === 'recent' && <>
    {recent && <p className="post-search-summary" role="status">{categoryNo === '0' ? '최근 글' : categoryName} · {recent.posts.length}개 표시 · 최신순</p>}
    {recentLoading && <div className="post-search-status" role="status"><Busy label="최근 글을 불러오고 있어요."/></div>}
    {recentError && <div role="alert"><Notice tone="warning">{recentError}</Notice>{recentError === RECENT_BLOG_RELOAD_MESSAGE
     ? <button type="button" className="text-btn" onClick={() => void openExtensionManager().catch(() => setRecentError(RECENT_BLOG_RELOAD_MESSAGE))}>확장 관리 열기</button>
     : <button type="button" className="text-btn" disabled={recentLoading} onClick={() => void refreshRecent()}>다시 시도</button>}</div>}
    {recent && !recent.posts.length && !recentLoading && !recentError && <Empty title={categoryNo === '0' ? '공개 글이 없어요' : '이 카테고리에 공개 글이 없어요'} body="글을 공개한 뒤 새로고침해 주세요."/>}
   </>}
   {source === 'blog' && result && <p className="post-search-summary" role="status">전체 카테고리 검색 · ‘{result.query}’ 검색 결과 · {result.posts.length}개 표시 / {result.total.toLocaleString('ko-KR')}개 · 최신순</p>}
   {source === 'blog' && loading && <div className="post-search-status" role="status"><Busy label={loading.page === 1 ? '내 블로그에서 글을 찾고 있어요.' : '다음 검색 결과를 불러오고 있어요.'}/></div>}
   {source === 'blog' && error && <div role="alert"><Notice tone="warning">{error.text}</Notice><button type="button" className="text-btn" onClick={() => void search(error.query, error.page)} disabled={!!loading}>다시 시도</button></div>}
   {source === 'blog' && result && !result.posts.length && <Empty title="일치하는 공개 글이 없어요" body="다른 검색어로 찾아보세요. 비공개 글은 검색 목록에 포함되지 않아요."/>}
   {source === 'saved' && !ownPosts.length && <Empty title="저장한 글이 없어요" body="블로그 검색은 글을 저장하지 않아도 사용할 수 있어요."/>}
   {source === 'saved' && !!ownPosts.length && !hits.length && <Empty title="일치하는 저장 글이 없어요" body="다른 키워드로 검색하거나 블로그 검색을 이용해 주세요."/>}
   {!!hits.length && <div className="post-list">{hits.map(({ post, keywords: matched, inserted }, index) => <article className="post-card" key={post.url}>
    <span className="post-rank">{index + 1}</span><div className="post-info"><h3>{post.title}</h3>
     <div className="post-meta"><time>{post.publishedAt.replaceAll('-', '.') || (source === 'blog' && mode === 'recent' ? recent?.posts.find(item => item.url === post.url)?.publishedLabel : '') || '날짜 정보 없음'}</time>{inserted ? <span className="tiny-tag">이미 삽입됨</span> : matched.slice(0, 3).map(word => <span className="keyword" key={word}>{word}</span>)}</div>
     {(source === 'saved' || mode === 'search') && <p>{post.excerpt || '원문에서 글 내용을 확인해 주세요.'}</p>}
     <div className="button-row"><a className="secondary" href={post.url} target="_blank" rel="noopener noreferrer">원문 열기<ArrowUpRight size={14}/></a><button className="outline-green" disabled={inserted || busy || !canInsert} onClick={() => props.onInsert(post)}><Link2 size={14}/>미리보기 삽입</button></div>
    </div>
   </article>)}</div>}
   {source === 'blog' && result?.hasMore && <button type="button" className="secondary full" disabled={!!loading} onClick={() => void search(result.query, result.page + 1)}>검색 결과 더 보기</button>}
   {source === 'saved' && localHits.length > limit && <button type="button" className="secondary full" onClick={() => setLimit(value => value + 40)}>저장한 글 더 보기 · {localHits.length - limit}개 남음</button>}
  </>}
  <details className="register-area"><summary>내 글 직접 추가 · 파일 가져오기</summary><p className="helper">직접 추가한 자료는 ‘저장한 글’에서 검색하고 추천에 사용할 수 있어요.</p><div className="button-row"><button className="secondary" onClick={props.onRegister}><Link2 size={14}/>URL 등록</button><button className="secondary" disabled={busy} onClick={props.onOpened}><BookOpen size={14}/>열린 내 글</button><button className="secondary" onClick={props.onImport}><Upload size={14}/>파일</button></div></details>
  <p className="helper">본문에 커서를 놓고 미리보기를 삽입하세요. 삽입 후에는 카드 뒤에 다음 링크를 이어서 넣을 수 있어요.</p>
 </>;
}
