export const BLOCK_SELECTOR='p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,div,section,article,main';
export const EXCLUDED='script,style,noscript,textarea,input,select,button,pre,code,kbd,samp,svg,canvas,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[data-culingo]';
export interface TextPart {node:Text;start:number;end:number;}
export interface TextBlock {text:string;parts:TextPart[];}
export function readable(node:Text):boolean {
  const parent=node.parentElement;
  if(!parent||parent.closest(EXCLUDED)||!node.data.trim())return false;
  const style=getComputedStyle(parent);return style.display!=='none'&&style.visibility!=='hidden';
}
export function extractBlock(block:Element):TextBlock {
  const parts:TextPart[]=[];let text='';
  const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
    const textNode=node as Text;
    if(!readable(textNode)||(textNode.parentElement?.closest(BLOCK_SELECTOR)??document.body)!==block)continue;
    parts.push({node:textNode,start:text.length,end:text.length+textNode.length});text+=textNode.data;
  }
  return {text,parts};
}
export function rangeFor(parts:TextPart[],start:number,end:number):Range|null {
  const first=parts.find(p=>p.start<=start&&p.end>start);const last=parts.find(p=>p.start<end&&p.end>=end);
  if(!first||!last)return null;const range=document.createRange();range.setStart(first.node,start-first.start);range.setEnd(last.node,end-last.start);return range;
}
export function tokens(text:string) {return [...text.matchAll(/[a-z]+(?:[’'‐‑-][a-z]+)*/gi)].map(m=>({word:m[0],start:m.index!,end:m.index!+m[0].length}));}
export function sentenceAt(text:string,offset:number):string {
  const before=text.slice(0,offset);const prior=[...before.matchAll(/[.!?。！？]\s+/g)].at(-1);const start=prior?prior.index!+prior[0].length:0;
  const after=text.slice(offset);const next=/[.!?。！？](?:\s|$)/.exec(after);const end=next?offset+next.index+1:text.length;
  return text.slice(start,end).trim().slice(0,10000);
}
