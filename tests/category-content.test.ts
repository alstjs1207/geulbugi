// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), edit: vi.fn() }));
vi.mock('../src/platform/blog-search-fetch', () => ({ fetchBlogCategoryWidget: mocks.fetch }));
vi.mock('../src/editor/native-adapter', () => ({ NativeAdapter: class {
 reader = { getRoot: () => null, onChange: () => {} };
 snapshot = async () => ({ editable: false });
 handle = mocks.edit;
} }));
beforeEach(() => { vi.resetModules(); mocks.fetch.mockReset().mockResolvedValue({ html: 'public categories', url: 'public widget URL' }); mocks.edit.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
async function setup() {
 const register = vi.fn();
 vi.stubGlobal('chrome', { runtime: { id: 'own-extension', onMessage: { addListener: register }, sendMessage: vi.fn() } });
 await import('../src/content');
 return register.mock.calls[0][0];
}
it('reads categories without requiring an editor root and never dispatches an edit', async () => {
 const listener = await setup();
 const result = await new Promise(resolve => listener({ type: 'BLOG_CATEGORIES_HTML', blogUrl: 'https://blog.naver.com/example_blog' }, { id: 'own-extension' }, resolve));
 expect(result).toEqual({ ok: true, html: 'public categories', url: 'public widget URL' });
 expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('https://blog.naver.com/example_blog'); expect(mocks.edit).not.toHaveBeenCalled();
});
it('ignores a foreign sender and returns source failures without mutating a document', async () => {
 const listener = await setup(), reply = vi.fn();
 expect(listener({ type: 'BLOG_CATEGORIES_HTML', blogUrl: 'https://blog.naver.com/example_blog' }, { id: 'foreign' }, reply)).toBe(false);
 expect(mocks.fetch).not.toHaveBeenCalled(); expect(reply).not.toHaveBeenCalled();
 mocks.fetch.mockRejectedValueOnce(new Error('카테고리 응답 지연'));
 expect(await new Promise(resolve => listener({ type: 'BLOG_CATEGORIES_HTML', blogUrl: 'https://blog.naver.com/example_blog' }, { id: 'own-extension' }, resolve))).toEqual({ ok: false, error: '카테고리 응답 지연' });
 expect(mocks.edit).not.toHaveBeenCalled();
});
