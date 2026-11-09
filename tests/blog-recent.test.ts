// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertRecentBlogUrl, readRecentBlogDocument, recentBlogUrl, RECENT_BLOG_RELOAD_MESSAGE } from '../src/core/blog-recent';
import { loadRecentBlog } from '../src/platform/bridge';
import { ownBlog } from './helpers/blog-search';

// Representative fragments of Naver's public PostList page: notices sit outside postListBody.
const record = (id: string, title = '최근 글', date = '2시간 전', url = ownBlog + '/' + id) => `<div class="post" id="post_${id}"><div id="post-view${id}"><div class="se-documentTitle"><div class="se-title-text"><p>${title}</p></div><span class="se_publishDate">${date}</span><a id="copyBtn_${id}" title="${url}">URL 복사</a><input class="copyTargetUrl" value="${url}"></div><div class="se-main-container"><a href="${ownBlog}/99999">본문 속 예전 글</a><p>본문은 수집하지 않음</p></div></div></div>`;
const page = (body: string) => `<div class="notice"><a href="${ownBlog}/99998">오래된 공지</a></div><div id="postListBody">${body}</div>`;
// The one-post viewer leaves postBottomTitleListNavigation empty on the wire.
const viewer = (total: number, size: number) => `<script>\nvar pagePerPostCount = ${size};\n</script><div id="category-name"><h4 class="category_title"><a id="categoryTitle"><strong>전체보기</strong></a> ${total}개의 글</h4></div><div id="postBottomTitleListNavigation"></div>`;
const parse = (html: string) => readRecentBlogDocument(new DOMParser().parseFromString(html, 'text/html'), ownBlog);
afterEach(() => vi.unstubAllGlobals());

describe('up to ten public recent posts', () => {
 it('reads a category album in native order and ignores unrelated body links', () => {
  const album = '<div id="postListBody"><div id="PostThumbnailAlbumViewArea"><ul class="thumblist">' + ['10002', '10001'].map(id => `<li class="item"><a class="link" href="/PostView.naver?blogId=example_blog&logNo=${id}&categoryNo=9"><div class="area_text"><strong class="title">앨범 글 ${id}</strong><span class="date">2026. 9. 14.</span></div></a></li>`).join('') + '</ul></div><a href="https://blog.naver.com/example_blog/99999">기타</a></div>';
  const result = readRecentBlogDocument(new DOMParser().parseFromString(album, 'text/html'), ownBlog, 1, '9');
  expect(result.posts.map(post => post.postId)).toEqual(['10002', '10001']);
  expect(result.posts[0]).toMatchObject({ title: '앨범 글 10002', publishedAt: '2026-09-14' });
  expect(() => readRecentBlogDocument(new DOMParser().parseFromString(album.replaceAll('blogId=example_blog', 'blogId=other_blog'), 'text/html'), ownBlog, 1, '9')).toThrow('내 블로그');
 });
 it('keeps category selection across page requests and excludes another category pager', async () => {
  expect(new URL(recentBlogUrl(ownBlog, 2, '9')).searchParams.get('categoryNo')).toBe('9');
  expect(() => assertRecentBlogUrl(recentBlogUrl(ownBlog), ownBlog, 1, '9')).toThrow('최근 글 목록');
  const html = viewer(22, 1).replace('전체보기', '셀럽 건강') + '<div id="blog-category"><input id="categoryNo" value="9"></div>' + page(record('10001'));
  expect(readRecentBlogDocument(new DOMParser().parseFromString(html, 'text/html'), ownBlog, 1, '9').hasMore).toBe(true);
  const sendMessage = vi.fn(async ({ page: current }: { page: number }) => ({ ok: true, html: page(record(String(100 - current))), url: recentBlogUrl(ownBlog, current, '9') }));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  expect((await loadRecentBlog(ownBlog, '9')).posts[0].postId).toBe('99');
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'RECENT_OWN_BLOG', blogUrl: ownBlog, page: 1, categoryNo: '9' });
  expect(readRecentBlogDocument(new DOMParser().parseFromString(page(record('1')) + `<a href="${recentBlogUrl(ownBlog, 2)}">전체 다음</a>`, 'text/html'), ownBlog, 1, '9').hasMore).toBe(false);
 });
 it('requests only the normalized blog’s first all-category page', () => {
  const url = new URL(recentBlogUrl('https://m.blog.naver.com/EXAMPLE_BLOG?x=1'));
  expect(url.pathname).toBe('/PostList.naver');
  expect(Object.fromEntries(url.searchParams)).toEqual({ blogId: 'example_blog', categoryNo: '0', from: 'postList', currentPage: '1' });
  expect(() => recentBlogUrl('')).toThrow('먼저 설정');
  expect(() => recentBlogUrl('https://evil.test/example_blog')).toThrow();
 });
 it('preserves native order, reads relative dates, and excludes notices, body links, excerpts and duplicates', () => {
  const result = parse(page(record('10002', '오늘 글', '2시간 전') + record('10001', '어제 글', '2026. 10. 28. 7:40') + record('10001')));
  expect(result.posts.map(post => post.postId)).toEqual(['10002', '10001']);
  expect(result.posts[0]).toMatchObject({ title: '오늘 글', publishedAt: '', publishedLabel: '2시간 전', excerpt: '', tags: [] });
  expect(result.posts[1].publishedAt).toBe('2026-10-28');
 });
 it('recognizes later all-category pages only for the same blog', () => {
  expect(parse(page(record('1')) + `<a href="${recentBlogUrl(ownBlog, 2)}">다음</a>`).hasMore).toBe(true);
  expect(parse(page(record('1')) + `<a href="${recentBlogUrl('https://blog.naver.com/other_blog', 2)}">다음</a>`).hasMore).toBe(false);
  expect(parse(page(record('1')) + `<a href="${recentBlogUrl(ownBlog, 2).replace('categoryNo=0', 'categoryNo=1')}">다음</a>`).hasMore).toBe(false);
  expect(readRecentBlogDocument(new DOMParser().parseFromString(page(record('1')) + `<a href="${recentBlogUrl(ownBlog, 1)}">이전</a>`, 'text/html'), ownBlog, 2).hasMore).toBe(false);
 });
 it('recognizes a JavaScript-rendered pager from the public count and page size without executing scripts', () => {
  const html = viewer(267, 1) + page(record('1'));
  expect(parse(html).hasMore).toBe(true);
  expect(readRecentBlogDocument(new DOMParser().parseFromString(viewer(2, 1) + page(record('1')), 'text/html'), ownBlog, 2).hasMore).toBe(false);
  expect(readRecentBlogDocument(new DOMParser().parseFromString(viewer(5, 3) + page(record('2') + record('1')), 'text/html'), ownBlog, 2).hasMore).toBe(false);
 });
 it('does not infer more pages from a body script, another category, or invalid viewer metadata', () => {
  expect(parse(page(record('1') + viewer(267, 1))).hasMore).toBe(false);
  expect(parse('<script>var pagePerPostCount = 1;</script>' + page(record('1') + viewer(267, 1))).hasMore).toBe(false);
  expect(parse(viewer(267, 1).replace('전체보기', '다른 카테고리') + page(record('1'))).hasMore).toBe(false);
  expect(parse(viewer(267, 0) + page(record('1'))).hasMore).toBe(false);
  expect(parse(viewer(267, 31) + page(record('1'))).hasMore).toBe(false);
  expect(parse(viewer(267, 1) + '<script>var pagePerPostCount = 3;</script>' + page(record('1'))).hasMore).toBe(false);
 });
 it.each([0, -1, 1.5, 11, NaN, '2'])('rejects unbounded or invalid page numbers: %s', value => {
  expect(() => recentBlogUrl(ownBlog, value as number)).toThrow('페이지');
 });
 it('does not interpret page scripts and keeps invalid dates empty', () => {
  const result = parse(page(record('10001', '제목<script>window.bad=true</script>', '2026. 2. 30.')));
  expect(result.posts[0]).toMatchObject({ title: '제목', publishedAt: '' });
  expect((window as unknown as { bad?: boolean }).bad).toBeUndefined();
 });
 it('uses the URL copy control fallback without inferring identity from article links', () => {
  expect(parse(page(record('10001').replace(/<input[^>]+>/u, ''))).posts[0].postId).toBe('10001');
  expect(() => parse(page(record('10001').replace(/<input[^>]+>|<a id="copyBtn_[^<]+<\/a>/gu, '')))).toThrow('주소를 읽지 못했어요');
 });
 it('rejects another blog or unsafe URL instead of mixing article metadata', () => {
  expect(() => parse(page(record('10001', '제목', '', 'https://blog.naver.com/other_blog/10001')))).toThrow('내 블로그');
  expect(() => parse(page(record('10001', '제목', '', 'javascript:alert(1)')))).toThrow();
 });
 it('requires an explicit empty message and distinguishes blocked or changed markup', () => {
  expect(parse(page('<p>작성된 글이 없습니다.</p>')).posts).toEqual([]);
  expect(() => parse(page(''))).toThrow('목록을 읽지 못했어요');
  expect(() => parse('<p>접근이 제한되었습니다.</p>')).toThrow('목록을 읽지 못했어요');
  expect(() => parse(page(record('10001', '')))).toThrow('제목');
 });
 it.each([
  'https://evil.test/PostList.naver?blogId=example_blog&categoryNo=0&currentPage=1',
  recentBlogUrl(ownBlog).replace('example_blog', 'other_blog'),
  recentBlogUrl(ownBlog).replace('currentPage=1', 'currentPage=2'),
  recentBlogUrl(ownBlog).replace('categoryNo=0', 'categoryNo=1'),
  recentBlogUrl(ownBlog).replace('/PostList.naver', '/PostSearchList.naver')
 ])('rejects an unexpected destination: %s', url => expect(() => assertRecentBlogUrl(url, ownBlog)).toThrow());
 it('uses the dedicated read-only bridge without contacting the editor or saving posts', async () => {
  const sendMessage = vi.fn(async () => ({ ok: true, html: page(record('10001')), url: recentBlogUrl(ownBlog) }));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  expect((await loadRecentBlog(ownBlog)).posts[0].postId).toBe('10001');
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'RECENT_OWN_BLOG', blogUrl: ownBlog, page: 1 });
 });
 const batch = (ids: string[], current: number, more = true) => ({ ok: true, html: page(ids.map(id => record(id)).join('')) + (more ? `<a href="${recentBlogUrl(ownBlog, current + 1)}">다음</a>` : ''), url: recentBlogUrl(ownBlog, current) });
 it('loads ten one-post pages when navigation links are generated only in the browser', async () => {
  const sendMessage = vi.fn(async ({ page: current }: { page: number }) => ({
   ok: true, html: viewer(267, 1) + page(record(String(100 - current))), url: recentBlogUrl(ownBlog, current)
  }));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  expect((await loadRecentBlog(ownBlog)).posts.map(post => post.postId)).toEqual(['99', '98', '97', '96', '95', '94', '93', '92', '91', '90']);
  expect(sendMessage.mock.calls.map(([request]) => request.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
 });
 it('stops at the true last page of a smaller one-post blog without visible page links', async () => {
  const sendMessage = vi.fn(async ({ page: current }: { page: number }) => ({
   ok: true, html: viewer(3, 1) + page(record(String(100 - current))), url: recentBlogUrl(ownBlog, current)
  }));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  expect((await loadRecentBlog(ownBlog)).posts).toHaveLength(3);
  expect(sendMessage).toHaveBeenCalledTimes(3);
 });
 it('reproduces a first-page-only older worker and tells the user to reload instead of retrying blindly', async () => {
  const sendMessage = vi.fn(async () => batch(['3', '2', '1'], 1));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  await expect(loadRecentBlog(ownBlog)).rejects.toThrow(RECENT_BLOG_RELOAD_MESSAGE);
  expect(sendMessage.mock.calls).toHaveLength(2);
 });
 it('accepts an omitted first-page parameter but never treats it as a later page', () => {
  const url = recentBlogUrl(ownBlog).replace('&currentPage=1', '');
  expect(() => assertRecentBlogUrl(url, ownBlog)).not.toThrow();
  expect(() => assertRecentBlogUrl(url, ownBlog, 2)).toThrow(RECENT_BLOG_RELOAD_MESSAGE);
 });
 it('loads four three-post pages and returns exactly the latest ten without fetching more', async () => {
  const sendMessage = vi.fn()
   .mockResolvedValueOnce(batch(['12', '11', '10'], 1))
   .mockResolvedValueOnce(batch(['9', '8', '7'], 2))
   .mockResolvedValueOnce(batch(['6', '5', '4'], 3))
   .mockResolvedValueOnce(batch(['3', '2', '1'], 4));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  expect((await loadRecentBlog(ownBlog)).posts.map(post => post.postId)).toEqual(['12', '11', '10', '9', '8', '7', '6', '5', '4', '3']);
  expect(sendMessage.mock.calls.map(([message]) => message.page)).toEqual([1, 2, 3, 4]);
 });
 it('stops on the last page for blogs with fewer than ten public posts', async () => {
  const sendMessage = vi.fn().mockResolvedValueOnce(batch(['5', '4', '3'], 1)).mockResolvedValueOnce(batch(['2', '1'], 2, false));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  expect((await loadRecentBlog(ownBlog)).posts).toHaveLength(5);
  expect(sendMessage).toHaveBeenCalledTimes(2);
 });
 it('caps a larger first page at ten and deduplicates posts across pages', async () => {
  const sendMessage = vi.fn().mockResolvedValueOnce(batch(Array.from({ length: 15 }, (_, i) => String(20 - i)), 1));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  expect((await loadRecentBlog(ownBlog)).posts).toHaveLength(10);
  expect(sendMessage).toHaveBeenCalledTimes(1);
  sendMessage.mockReset().mockResolvedValueOnce(batch(['5', '4', '3'], 1)).mockResolvedValueOnce(batch(['3', '2', '1'], 2, false));
  expect((await loadRecentBlog(ownBlog)).posts.map(post => post.postId)).toEqual(['5', '4', '3', '2', '1']);
 });
 it('rejects a repeated page or a later failure instead of silently treating it as a complete list', async () => {
  const sendMessage = vi.fn().mockResolvedValueOnce(batch(['3', '2', '1'], 1)).mockResolvedValueOnce(batch(['3', '2', '1'], 2));
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  await expect(loadRecentBlog(ownBlog)).rejects.toThrow('다음 최근 글');
  sendMessage.mockReset().mockResolvedValueOnce(batch(['3', '2', '1'], 1)).mockResolvedValueOnce({ ok: false, error: '연결 오류' });
  await expect(loadRecentBlog(ownBlog)).rejects.toThrow('연결 오류');
 });
 it('surfaces source errors, malformed responses and local preview limitations', async () => {
  const sendMessage = vi.fn().mockResolvedValueOnce({ ok: false, error: '조회 지연' }).mockResolvedValueOnce({ ok: true, html: null });
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', sendMessage } });
  await expect(loadRecentBlog(ownBlog)).rejects.toThrow('조회 지연');
  await expect(loadRecentBlog(ownBlog)).rejects.toThrow('목록을 확인하지 못했어요');
  vi.stubGlobal('chrome', undefined);
  await expect(loadRecentBlog(ownBlog)).rejects.toThrow('설치된 확장 프로그램');
 });
});
