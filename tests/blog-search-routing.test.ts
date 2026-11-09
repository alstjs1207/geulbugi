import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ownBlog } from './helpers/blog-search';
const mocks = vi.hoisted(() => ({ load: vi.fn(), fetch: vi.fn(), recent: vi.fn() }));
vi.mock('../src/platform/storage', () => ({ loadDatabase: mocks.load, commitDatabaseDiff: vi.fn() }));
vi.mock('../src/platform/blog-search-fetch', () => ({ fetchBlogSearchHtml: mocks.fetch, fetchRecentBlogHtml: mocks.recent }));

beforeEach(() => { vi.resetModules(); mocks.load.mockReset().mockResolvedValue({ settings: { blogUrl: ownBlog } }); mocks.fetch.mockReset().mockResolvedValue({ html: 'public HTML', url: 'scoped URL' }); mocks.recent.mockReset().mockResolvedValue({ html: 'recent HTML', url: 'recent URL' }); });
afterEach(() => vi.unstubAllGlobals());
async function background() {
 const onMessage = vi.fn();
 const query = vi.fn(async () => [{ id: 10, url: 'https://blog.naver.com/PostWriteForm.naver' }]);
 const send = vi.fn(async () => ({ ok: true, html: 'category widget', url: 'category URL' }));
 vi.stubGlobal('chrome', { runtime: { id: 'own-extension', onInstalled: { addListener: vi.fn() }, onMessage: { addListener: onMessage } }, tabs: { query, sendMessage: send, onRemoved: { addListener: vi.fn() } }, sidePanel: { setPanelBehavior: vi.fn(async () => {}) }, commands: { onCommand: { addListener: vi.fn() } } });
 await import('../src/background');
 const listener = onMessage.mock.calls[0][0];
 return Object.assign((message: object, sender = { id: 'own-extension' }) => new Promise(resolve => listener({ type: 'SEARCH_OWN_BLOG', ...message }, sender, resolve)), { query, send });
}
describe('own blog search routing', () => {
 it('fetches categories through only the top Naver frame in the panel window', async () => {
  const request = await background();
  expect(await request({ type: 'BLOG_CATEGORIES', blogUrl: ownBlog, windowId: 77, url: 'https://evil.test' })).toEqual({ ok: true, html: 'category widget', url: 'category URL' });
  expect(request.query).toHaveBeenCalledExactlyOnceWith({ active: true, windowId: 77 });
  expect(request.send).toHaveBeenCalledExactlyOnceWith(10, { type: 'BLOG_CATEGORIES_HTML', blogUrl: ownBlog }, { frameId: 0 });
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.recent).not.toHaveBeenCalled();
 });
 it('rejects foreign category requests and requires the configured blog before touching a tab', async () => {
  const request = await background();
  for (const blogUrl of ['', null, 'https://evil.test/example_blog', 'https://blog.naver.com/other_blog']) expect(await request({ type: 'BLOG_CATEGORIES', blogUrl })).toMatchObject({ ok: false });
  expect(await request({ type: 'BLOG_CATEGORIES', blogUrl: ownBlog }, { id: 'foreign-extension' })).toMatchObject({ ok: false });
  expect(request.send).not.toHaveBeenCalled(); expect(request.query).not.toHaveBeenCalled();
 });
 it('explains outdated content scripts instead of pretending there are no categories', async () => {
  const request = await background(); request.send.mockRejectedValueOnce(new Error('Receiving end does not exist'));
  expect(await request({ type: 'BLOG_CATEGORIES', blogUrl: ownBlog })).toMatchObject({ ok: false, error: expect.stringContaining('글쓰기 탭을 새로고침') });
 });
 it('routes a validated category-specific recent page and rejects invalid category input', async () => {
  const request = await background();
  expect(await request({ type: 'RECENT_OWN_BLOG', blogUrl: ownBlog, categoryNo: '9', page: 2 })).toMatchObject({ ok: true });
  expect(mocks.recent).toHaveBeenCalledExactlyOnceWith(ownBlog, 2, '9');
  mocks.recent.mockClear(); mocks.load.mockClear();
  expect(await request({ type: 'RECENT_OWN_BLOG', blogUrl: ownBlog, categoryNo: '9&blogId=other_blog' })).toMatchObject({ ok: false });
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.recent).not.toHaveBeenCalled();
 });
 it('loads a validated recent page only for the saved blog, ignoring a caller-supplied URL', async () => {
  const request = await background();
  expect(await request({ type: 'RECENT_OWN_BLOG', blogUrl: ownBlog, url: 'https://evil.test', page: 2 })).toEqual({ ok: true, html: 'recent HTML', url: 'recent URL' });
  expect(mocks.recent).toHaveBeenCalledExactlyOnceWith(ownBlog, 2);
  expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it.each([0, -1, 1.5, 11, '2'])('rejects an invalid recent page before accessing settings or the network: %s', async page => {
  const request = await background();
  expect(await request({ type: 'RECENT_OWN_BLOG', blogUrl: ownBlog, page })).toMatchObject({ ok: false });
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.recent).not.toHaveBeenCalled();
 });
 it('rejects invalid recent requests before fetching and preserves source errors', async () => {
  const request = await background();
  for (const blogUrl of ['', null, 'https://evil.test/example_blog', 'https://blog.naver.com/other_blog']) {
   expect(await request({ type: 'RECENT_OWN_BLOG', blogUrl })).toMatchObject({ ok: false });
  }
  expect(await request({ type: 'RECENT_OWN_BLOG', blogUrl: ownBlog }, { id: 'foreign-extension' })).toMatchObject({ ok: false });
  expect(mocks.recent).not.toHaveBeenCalled();
  mocks.recent.mockRejectedValueOnce(new Error('최근 글 연결 실패'));
  expect(await request({ type: 'RECENT_OWN_BLOG', blogUrl: ownBlog })).toEqual({ ok: false, error: '최근 글 연결 실패' });
 });
 it('searches only the saved blog and ignores a caller-supplied destination URL', async () => {
  const request = await background();
  expect(await request({ blogUrl: ownBlog, query: ' 연애 ', page: 2, url: 'https://evil.test' })).toEqual({ ok: true, html: 'public HTML', url: 'scoped URL' });
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith({ blogUrl: ownBlog, query: '연애', page: 2 });
 });
 it('rejects a different blog before making any network request', async () => {
  const request = await background();
  expect(await request({ blogUrl: 'https://blog.naver.com/other_blog', query: '연애' })).toMatchObject({ ok: false, error: expect.stringContaining('설정한 내 블로그') });
  expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it('requires an extension sender and valid input before reading settings or the network', async () => {
  const request = await background();
  expect(await request({ blogUrl: ownBlog, query: '연애' }, { id: 'foreign-extension' })).toMatchObject({ ok: false });
  expect(await request({ blogUrl: ownBlog, query: '' })).toMatchObject({ ok: false });
  expect(mocks.load).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it('returns an actionable fetch failure without changing saved posts', async () => {
  const request = await background(); mocks.fetch.mockRejectedValue(new Error('네이버 검색에 연결하지 못했어요.'));
  expect(await request({ blogUrl: ownBlog, query: '연애' })).toEqual({ ok: false, error: '네이버 검색에 연결하지 못했어요.' });
  expect(mocks.load).toHaveBeenCalledTimes(1);
 });
});
