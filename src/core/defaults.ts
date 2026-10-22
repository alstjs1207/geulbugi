import type { Database, Preset } from './types';
export const PRESETS: Preset[] = [
 {id:'body',name:'본문',description:'편하게 읽히는 기본 본문',format:{fontSize:16,color:'#333333',bold:false}},
 {id:'heading',name:'소제목',description:'내용을 나누는 선명한 제목',format:{fontSize:19,color:'#141414',bold:true,align:'left'}},
 {id:'emphasis',name:'강조',description:'중요한 문구를 눈에 띄게',format:{bold:true,color:'#00b976',background:'#c2f4db'}},
 {id:'quote',name:'인용구',description:'네이버 인용구 문단 스타일',format:{paragraphStyle:'quote',quoteStyle:'quotation_line',color:'#555555',align:'left'}},
];
export const defaultDatabase = (): Database => ({schemaVersion:1,settings:{blogUrl:'',rules:{scope:'selection',sentences:1,longLength:32,longMode:'meaning',blankLines:1,preserveExisting:true,reflow:false},shortcutPresets:{'1':'body','2':'heading','3':'emphasis','4':'quote'}},presets:structuredClone(PRESETS),posts:[]});
