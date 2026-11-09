// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OwnPostsPanel } from '../src/ui/OwnPostsPanel';
import { loadBlogCategories, loadRecentBlog, openExtensionManager, searchOwnBlog } from '../src/platform/bridge';
import { RECENT_BLOG_RELOAD_MESSAGE } from '../src/core/blog-recent';
import type { BlogSearchResult } from '../src/core/blog-search';
import { demoPosts } from '../src/platform/demo';
import { ownBlog } from './helpers/blog-search';

vi.mock('../src/platform/bridge', () => ({ searchOwnBlog: vi.fn(), loadRecentBlog: vi.fn(), loadBlogCategories: vi.fn(), openExtensionManager: vi.fn() }));
const search = vi.mocked(searchOwnBlog);
const recent = vi.mocked(loadRecentBlog);
let host: HTMLDivElement, root: Root;
const result = (query = '연애', page = 1, ids = ['10001'], hasMore = false): BlogSearchResult => ({ blogUrl: ownBlog, query, page, total: 216, hasMore, posts: ids.map(id => ({ blogId: 'example_blog', postId: id, url: ownBlog + '/' + id, title: query + ' 제목 ' + id, tags: [], excerpt: query + ' 관련 본문 발췌', publishedAt: '2026-10-08', collectedAt: '2026-10-08T00:00:00Z' })) });
const baseProps = () => ({ blogUrl: ownBlog, posts: [], keywords: ['연애'], linkedUrls: [], busy: false, canInsert: true, demo: false, onInsert: vi.fn(), onSettings: vi.fn(), onRegister: vi.fn(), onOpened: vi.fn(), onImport: vi.fn(), onDemo: vi.fn() });
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); search.mockReset(); recent.mockReset().mockResolvedValue({ blogUrl: ownBlog, posts: [] }); vi.mocked(loadBlogCategories).mockReset().mockResolvedValue([]); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent === text)!;
async function click(text: string) { await act(async () => button(text).click()); }
async function type(value: string) {
 const input = host.querySelector<HTMLInputElement>('[aria-label="내 글 검색"]')!;
 await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function submit() { await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }

describe('registration-free own posts panel', () => {
 it('loads the selected native category and keeps global search explicitly separate', async () => {
  vi.mocked(loadBlogCategories).mockResolvedValue([{ id: '13', name: '건강심리', depth: 0 }, { id: '9', name: '셀럽 건강', depth: 1 }]);
  recent.mockImplementation(async (_blog, category) => ({ blogUrl: ownBlog, posts: [{ ...result().posts[0], title: category === '9' ? '셀럽 글' : '전체 글', publishedLabel: '' }] }));
  search.mockResolvedValue(result());
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>));
  const select = host.querySelector<HTMLSelectElement>('[aria-label="내 글 카테고리"]')!;
  expect([...select.options].map(option => option.textContent)).toEqual(['전체 카테고리', '건강심리', '└ 셀럽 건강']);
  await act(async () => { select.value = '9'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(recent).toHaveBeenLastCalledWith(ownBlog, '9');
  expect(host.querySelector('article h3')?.textContent).toBe('셀럽 글');
  expect(host.textContent).toContain('셀럽 건강 · 1개 표시');
  await click('연애'); expect(host.textContent).toContain('전체 카테고리 검색');
  expect(host.querySelector('[aria-label="내 글 카테고리"]')).toBeNull();
  await click('최근 글 보기'); expect(recent).toHaveBeenLastCalledWith(ownBlog, '9');
 });
 it('discards a slow all-category response after choosing a category and resets selection for another blog', async () => {
  vi.mocked(loadBlogCategories).mockResolvedValue([{ id: '9', name: '셀럽 건강', depth: 0 }]);
  let finish!: (value: Awaited<ReturnType<typeof loadRecentBlog>>) => void;
  recent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ blogUrl: ownBlog, posts: [] });
  const props = baseProps(); await act(async () => root.render(<OwnPostsPanel {...props}/>));
  await act(async () => { const select = host.querySelector<HTMLSelectElement>('[aria-label="내 글 카테고리"]')!; select.value = '9'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => finish({ blogUrl: ownBlog, posts: [{ ...result().posts[0], title: '늦은 전체 글', publishedLabel: '' }] }));
  expect(host.textContent).not.toContain('늦은 전체 글'); expect(host.textContent).toContain('이 카테고리에 공개 글이 없어요');
  await act(async () => root.render(<OwnPostsPanel {...props} blogUrl="https://blog.naver.com/other_blog"/>));
  expect(recent).toHaveBeenLastCalledWith('https://blog.naver.com/other_blog');
  expect(host.querySelector<HTMLSelectElement>('[aria-label="내 글 카테고리"]')?.value).toBe('0');
 });
 it('keeps all recent posts usable when categories fail and allows a category-only retry', async () => {
  vi.mocked(loadBlogCategories).mockRejectedValueOnce(new Error('네이버 글쓰기 탭을 선택해 주세요.')).mockResolvedValue([{ id: '9', name: '셀럽 건강', depth: 0 }]);
  recent.mockResolvedValue({ blogUrl: ownBlog, posts: [{ ...result().posts[0], title: '전체 글', publishedLabel: '' }] });
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>));
  expect(host.querySelector('article h3')?.textContent).toBe('전체 글');
  await click('카테고리 다시 불러오기');
  expect(host.querySelector('.category-load-error')).toBeNull(); expect(recent).toHaveBeenCalledTimes(1);
 });
 it('opens extension management for an outdated recent worker instead of repeating a request that cannot succeed', async () => {
  recent.mockRejectedValue(new Error(RECENT_BLOG_RELOAD_MESSAGE));
  vi.mocked(openExtensionManager).mockReset().mockResolvedValue(undefined);
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('패널을 닫고');
  expect(button('다시 시도')).toBeUndefined();
  await click('확장 관리 열기');
  expect(openExtensionManager).toHaveBeenCalledOnce();
  expect(recent).toHaveBeenCalledOnce();
 });
 it('shows all ten recent posts returned by the loader', async () => {
  const posts = result('', 1, Array.from({ length: 10 }, (_, index) => String(10010 - index))).posts.map(post => ({ ...post, publishedLabel: '' }));
  recent.mockResolvedValue({ blogUrl: ownBlog, posts });
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>));
  expect(host.querySelectorAll('article')).toHaveLength(10);
  expect(host.textContent).toContain('최근 글 · 10개 표시 · 최신순');
  expect([...host.querySelectorAll('.post-rank')].map(node => node.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
 });
 it('fetches recent posts only on entry, refreshes on demand, and reloads on the next entry', async () => {
  const props = baseProps();
  const first = { ...result().posts[0], title: '최근 글 첫 번째', publishedAt: '', publishedLabel: '2시간 전' };
  const next = { ...first, postId: '10002', url: ownBlog + '/10002', title: '새로 발행한 글' };
  recent.mockResolvedValueOnce({ blogUrl: ownBlog, posts: [first] }).mockResolvedValue({ blogUrl: ownBlog, posts: [next] });
  await act(async () => root.render(<OwnPostsPanel {...props} active={false}/>));
  expect(recent).not.toHaveBeenCalled();
  await act(async () => root.render(<OwnPostsPanel {...props} active/>));
  expect(recent).toHaveBeenCalledExactlyOnceWith(ownBlog);
  expect(host.querySelector('article h3')?.textContent).toBe('최근 글 첫 번째');
  expect(host.querySelector('time')?.textContent).toBe('2시간 전');
  expect(button('검색 결과 더 보기')).toBeUndefined();
  await click('미리보기 삽입'); expect(props.onInsert).toHaveBeenCalledWith(first);
  await act(async () => root.render(<OwnPostsPanel {...props} active busy/>));
  expect(recent).toHaveBeenCalledTimes(1);
  await click('새로고침'); expect(recent).toHaveBeenCalledTimes(2);
  expect(host.querySelector('article h3')?.textContent).toBe('새로 발행한 글');
  await act(async () => root.render(<OwnPostsPanel {...props} active={false}/>));
  expect(recent).toHaveBeenCalledTimes(2);
  await act(async () => root.render(<OwnPostsPanel {...props} active/>));
  expect(recent).toHaveBeenCalledTimes(3);
  expect(search).not.toHaveBeenCalled();
 });
 it('returns from search to recent posts and keeps the previous recent list on refresh failure', async () => {
  const post = { ...result().posts[0], title: '최근 글', publishedLabel: '' };
  recent.mockResolvedValueOnce({ blogUrl: ownBlog, posts: [post] }).mockRejectedValueOnce(new Error('일시적인 연결 오류')).mockResolvedValue({ blogUrl: ownBlog, posts: [post] });
  search.mockResolvedValue(result());
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>));
  await click('연애'); expect(host.textContent).toContain('최신순');
  await click('최근 글 보기');
  expect(host.querySelector('input')?.value).toBe('');
  expect(host.querySelector('article h3')?.textContent).toBe('최근 글');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('일시적인 연결 오류');
  await click('다시 시도'); expect(host.querySelector('[role="alert"]')).toBeNull();
 });
 it('ignores a delayed recent response after searching and a delayed search after refresh', async () => {
  let completeRecent!: (value: Awaited<ReturnType<typeof loadRecentBlog>>) => void;
  let completeSearch!: (value: BlogSearchResult) => void;
  recent.mockImplementationOnce(() => new Promise(done => { completeRecent = done; }));
  search.mockResolvedValueOnce(result()).mockImplementationOnce(() => new Promise(done => { completeSearch = done; }));
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>));
  await click('연애');
  await act(async () => completeRecent({ blogUrl: ownBlog, posts: [] }));
  expect(host.querySelector('article h3')?.textContent).toBe('연애 제목 10001');
  await type('다음'); await submit();
  await click('새로고침');
  await act(async () => completeSearch(result('다음')));
  expect(host.querySelector('article')).toBeNull();
  expect(host.textContent).toContain('공개 글이 없어요');
 });
 it('retries recent failures and ignores responses after leaving or changing the blog', async () => {
  recent.mockRejectedValueOnce(new Error('최근 글 연결 실패'));
  const props = baseProps();
  await act(async () => root.render(<OwnPostsPanel {...props}/>));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('최근 글 연결 실패');
  await click('다시 시도'); expect(host.querySelector('[role="alert"]')).toBeNull();
  let complete!: (value: Awaited<ReturnType<typeof loadRecentBlog>>) => void;
  recent.mockImplementationOnce(() => new Promise(done => { complete = done; }));
  await click('새로고침');
  await act(async () => root.render(<OwnPostsPanel {...props} active={false}/>));
  await act(async () => complete({ blogUrl: ownBlog, posts: [{ ...result().posts[0], publishedLabel: '' }] }));
  expect(host.querySelector('article')).toBeNull();
  await act(async () => root.render(<OwnPostsPanel {...props} active blogUrl="https://blog.naver.com/other_blog"/>));
  expect(recent).toHaveBeenLastCalledWith('https://blog.naver.com/other_blog');
 });

 it('searches with no stored posts, displays metadata, and passes the selected post to card insertion', async () => {
  const props = baseProps(); search.mockResolvedValue(result());
  await act(async () => root.render(<OwnPostsPanel {...props}/>));
  expect(button('블로그 검색').getAttribute('aria-pressed')).toBe('true');
  expect(search).not.toHaveBeenCalled(); expect(host.textContent).toContain('글을 등록하지 않아도');
  await type('연애'); await submit();
  expect(search).toHaveBeenCalledExactlyOnceWith(ownBlog, '연애', 1);
  expect(host.querySelector('article h3')?.textContent).toBe('연애 제목 10001');
  expect(host.querySelector('time')?.textContent).toBe('2026.10.08'); expect(host.textContent).toContain('1개 표시 / 216개');
  await click('미리보기 삽입'); expect(props.onInsert).toHaveBeenCalledExactlyOnceWith(result().posts[0]);
  expect(props.onRegister).not.toHaveBeenCalled(); expect(props.onOpened).not.toHaveBeenCalled(); expect(props.onImport).not.toHaveBeenCalled();
 });
 it('normalizes duplicate links and requires a valid editor cursor for insertion', async () => {
  const props = { ...baseProps(), linkedUrls: ['https://m.blog.naver.com/example_blog/10001?tracking=x'] };
  search.mockResolvedValue(result()); await act(async () => root.render(<OwnPostsPanel {...props}/>));
  await click('연애'); expect(button('미리보기 삽입').disabled).toBe(true); expect(host.textContent).toContain('이미 삽입됨');
  await act(async () => root.render(<OwnPostsPanel {...props} linkedUrls={[]} canInsert={false}/>));
  expect(button('미리보기 삽입').disabled).toBe(true); expect(props.onInsert).not.toHaveBeenCalled();
 });
 it('appends pages without duplicate cards, preserves results on a later failure, and retries that page', async () => {
  search.mockResolvedValueOnce(result('연애', 1, ['10001'], true)).mockResolvedValueOnce(result('연애', 2, ['10001', '10002'], true)).mockRejectedValueOnce(new Error('검색 응답이 늦어지고 있어요.')).mockResolvedValueOnce(result('연애', 3, ['10003'], false));
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>)); await click('연애'); await click('검색 결과 더 보기');
  expect(host.querySelectorAll('article')).toHaveLength(2);
  await click('검색 결과 더 보기'); expect(host.querySelectorAll('article')).toHaveLength(2); expect(host.querySelector('[role="alert"]')?.textContent).toContain('검색 응답이 늦어지고');
  await click('다시 시도'); expect(host.querySelectorAll('article')).toHaveLength(3); expect(host.querySelector('[role="alert"]')).toBeNull(); expect(button('검색 결과 더 보기')).toBeUndefined();
  expect(search.mock.calls.map(([, , page]) => page)).toEqual([1, 2, 3, 3]);
 });
 it('ignores an old response after a newer search and prevents duplicate submissions for the same request', async () => {
  const resolve = new Map<string, (value: BlogSearchResult) => void>();
  search.mockImplementation((_blog, query) => new Promise(done => resolve.set(query, done)));
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>));
  await type('이전'); await submit(); await submit(); expect(search).toHaveBeenCalledTimes(1);
  await type('새로운'); await submit(); expect(search).toHaveBeenCalledTimes(2);
  await act(async () => resolve.get('새로운')!(result('새로운')));
  await act(async () => resolve.get('이전')!(result('이전', 1, ['10002'])));
  expect(host.querySelector('article h3')?.textContent).toBe('새로운 제목 10001'); expect(host.querySelector('[role="alert"]')).toBeNull();
 });
 it('discards results when the configured blog changes while a request is pending', async () => {
  let resolve!: (value: BlogSearchResult) => void;
  search.mockImplementation(() => new Promise(done => { resolve = done; }));
  const props = baseProps(); await act(async () => root.render(<OwnPostsPanel {...props}/>)); await click('연애');
  await act(async () => root.render(<OwnPostsPanel {...props} blogUrl="https://blog.naver.com/other_blog"/>));
  await act(async () => resolve(result()));
  expect(host.querySelectorAll('article')).toHaveLength(0); expect(host.textContent).toContain('공개 글이 없어요'); expect(host.querySelector('input')?.value).toBe('');
 });
 it('shows zero results separately from a network failure and can retry a first-page failure', async () => {
  search.mockRejectedValueOnce(new Error('인터넷 연결을 확인해 주세요.')).mockResolvedValueOnce({ ...result(), total: 0, posts: [] });
  await act(async () => root.render(<OwnPostsPanel {...baseProps()}/>)); await click('연애');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('인터넷 연결'); expect(host.textContent).not.toContain('일치하는 공개 글이 없어요');
  await click('다시 시도'); expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.textContent).toContain('일치하는 공개 글이 없어요');
 });
 it('keeps saved-post search and recommendations available without an online request', async () => {
  const props = { ...baseProps(), posts: demoPosts, keywords: ['숲길'] };
  await act(async () => root.render(<OwnPostsPanel {...props}/>)); await click('저장한 글');
  expect(host.querySelectorAll('article')).toHaveLength(3); await type('숲길'); expect(host.querySelectorAll('article').length).toBeGreaterThan(0); expect(host.querySelectorAll('article').length).toBeLessThan(3);
  await click('현재 글 키워드로 추천'); expect(host.querySelectorAll('article').length).toBeGreaterThan(0); expect(search).not.toHaveBeenCalled();
  await click('저장한 글 전체 보기'); expect(host.querySelectorAll('article')).toHaveLength(3);
 });
 it('requests only a blog address when none is configured, and leaves manual registration optional', async () => {
  const props = { ...baseProps(), blogUrl: '' };
  await act(async () => root.render(<OwnPostsPanel {...props}/>)); expect(host.textContent).toContain('개별 등록하지 않고 검색');
  expect(host.querySelector('details')?.open).toBe(false); await click('블로그 주소 설정'); expect(props.onSettings).toHaveBeenCalledTimes(1); expect(search).not.toHaveBeenCalled();
 });
});
