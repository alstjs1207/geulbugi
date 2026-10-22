import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLOG_SEARCH_HTML_LIMIT, fetchBlogSearchHtml } from '../src/platform/blog-search-fetch';
import { blogSearchUrl } from '../src/core/blog-search';
import { ownBlog } from './helpers/blog-search';

const request = { blogUrl: ownBlog, query: '연애', page: 1 };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bounded anonymous blog search requests', () => {
 it('fetches the public search page without cookies and refuses redirects', async () => {
  const fetch = vi.fn(async () => new Response('<p>공개 검색</p>'));
  vi.stubGlobal('fetch', fetch);
  expect(await fetchBlogSearchHtml(request)).toEqual({ html: '<p>공개 검색</p>', url: blogSearchUrl(request) });
  expect(fetch).toHaveBeenCalledWith(blogSearchUrl(request), { credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal) });
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
