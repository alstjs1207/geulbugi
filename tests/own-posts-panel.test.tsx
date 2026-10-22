// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OwnPostsPanel } from '../src/ui/OwnPostsPanel';
import { searchOwnBlog } from '../src/platform/bridge';
import type { BlogSearchResult } from '../src/core/blog-search';
import { demoPosts } from '../src/platform/demo';
import { ownBlog } from './helpers/blog-search';

vi.mock('../src/platform/bridge', () => ({ searchOwnBlog: vi.fn() }));
const search = vi.mocked(searchOwnBlog);
let host: HTMLDivElement, root: Root;
const result = (query = '연애', page = 1, ids = ['10001'], hasMore = false): BlogSearchResult => ({ blogUrl: ownBlog, query, page, total: 216, hasMore, posts: ids.map(id => ({ blogId: 'example_blog', postId: id, url: ownBlog + '/' + id, title: query + ' 제목 ' + id, tags: [], excerpt: query + ' 관련 본문 발췌', publishedAt: '2026-10-08', collectedAt: '2026-10-08T00:00:00Z' })) });
const baseProps = () => ({ blogUrl: ownBlog, posts: [], keywords: ['연애'], linkedUrls: [], busy: false, canInsert: true, demo: false, onInsert: vi.fn(), onSettings: vi.fn(), onRegister: vi.fn(), onOpened: vi.fn(), onImport: vi.fn(), onDemo: vi.fn() });
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); search.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent === text)!;
async function click(text: string) { await act(async () => button(text).click()); }
async function type(value: string) {
 const input = host.querySelector<HTMLInputElement>('[aria-label="내 글 검색"]')!;
 await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function submit() { await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))); }

describe('registration-free own posts panel', () => {
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
  expect(host.querySelectorAll('article')).toHaveLength(0); expect(host.textContent).toContain('검색어로 내 글을 찾아보세요'); expect(host.querySelector('input')?.value).toBe('');
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
