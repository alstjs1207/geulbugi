export const ownBlog = 'https://blog.naver.com/example_blog';
export function resultHtml(items: { id: string; title?: string; excerpt?: string; date?: string; href?: string }[], total = items.length, nextPage?: number): string {
 return `<form action="/PostSearchList.naver"><input name="blogId" value="example_blog"></form><table><tr><td class="c b">검색결과 <font>${total.toLocaleString('en-US')}건</font></td></tr></table>` +
  items.map(item => `<table><tr><td><table><tr><td><a class="s_link" href="${item.href ?? '/example_blog?Redirect=Log&amp;logNo=' + item.id + '&amp;from=postView'}">${item.title ?? '연애 ' + item.id}</a><span class="ct">|카테고리</span></td><td class="eng">${item.date ?? '2026/10/08 12:30'}</td></tr></table></td></tr><tr><td>${item.excerpt ?? '본문의 연애 관련 발췌입니다.'}</td></tr></table>`).join('') +
  (nextPage ? `<a href="javascript:goPage(${nextPage});">다음</a>` : '');
}
