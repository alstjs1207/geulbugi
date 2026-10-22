import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ownBlog } from './helpers/blog-search';
const mocks = vi.hoisted(() => ({ load: vi.fn(), fetch: vi.fn() }));
vi.mock('../src/platform/storage', () => ({ loadDatabase: mocks.load, commitDatabaseDiff: vi.fn() }));
vi.mock('../src/platform/blog-search-fetch', () => ({ fetchBlogSearchHtml: mocks.fetch }));

beforeEach(() => { vi.resetModules(); mocks.load.mockReset().mockResolvedValue({ settings: { blogUrl: ownBlog } }); mocks.fetch.mockReset().mockResolvedValue({ html: 'public HTML', url: 'scoped URL' }); });
afterEach(() => vi.unstubAllGlobals());
async function background() {
 const onMessage = vi.fn();
 vi.stubGlobal('chrome', { runtime: { id: 'own-extension', onInstalled: { addListener: vi.fn() }, onMessage: { addListener: onMessage } }, tabs: { onRemoved: { addListener: vi.fn() } }, sidePanel: { setPanelBehavior: vi.fn(async () => {}) }, commands: { onCommand: { addListener: vi.fn() } } });
 await import('../src/background');
 const listener = onMessage.mock.calls[0][0];
 return (message: object, sender = { id: 'own-extension' }) => new Promise(resolve => listener({ type: 'SEARCH_OWN_BLOG', ...message }, sender, resolve));
}
describe('own blog search routing', () => {
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
