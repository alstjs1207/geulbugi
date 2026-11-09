import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOG_SEARCH_HTML_LIMIT, fetchBlogCategoryWidget, fetchBlogSearchHtml, fetchRecentBlogHtml } from '../src/platform/blog-search-fetch';
import { blogCategoryWidgetUrl } from '../src/core/blog-categories';
import { recentBlogUrl, RECENT_BLOG_RELOAD_MESSAGE } from '../src/core/blog-recent';
import { blogSearchUrl } from '../src/core/blog-search';
import { ownBlog } from './helpers/blog-search';

const request = { blogUrl: ownBlog, query: '연애', page: 1 };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded anonymous blog search requests', () => {
 it('uses the same bounded anonymous fetch for public categories and category-specific posts', async () => {
  const fetch = vi.fn(async () => new Response('public data')); vi.stubGlobal('fetch', fetch);
  expect(await fetchBlogCategoryWidget(ownBlog)).toEqual({ html: 'public data', url: blogCategoryWidgetUrl(ownBlog) });
  expect(fetch).toHaveBeenLastCalledWith(blogCategoryWidgetUrl(ownBlog), { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) });
  expect((await fetchRecentBlogHtml(ownBlog, 2, '9')).url).toBe(recentBlogUrl(ownBlog, 2, '9'));
 });
 it('refreshes recent posts without HTTP cache, cookies or redirects', async () => {
  const fetch = vi.fn(async () => new Response('recent HTML'));
  vi.stubGlobal('fetch', fetch);
  expect(await fetchRecentBlogHtml(ownBlog)).toEqual({ html: 'recent HTML', url: recentBlogUrl(ownBlog) });
  expect(fetch).toHaveBeenCalledWith(recentBlogUrl(ownBlog), { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) });
 });
 it('also bounds recent responses and rejects unexpected destinations', async () => {
  const response = new Response('html'); Object.defineProperty(response, 'url', { value: recentBlogUrl('https://blog.naver.com/other_blog') });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response).mockResolvedValueOnce(new Response(new Uint8Array(BLOG_SEARCH_HTML_LIMIT + 1))));
  await expect(fetchRecentBlogHtml(ownBlog)).rejects.toThrow('최근 글 목록을 확인하지 못했어요');
  await expect(fetchRecentBlogHtml(ownBlog)).rejects.toThrow('너무 커요');
 });
 it('fetches the requested recent page and rejects a response for another page', async () => {
  const response = new Response('html'); Object.defineProperty(response, 'url', { value: recentBlogUrl(ownBlog) });
  const fetch = vi.fn().mockResolvedValueOnce(new Response('page 2')).mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetch);
  expect((await fetchRecentBlogHtml(ownBlog, 2)).url).toBe(recentBlogUrl(ownBlog, 2));
  expect(fetch.mock.calls[0][0]).toBe(recentBlogUrl(ownBlog, 2));
  await expect(fetchRecentBlogHtml(ownBlog, 2)).rejects.toThrow(RECENT_BLOG_RELOAD_MESSAGE);
 });
 it('fetches the public search page without cookies and refuses redirects', async () => {
  const fetch = vi.fn(async () => new Response('<p>공개 검색</p>'));
  vi.stubGlobal('fetch', fetch);
  expect(await fetchBlogSearchHtml(request)).toEqual({ html: '<p>공개 검색</p>', url: blogSearchUrl(request) });
  expect(fetch).toHaveBeenCalledWith(blogSearchUrl(request), { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal) });
 });
 it('decodes Korean even when UTF-8 characters cross stream chunks', async () => {
  const bytes = new TextEncoder().encode('검색 결과 연애'), stream = new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 2)); controller.enqueue(bytes.slice(2)); controller.close(); } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(stream)));
  expect((await fetchBlogSearchHtml(request)).html).toBe('검색 결과 연애');
 });
 it('rejects oversized content before reading it when the length is declared', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { headers: { 'content-length': String(BLOG_SEARCH_HTML_LIMIT + 1) } })));
  await expect(fetchBlogSearchHtml(request)).rejects.toThrow('너무 커요');
 });
 it('also enforces the byte limit for chunked responses without a declared length', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(BLOG_SEARCH_HTML_LIMIT + 1))));
  await expect(fetchBlogSearchHtml(request)).rejects.toThrow('너무 커요');
 });
 it('does not accept a response from another blog', async () => {
  const response = new Response('html'); Object.defineProperty(response, 'url', { value: blogSearchUrl({ ...request, blogUrl: 'https://blog.naver.com/other_blog' }) });
  vi.stubGlobal('fetch', vi.fn(async () => response));
  await expect(fetchBlogSearchHtml(request)).rejects.toThrow('내 블로그 검색 결과');
 });
 it('reports HTTP and connection failures', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockRejectedValueOnce(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetch);
  await expect(fetchBlogSearchHtml(request)).rejects.toThrow('잠시 후 다시');
  await expect(fetchBlogSearchHtml(request)).rejects.toThrow('인터넷 연결');
 });
 it('aborts a slow request and reports a retryable timeout', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new Error('aborted'))))));
  const outcome = expect(fetchBlogSearchHtml(request)).rejects.toThrow('검색 응답이 늦어지고');
  await vi.advanceTimersByTimeAsync(12000); await outcome;
 });
});
