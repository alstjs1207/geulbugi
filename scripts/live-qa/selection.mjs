// Real browser input only. Rendering geometry chooses a caret point; Naver's
// own input frame then handles the keyboard selection.
export async function selectText(page,prefix,start,end=start){
 const selector=await page.evaluate(prefix=>{const doc=document.querySelector('iframe').contentDocument,root=doc.querySelector('.se-components-wrap'),matches=[...root.querySelectorAll('.se-text-paragraph')].filter(p=>!p.closest('.se-caption,.se-table')&&p.textContent.replace(/\u00a0/g,' ').startsWith(prefix));if(matches.length!==1)throw new Error('대상 문단이 하나가 아닙니다: '+prefix);return '#'+matches[0].id;},prefix);
 // Native scrolling avoids wheel overshoot in Naver's nested editor frame.
 await page.evaluate(selector=>document.querySelector('iframe').contentDocument.querySelector(selector).scrollIntoView({block:'center',inline:'nearest'}),selector);
 const point=await page.evaluate(({selector,start})=>{const frame=document.querySelector('iframe'),doc=frame.contentDocument,p=doc.querySelector(selector),range=doc.createRange(),walker=doc.createTreeWalker(p,NodeFilter.SHOW_TEXT,{acceptNode:node=>node.parentElement.closest('.se-placeholder,.__se_placeholder')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});let left=start,node;while(node=walker.nextNode()){if(left<=node.textContent.length){range.setStart(node,left);break;}left-=node.textContent.length;}if(!node)throw new Error('문단 오프셋을 찾지 못했습니다.');range.collapse(true);const rect=range.getClientRects()[0],frameBounds=frame.getBoundingClientRect();if(!rect||!rect.height)throw new Error('글자 경계가 표시되지 않습니다.');return {x:frameBounds.left+rect.left+.25,y:frameBounds.top+rect.top+rect.height/2,text:p.textContent.replace(/\u00a0/g,' ')};},{selector,start});
 // Naver draws its own caret as an SVG rect above the glyph. Dispatch real
 // pointer input to the rendered point, including that public input overlay.
 await page.mouse.click(point.x,point.y,{label:'실제 본문 커서 선택'});
 if(end>start){await page.keyboard.down('Shift');try{for(const _ of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(point.text.slice(start,end)))await page.keyboard.press('ArrowRight');}finally{await page.keyboard.up('Shift');}}
 return {selector,start,end,text:point.text.slice(start,end)};
}

export async function selectBetween(page,firstPrefix,start,lastPrefix,end,{reverse=false}={}){
 const text=await page.evaluate(({firstPrefix,start,lastPrefix,end})=>{
  const root=document.querySelector('iframe').contentDocument.querySelector('.se-components-wrap');
  const paragraphs=[...root.querySelectorAll('.se-text-paragraph')].filter(p=>!p.closest('.se-caption,.se-table')).map(p=>p.textContent.replace(/\u00a0/g,' '));
  const first=paragraphs.findIndex(text=>text.startsWith(firstPrefix)),last=paragraphs.findIndex(text=>text.startsWith(lastPrefix));
  if(first<0||last<first)throw new Error('여러 문단 선택의 경계를 찾지 못했습니다.');
  return paragraphs.slice(first,last+1).map((text,index,items)=>first===last?text.slice(start,end):index===0?text.slice(start):index===items.length-1?text.slice(0,end):text).join('\n');
 },{firstPrefix,start,lastPrefix,end});
 await selectText(page,reverse?lastPrefix:firstPrefix,reverse?end:start);
 await page.keyboard.down('Shift');
 try{for(const _ of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text))await page.keyboard.press(reverse?'ArrowLeft':'ArrowRight');}
 finally{await page.keyboard.up('Shift');}
 return {text,reverse};
}

