import { normalizeBlog } from './security';

export type BlogCategory = { id: string; name: string; depth: number };

export function normalizeCategoryNo(value: unknown = '0'): string {
 const id = typeof value === 'number' && Number.isInteger(value) ? String(value) : value;
 if (typeof id !== 'string' || !/^(?:0|[1-9]\d{0,8})$/u.test(id)) throw new Error('블로그 카테고리를 확인해 주세요.');
 return id;
}

export function blogCategoryWidgetUrl(input: string): string {
 const blogUrl = normalizeBlog(input);
 if (!blogUrl) throw new Error('내 블로그 주소를 먼저 설정해 주세요.');
 const url = new URL('https://blog.naver.com/WidgetListAsync.naver');
 url.search = new URLSearchParams({ blogId: blogUrl.split('/').at(-1)!, enableWidgetKeys: 'category', isCategoryOpen: 'true', selectCategoryNo: '0' }).toString();
 return url.href;
}

export function assertBlogCategoryWidgetUrl(input: string, blogUrl: string): void {
 const actual = new URL(input), expected = new URL(blogCategoryWidgetUrl(blogUrl));
 if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.username || actual.password ||
     [...expected.searchParams].some(([key, value]) => actual.searchParams.get(key) !== value)) throw new Error('내 블로그의 카테고리 목록을 확인하지 못했어요.');
}

// Naver returns a legacy object literal, not JSON. Accept only data tokens;
// never evaluate widget JavaScript, HTML event handlers, or profile content.
export function categoryWidgetHtml(source: string): string {
 const tokens = /\s+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_$][\w$]*|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/gy;
 const parts: string[] = [];
 let at = 0;
 while (at < source.length) {
  tokens.lastIndex = at;
  const match = tokens.exec(source);
  if (!match || match.index !== at) throw new Error('카테고리 자료를 읽지 못했어요. 다시 불러와 주세요.');
  const token = match[0]; at = tokens.lastIndex;
  if (/^\s/u.test(token)) continue;
  if (token[0] === '"' || token[0] === "'") {
   const decoded = token.slice(1, -1).replace(/\\(u[\da-fA-F]{4}|x[\da-fA-F]{2}|['"\\/bfnrtv])/gu, (_all, escape: string) => {
    if (escape[0] === 'u' || escape[0] === 'x') return String.fromCharCode(parseInt(escape.slice(1), 16));
    return ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' } as Record<string, string>)[escape] ?? escape;
   });
   parts.push(JSON.stringify(decoded));
  } else if (/^[A-Za-z_$]/u.test(token)) {
   if (source.slice(at).trimStart().startsWith(':')) parts.push(JSON.stringify(token));
   else if (['true', 'false', 'null'].includes(token)) parts.push(token);
   else throw new Error('카테고리 자료를 읽지 못했어요. 다시 불러와 주세요.');
  } else if (token !== ',' || !/^[}\]]/u.test(source.slice(at).trimStart())) parts.push(token);
 }
 try {
  const data: unknown = JSON.parse(parts.join(''));
  const category = data && typeof data === 'object' && 'category' in data ? data.category : undefined;
  const html = category && typeof category === 'object' && 'content' in category ? category.content : undefined;
  if (typeof html === 'string' && html.length) return html;
 } catch { /* Reject changed or executable responses instead of guessing categories. */ }
 throw new Error('카테고리 목록을 읽지 못했어요. 다시 불러와 주세요.');
}

export function readBlogCategories(doc: Document, input: string): BlogCategory[] {
 const blogUrl = normalizeBlog(input), blogId = blogUrl.split('/').at(-1)!;
 blogCategoryWidgetUrl(blogUrl);
 const root = doc.querySelector('#category-list');
 if (!root) throw new Error('카테고리 목록을 읽지 못했어요. 다시 불러와 주세요.');
 const categories = new Map<string, BlogCategory>();
 for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[id^="category"][href]')) {
  try {
   const id = normalizeCategoryNo(anchor.id.replace(/^category/u, ''));
   const url = new URL(anchor.getAttribute('href')!.trim(), blogUrl);
   if (id === '0' || url.origin !== 'https://blog.naver.com' || url.pathname !== '/PostList.naver' || url.username || url.password ||
       url.searchParams.get('blogId')?.toLowerCase() !== blogId || url.searchParams.get('categoryNo') !== id) continue;
   const copy = anchor.cloneNode(true) as Element; copy.querySelectorAll('script,style,noscript').forEach(node => node.remove());
   const name = (copy.textContent ?? '').replace(/[\u200b\ufeff]/gu, '').replace(/\s+/gu, ' ').trim();
   if (!name || name.length > 200 || categories.has(id)) continue;
   const row = anchor.closest('li');
   const depth = row?.classList.contains('depth2') ? 1 : row?.parentElement?.closest('li') ? 1 : 0;
   categories.set(id, { id, name, depth });
   if (categories.size >= 500) break;
  } catch { /* Ignore separators, restricted categories, and unrelated links. */ }
 }
 return [...categories.values()];
}
