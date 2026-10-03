import { rpc } from '../shared/client';
import { BLOCK_SELECTOR, EXCLUDED, extractBlock } from './text';
export class PageTranslation {
  enabled=false;private observer?:IntersectionObserver;private generation=0;private hosts=new Map<Element,HTMLElement>();private pending=new Map<Element,string>();private fingerprints=new Map<Element,string>();
  constructor(private status:(text:string)=>void,private clear:()=>void) {}
  toggle(){if(this.enabled)this.stop();else this.start();}
  start(){this.enabled=true;const generation=++this.generation;this.status('双语阅读 · 先翻译可见正文');this.observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)void this.translate(entry.target,generation);},{rootMargin:'300px'});this.observe(document.body);}
  observe(root:Element){if(!this.enabled)return;const nodes=[...(root.matches(BLOCK_SELECTOR)?[root]:[]),...root.querySelectorAll(BLOCK_SELECTOR)];for(const node of nodes)if(!node.closest(EXCLUDED)&&extractBlock(node).text.trim().length>=12)this.observer?.observe(node);}
  async paragraph(block:Element) {this.status('段落翻译 · 保留原文');await this.translate(block,this.generation,true);}
  invalidate(block:Element){
    const request=this.pending.get(block);if(request){this.pending.delete(block);void rpc('translation.cancel',{requestIds:[request]}).catch(()=>{});}
    this.hosts.get(block)?.remove();this.hosts.delete(block);this.fingerprints.delete(block);
    if(this.enabled){this.observer?.unobserve(block);this.observer?.observe(block);}
  }
  private async translate(block:Element,generation:number,manual=false) {
    if((!this.enabled&&!manual)||block.closest(EXCLUDED)||!block.isConnected)return;
    const text=extractBlock(block).text.trim();if(!text||!/[a-z]{3}/i.test(text))return;
    if(this.pending.has(block)||this.fingerprints.get(block)===text)return;
    const id=crypto.randomUUID();this.pending.set(block,id);this.fingerprints.set(block,text);
    let host=this.hosts.get(block);
    if(!host){host=document.createElement('div');host.dataset.culingo='translation';host.style.cssText='display:block;margin:8px 0 14px;clear:both';this.hosts.set(block,host);block.after(host);}
    const shadow=host.shadowRoot??host.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=':host{color-scheme:light dark}div{font:400 14px/1.8 system-ui,"Microsoft YaHei",sans-serif;color:#467864;border-left:3px solid #92b7a0;padding:4px 12px;white-space:pre-wrap}button{font:inherit;cursor:pointer;color:inherit;background:transparent;border:1px solid #92b7a0;border-radius:5px;margin-left:10px}@media(prefers-color-scheme:dark){div{color:#b6d5c2}}';const output=document.createElement('div');output.textContent='正在翻译…';shadow.replaceChildren(style,output);
    try {
      const result=await rpc('translation.translate',{text,requestId:id});
      if(generation!==this.generation||this.pending.get(block)!==id||!block.isConnected||extractBlock(block).text.trim()!==text)return;
      output.textContent=result.text;
    } catch(error) {
      if(generation!==this.generation||this.pending.get(block)!==id)return;
      output.textContent=error instanceof Error?error.message:'翻译失败。';this.status('部分段落翻译失败，可点击重试');
      const retry=document.createElement('button');retry.textContent='重试';retry.onclick=()=>{this.fingerprints.delete(block);void this.translate(block,this.generation,manual);};output.append(retry);
    } finally {if(this.pending.get(block)===id)this.pending.delete(block);}
  }
  removeDetached(){for(const [block,host]of this.hosts)if(!block.isConnected){host.remove();this.hosts.delete(block);this.fingerprints.delete(block);const id=this.pending.get(block);if(id)void rpc('translation.cancel',{requestIds:[id]}).catch(()=>{});this.pending.delete(block);}}
  stop(){this.enabled=false;this.generation++;this.observer?.disconnect();this.observer=undefined;const ids=[...this.pending.values()];this.pending.clear();if(ids.length)void rpc('translation.cancel',{requestIds:ids}).catch(()=>{});for(const host of this.hosts.values())host.remove();this.hosts.clear();this.fingerprints.clear();this.clear();}
}
