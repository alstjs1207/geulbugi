// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertBlogSearchUrl, blogSearchUrl, normalizeBlogSearchRequest, readBlogSearchDocument } from '../src/core/blog-search';
import { searchOwnBlog } from '../src/platform/bridge';
import { ownBlog, resultHtml } from './helpers/blog-search';

const request = { blogUrl: ownBlog, query: '연애', page: 1 };
const parse = (html: string, page = 1) => readBlogSearchDocument(new DOMParser().parseFromString(html, 'text/html'), { ...request, page });
afterEach(() => vi.unstubAllGlobals());

describe('public in-blog search', () => {
 it('builds a scoped UTF-8 query without allowing search text to replace request parameters', () => {
  const normalized = normalizeBlogSearchRequest({ blogUrl: 'https://m.blog.naver.com/EXAMPLE_BLOG?x=1', query: '  연애  & blogId=foreign_blog  ', page: 2 });
  const url = new URL(blogSearchUrl(normalized));
  expect(normalized).toEqual({ blogUrl: ownBlog, query: '연애 & blogId=foreign_blog', page: 2 });
  expect(url.origin).toBe('https://blog.naver.com'); expect(url.pathname).toBe('/PostSearchList.naver');
  expect(url.searchParams.get('blogId')).toBe('example_blog'); expect(url.searchParams.get('SearchText')).toBe(normalized.query);
  expect(url.searchParams.get('cpage')).toBe('2'); expect(url.searchParams.get('range')).toBe('all');
 });
 it.each(['', '   ', 'a'.repeat(121), '연애\u0000'])('rejects empty, oversized or invalid queries: %s', query => expect(() => normalizeBlogSearchRequest({ ...request, query })).toThrow());
 it.each([0, -1, 1.5, 1001, '2', NaN])('rejects invalid pages: %s', page => expect(() => normalizeBlogSearchRequest({ ...request, page })).toThrow());
 it('reads titles, snippets and dates without requiring any locally registered records', () => {
  const result = parse(resultHtml([{ id: '10001', title: '“우리 사이” <b>연애</b> &amp; 대화', excerpt: '<b>연애</b> 발췌입니다.', date: '2026/07/24 15:46' }], 216, 2));
  expect(result).toMatchObject({ ...request, total: 216, hasMore: true });
  expect(result.posts[0]).toMatchObject({ blogId: 'example_blog', postId: '10001', url: ownBlog + '/10001', title: '“우리 사이” 연애 & 대화', tags: [], excerpt: '연애 발췌입니다.', publishedAt: '2026-07-24' });
  expect(result.posts[0].excerpt).not.toContain('카테고리');
 });
 it('accepts zero results only when the public result heading confirms zero', () => {
  expect(parse(resultHtml([]))).toMatchObject({ posts: [], total: 0, hasMore: false });
  expect(() => parse('<html><p>접근이 제한되었습니다.</p></html>')).toThrow('검색 결과를 읽지 못했어요');
  expect(() => parse('<td class="c b">검색결과 알수없음건</td>')).toThrow();
 });
 it('rejects changed result markup instead of silently showing no matches', () => expect(() => parse(resultHtml([], 10))).toThrow('글 목록을 읽지 못했어요'));
 it('filters another blog and unsafe links, and canonicalizes duplicate desktop and mobile posts', () => {
  const result = parse(resultHtml([
   { id: '10001' }, { id: '10001', href: 'https://m.blog.naver.com/example_blog/10001?tracking=x' },
   { id: '9000', href: 'https://blog.naver.com/foreign_blog/9000' }, { id: '9001', href: 'javascript:alert(1)' },
   { id: '9002', href: 'https://blog.naver.com.evil.test/example_blog/9002' }
  ], 5));
  expect(result.posts.map(post => post.url)).toEqual([ownBlog + '/10001']);
 });
 it('rejects a response that declares a different blog', () => expect(() => parse(resultHtml([{ id: '10001' }]).replace('value="example_blog"', 'value="foreign_blog"'))).toThrow('다른 블로그'));
 it('does not execute or copy page scripts into result text', () => {
  const result = parse(resultHtml([{ id: '10001', title: '연애<script>window.bad=true</script>', excerpt: '본문<style>bad{}</style><script>SECRET</script>' }]));
  expect(result.posts[0].title).toBe('연애'); expect(result.posts[0].excerpt).toBe('본문'); expect((window as unknown as { bad?: boolean }).bad).toBeUndefined();
 });
 it('keeps an unknown or invalid date empty', () => {
  expect(parse(resultHtml([{ id: '1', date: '3시간 전' }, { id: '2', date: '2026/02/30' }])).posts.map(post => post.publishedAt)).toEqual(['', '']);
 });
 it('reads a public next-page link and stops on the last page', () => {
  const html = resultHtml([{ id: '10001' }], 11).concat('<a href="/PostSearchList.naver?blogId=example_blog&SearchText=%EC%97%B0%EC%95%A0&cpage=2">2</a>');
  expect(parse(html).hasMore).toBe(true);
  expect(parse(resultHtml([{ id: '10002' }], 11), 2).hasMore).toBe(false);
 });
 it.each([
  'https://evil.test/PostSearchList.naver?blogId=example_blog&SearchText=%EC%97%B0%EC%95%A0',
  'https://blog.naver.com/PostSearchList.naver?blogId=foreign_blog&SearchText=%EC%97%B0%EC%95%A0',
  'https://blog.naver.com/PostSearchList.naver?blogId=example_blog&SearchText=another',
  'https://blog.naver.com/PostSearchList.naver?blogId=example_blog&SearchText=%EC%97%B0%EC%95%A0&cpage=2'
 ])('rejects a response URL outside the requested search: %s', url => expect(() => assertBlogSearchUrl(url, request)).toThrow());
 it('uses the search bridge without writing registration data or contacting the editor', async () => {
  const sendMessage = vi.fn(async () => ({ ok: true, html: resultHtml([{ id: '10001' }], 216, 2), url: blogSearchUrl(request) }));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  expect((await searchOwnBlog(ownBlog, ' 연애 ')).posts).toHaveLength(1);
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'SEARCH_OWN_BLOG', ...request });
 });
 it('keeps source errors actionable in the bridge', async () => {
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage: vi.fn(async () => ({ ok: false, error: '네이버 응답이 늦어요.' })) } });
  await expect(searchOwnBlog(ownBlog, '연애')).rejects.toThrow('네이버 응답이 늦어요.');
 });
 it('identifies the local preview instead of pretending it performed a Naver search', async () => {
  vi.stubGlobal('chrome', undefined);
  await expect(searchOwnBlog(ownBlog, '연애')).rejects.toThrow('설치된 확장 프로그램');
 });
});
