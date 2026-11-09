// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertBlogCategoryWidgetUrl, blogCategoryWidgetUrl, categoryWidgetHtml, normalizeCategoryNo, readBlogCategories } from '../src/core/blog-categories';
import { loadBlogCategories } from '../src/platform/bridge';
import { ownBlog } from './helpers/blog-search';

const item = (id: string, name: string, extra = '') => `<li ${extra}><a id="category${id}" href="/PostList.naver?blogId=example_blog&categoryNo=${id}">${name}</a></li>`;
const tree = (body: string) => `<div id="category-list"><ul>${item('0', '전체보기')}${body}</ul></div>`;
const parse = (html: string) => readBlogCategories(new DOMParser().parseFromString(html, 'text/html'), ownBlog);
const widget = (html: string) => `{ profile: { content: '설명' }, category : { content : ${JSON.stringify(html)} }, buddy: { isOpen: false }, }`;
afterEach(() => vi.unstubAllGlobals());

describe('public native blog categories', () => {
 it('preserves category names, order and subcategory indentation without evaluating the widget', () => {
  const html = tree(item('13', '건강&nbsp;심리') + item('9', '셀럽 건강', 'class="depth2"') + item('13', '중복'));
  expect(parse(categoryWidgetHtml(widget(html)))).toEqual([{ id: '13', name: '건강 심리', depth: 0 }, { id: '9', name: '셀럽 건강', depth: 1 }]);
  expect(categoryWidgetHtml("{category:{content:'<div id=\"category-list\">\\uAC74\\uAC15 \\'분류\\'</div>'}} ")).toContain("건강 '분류'");
 });
 it('does not confuse profile text with the actual category property or execute code', () => {
  const html = tree(item('13', '진짜 카테고리'));
  expect(categoryWidgetHtml(`{profile:{content:${JSON.stringify("category:{content:'가짜'}")}},category:{content:${JSON.stringify(html)}}}`)).toBe(html);
  for (const source of ["{category:{content:(window.bad=true)}}", "{category:{content:'x'},other:alert(1)}", '{}', '<script>window.bad=true</script>']) expect(() => categoryWidgetHtml(source)).toThrow();
  expect((window as unknown as { bad?: boolean }).bad).toBeUndefined();
 });
 it('excludes body links, foreign blogs, external URLs, restricted entries and unsafe markup', () => {
  const html = item('40', '본문') + tree(item('13', '건강<script>window.bad=true</script>') + item('9', '다른 블로그').replace('example_blog', 'other_blog') + item('10', '외부').replace('/PostList.naver?', 'https://evil.test/PostList.naver?') + '<li><a id="category12" href="#">비공개</a></li>');
  expect(parse(html)).toEqual([{ id: '13', name: '건강', depth: 0 }]);
  expect((window as unknown as { bad?: boolean }).bad).toBeUndefined();
  expect(() => parse('<p>접근이 제한되었습니다.</p>')).toThrow('카테고리 목록');
  expect(parse(tree(''))).toEqual([]);
 });
 it.each(['-1', '01', '1&blogId=other_blog', '', 1.5, null, {}, '9999999999'])('rejects invalid category identifiers: %s', id => expect(() => normalizeCategoryNo(id)).toThrow('카테고리'));
 it('validates the exact anonymous widget destination', () => {
  const url = blogCategoryWidgetUrl(ownBlog);
  expect(new URL(url).searchParams.get('enableWidgetKeys')).toBe('category');
  expect(() => assertBlogCategoryWidgetUrl(url, ownBlog)).not.toThrow();
  for (const wrong of [url.replace('example_blog', 'other_blog'), url.replace('blog.naver.com', 'evil.test'), url.replace('WidgetListAsync', 'PostList')]) expect(() => assertBlogCategoryWidgetUrl(wrong, ownBlog)).toThrow();
 });
 it('loads only the validated category response through the hosting window', async () => {
  const sendMessage = vi.fn(async () => ({ ok: true, html: widget(tree(item('13', '건강심리'))), url: blogCategoryWidgetUrl(ownBlog) }));
  vi.stubGlobal('chrome', { runtime: { id: 'test', sendMessage }, windows: { getCurrent: async () => ({ id: 77 }) } });
  expect(await loadBlogCategories(ownBlog)).toEqual([{ id: '13', name: '건강심리', depth: 0 }]);
  expect(sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'BLOG_CATEGORIES', blogUrl: ownBlog, windowId: 77 });
  sendMessage.mockResolvedValueOnce({ ok: true, html: widget(tree(item('13', '건강심리'))), url: blogCategoryWidgetUrl('https://blog.naver.com/other_blog') });
  await expect(loadBlogCategories(ownBlog)).rejects.toThrow('내 블로그');
 });
});
