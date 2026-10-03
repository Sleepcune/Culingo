import type {Rect,WordIndex} from '../types';
export interface PDFChar {c?:string;u?:string;rect:Rect;inlineRect?:Rect;lineBreakAfter?:boolean;paragraphBreakAfter?:boolean;spaceAfter?:boolean;ignorable?:boolean}
export interface PageText {text:string;mapping:(PDFChar|undefined)[];blocks:{text:string;start:number;end:number;rects:Rect[]}[]}
export interface PDFWord {word:string;start:number;end:number;rects:Rect[];sentence:string}
export function charRects(chars:PDFChar[]):Rect[] {
 const result:Rect[]=[];let previous:PDFChar|undefined;
 for(const char of chars){const r=char.inlineRect??char.rect;if(!r?.every(Number.isFinite))continue;
  const last=result.at(-1);const height=Math.max(1,r[3]-r[1]);
  if(!last||previous?.lineBreakAfter||previous?.paragraphBreakAfter||Math.abs((last[1]+last[3]-r[1]-r[3])/2)>height*.55||r[0]>last[2]+height*3){result.push([...r]);}
  else {last[0]=Math.min(last[0],r[0]);last[1]=Math.min(last[1],r[1]);last[2]=Math.max(last[2],r[2]);last[3]=Math.max(last[3],r[3]);}previous=char;
 }return result;
}
export function pageText(chars:PDFChar[]):PageText {
 let text='';const mapping:(PDFChar|undefined)[]=[];
 for(const char of chars){if(char.ignorable)continue;const value=char.u??char.c??'';text+=value;for(let i=0;i<value.length;i++)mapping.push(char);
  const separator=char.paragraphBreakAfter?'\n\n':char.lineBreakAfter?'\n':char.spaceAfter?' ':'';text+=separator;for(let i=0;i<separator.length;i++)mapping.push(undefined);
 }
 const blocks:PageText['blocks']=[];const re=/[^\n]+(?:\n(?!\n)[^\n]+)*/g;
 for(const match of text.matchAll(re)){const start=match.index!;const end=start+match[0].length;blocks.push({text:match[0].trim().replace(/\n/g,' '),start,end,rects:charRects([...new Set(mapping.slice(start,end).filter((x):x is PDFChar=>!!x))])});}
 return {text,mapping,blocks};
}
export function wordsFromPage(page:PageText,index:WordIndex):PDFWord[] {
 const result:PDFWord[]=[];
 const add=(word:string,start:number,end:number)=>{
  const block=page.blocks.find(b=>start>=b.start&&start<b.end);const context=page.text.slice(block?.start??0,block?.end??page.text.length);const at=start-(block?.start??0);
  const before=context.slice(0,at);const boundary=Math.max(before.lastIndexOf('.'),before.lastIndexOf('!'),before.lastIndexOf('?'))+1;const after=context.slice(at).search(/[.!?](?:\s|$)/);const sentence=context.slice(boundary,after<0?undefined:at+after+1).trim().replace(/-\n(?=[a-z])/g,'').replace(/\s+/g,' ');
  result.push({word,start,end,sentence,rects:charRects([...new Set(page.mapping.slice(start,end).filter((x):x is PDFChar=>!!x))])});
 };
 for(const m of page.text.matchAll(/[A-Za-z]+(?:['’\-][A-Za-z]+)*(?:-\n[A-Za-z]+)?/g)){
  const raw=m[0];const start=m.index!;
  if(raw.includes('-\n')){const joined=raw.replace('-\n','');const key=joined.toLowerCase();if(Object.hasOwn(index.ranks,key)||Object.hasOwn(index.forms,key)){add(joined,start,start+raw.length);continue;}
   for(const part of raw.matchAll(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g))add(part[0],start+part.index!,start+part.index!+part[0].length);
  }else add(raw,start,start+raw.length);
 }return result;
}
export function toViewportRect(rect:Rect,viewport:{convertToViewportPoint:(x:number,y:number)=>number[]}):Rect {
 const points=[[rect[0],rect[1]],[rect[0],rect[3]],[rect[2],rect[1]],[rect[2],rect[3]]].map(([x,y])=>viewport.convertToViewportPoint(x,y));
 return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
}
export function hitWord(words:PDFWord[],x:number,y:number):PDFWord|undefined{return words.find(w=>w.rects.some(r=>x>=r[0]&&x<=r[2]&&y>=r[1]&&y<=r[3]));}
