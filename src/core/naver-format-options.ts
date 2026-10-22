import type {Block, Format, Preset, QuoteStyle} from './types';

// Public insertion menu and property toolbar observed in Ego Lite, 2026-10-07.
export const NAVER_QUOTE_STYLES: {value:QuoteStyle;label:string;name:string}[]=[
 {value:'default',label:'인용구 1',name:'따옴표'},
 {value:'quotation_line',label:'인용구 2',name:'버티컬 라인'},
 {value:'quotation_bubble',label:'인용구 3',name:'말풍선'},
 {value:'quotation_underline',label:'인용구 4',name:'라인&따옴표'},
 {value:'quotation_postit',label:'인용구 5',name:'포스트잇'},
 {value:'quotation_corner',label:'인용구 6',name:'프레임'},
];
export function isNaverQuoteStyle(value:unknown):value is QuoteStyle{return NAVER_QUOTE_STYLES.some(option=>option.value===value);}
export function resolveQuoteStyle(format:Format,source?:Pick<Block,'kind'|'quoteStyle'|'align'>):string{
 if(format.quoteStyle!==undefined)return format.quoteStyle;
 // Older presets chose the first two shapes through alignment. Keep that path,
 // while an unspecified layout preserves the shape of an existing quotation.
 if(format.align==='left')return 'quotation_line';
 if(format.align==='center')return 'default';
 if(source?.kind==='quote'&&source.quoteStyle)return source.quoteStyle;
 return source?.align==='left'?'quotation_line':'default';
}
export function quoteStyleName(value:string):string{
 const option=NAVER_QUOTE_STYLES.find(option=>option.value===value);
 return option?option.label+' · '+option.name:'지원 모양 선택';
}

// Observed public SmartEditor ONE palette and size menu. The hidden custom HEX
// picker is not a usable public control in the Naver Blog writing screen.
export const NAVER_FONT_SIZES=[11,13,15,16,19,24,28,30,34,38];
export const NAVER_COLORS=[
 '#999999','#ffcdc0','#ffe3c8','#fff8b2','#e3fdc8','#c2f4db','#bdfbfa','#b0f1ff','#9bdfff','#fdd5f5','#ffb7de','#ffffff',
 '#777777','#ffad98','#ffd1a4','#fff593','#badf98','#3fcc9c','#15d0ca','#28e1ff','#5bc7ff','#cd8bc0','#ff97c1','#f7f7f7',
 '#555555','#ff5f45','#ffa94f','#ffef34','#98d36c','#00b976','#00bfb5','#00cdff','#0095e9','#bc61ab','#ff65a8','#e2e2e2',
 '#333333','#ff0010','#ff9300','#ffd300','#54b800','#00a84b','#009d91','#00b3f2','#0078cb','#aa1f91','#ff008c','#c2c2c2',
 '#141414','#ba0000','#b85c00','#ac9a00','#36851e','#007433','#00756a','#007aa6','#004e82','#740060','#bb005c','#9c9c9c',
 '#000000','#700001','#823f00','#6a5f00','#245b12','#004e22','#00554c','#004e6a','#003960','#4f0041','#830041',
];
export function isNaverColor(value:string|undefined):boolean{return !!value&&NAVER_COLORS.includes(value.toLowerCase());}
export function naverFormatIssue(format:Format):string|undefined{
 if(format.quoteStyle!==undefined&&!isNaverQuoteStyle(format.quoteStyle))return '네이버에서 지원하는 인용구 모양을 선택해 주세요.';
 if(format.quoteStyle!==undefined&&format.paragraphStyle!=='quote')return '인용구 모양은 문단 스타일이 인용구일 때만 사용할 수 있어요.';
 if(format.fontSize!==undefined&&!NAVER_FONT_SIZES.includes(format.fontSize))return '네이버에서 지원하는 글자 크기를 선택해 주세요.';
 for(const key of ['color','background'] as const)if(format[key]!==undefined&&!isNaverColor(format[key]))return '네이버에서 지원하지 않는 색상 '+format[key]+'예요. 프리셋 수정에서 네이버 색상을 선택해 주세요.';
 if(format.paragraphStyle==='quote'&&format.align==='right')return '네이버 인용구는 왼쪽 또는 가운데 스타일을 선택해 주세요.';
 if(format.paragraphStyle==='quote'&&format.quoteStyle!==undefined&&format.align!==undefined&&!((format.quoteStyle==='quotation_line'&&format.align==='left')||(format.quoteStyle==='default'&&format.align==='center')))return '선택한 인용구 모양의 기본 정렬을 사용해 주세요. 프리셋에서 문단 정렬 체크를 해제해 주세요.';
 if(format.paragraphStyle==='quote'&&format.background!==undefined)return '배경색이 있는 인용구 변환은 아직 지원하지 않아요. 프리셋에서 배경색을 해제해 주세요.';
}
export function assertNaverFormat(format:Format):void{
 const issue=naverFormatIssue(format);if(issue)throw new Error(issue);
}
export function migrateDefaultColors(preset:Preset):Preset{
 const replacements:Record<string,Partial<Record<'color'|'background',[string,string]>>>={body:{color:['#242c28','#333333']},heading:{color:['#202824','#141414']},emphasis:{color:['#139b64','#00b976'],background:['#eaf7f0','#c2f4db']},quote:{color:['#586b60','#555555']}};
 const format={...preset.format};
 for(const key of ['color','background'] as const){const pair=replacements[preset.id]?.[key];if(pair&&format[key]?.toLowerCase()===pair[0])format[key]=pair[1];}
 return {...preset,format};
}
