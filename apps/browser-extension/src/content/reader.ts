import { browser } from 'wxt/browser';
import { rpc } from '../shared/client';
import { shouldHighlight,wordStatus } from '../core/words';
import type { ReadingState } from '../shared/types';
import { BLOCK_SELECTOR,EXCLUDED,extractBlock,rangeFor,tokens,sentenceAt } from './text';
import { ReadingCard } from './card';
import { PageTranslation } from './translation';
interface Mark {range:Range;word:string;sentence:string;learning:boolean;}
interface Job {block:Element;marks:Mark[];todo:ReturnType<typeof tokens>;text:ReturnType<typeof extractBlock>;next:number;version:number;}
export class Reader {
  private state?:ReadingState;private card?:ReadingCard;private translation?:PageTranslation;
  private blocks=new Map<Element,Mark[]>();private jobs=new Map<Element,Job>();private versions=new WeakMap<Element,number>();
  private intersection?:IntersectionObserver;private mutation?:MutationObserver;private style?:HTMLStyleElement;private hoverTimer?:ReturnType<typeof setTimeout>;private closeTimer?:ReturnType<typeof setTimeout>;
  private frame=0;private active=false;private refreshing=false;private again=false;private suspended=false;private disposed=false;private knownUrl=location.href;private navigationTimer?:ReturnType<typeof setInterval>;
  private difficult?:Highlight;private learning?:Highlight;
  constructor() {browser.runtime.onMessage.addListener(this.message);void this.refresh();this.watchNavigation();window.addEventListener('pagehide',this.pageHide);window.addEventListener('pageshow',this.pageShow);}
  private watchNavigation(){clearInterval(this.navigationTimer);this.navigationTimer=setInterval(()=>{if(location.href!==this.knownUrl){this.knownUrl=location.href;this.stop();void this.refresh();}},750);}
  private pageHide=(event:PageTransitionEvent)=>{if(!event.persisted){this.destroy();return;}this.suspended=true;this.stop();clearInterval(this.navigationTimer);};
  private pageShow=(event:PageTransitionEvent)=>{if(!event.persisted||this.disposed)return;this.suspended=false;this.knownUrl=location.href;this.watchNavigation();void this.refresh();};
  private message=(message:unknown,_sender:unknown,respond:(value:unknown)=>void)=>{
    const m=message as {channel?:string;type?:string;action?:string};
    if(m.channel==='culingo-event'&&m.type==='changed')void this.refresh();
    if(m.channel==='culingo-content'&&m.action==='translate.toggle') {
      if(!this.active){respond({ok:false,error:'请先启用当前站点。'});return;}
      if(!this.state?.settings.apiConfigured){respond({ok:false,error:'请先配置翻译服务。'});return;}
      this.translation?.toggle();respond({ok:true});
    }
  };
  private async refresh() {
    if(this.disposed||this.suspended)return;
    if(this.refreshing){this.again=true;return;}this.refreshing=true;
    try {
      const next=await rpc('reading.state');if(this.disposed||this.suspended)return;this.state=next;
      const on=next.siteAuthorized&&next.settings.enabled&&(next.settings.sites[location.origin]??next.settings.allSites);
      if(!on){this.stop();return;}
      if(!this.active)this.start();else {this.card?.theme();for(const block of this.blocks.keys())this.queue(block);}
    }catch {this.stop();}
    finally {this.refreshing=false;if(this.again){this.again=false;void this.refresh();}}
  }
  private start() {
    if(!this.state)return;this.active=true;
    this.card=new ReadingCard(()=>this.state!.settings,()=>{clearTimeout(this.closeTimer);this.closeTimer=undefined;},async block=>{
      if(!this.state?.settings.apiConfigured)throw new Error('请先配置翻译服务。');await this.translation?.paragraph(block);
    });
    this.translation=new PageTranslation(text=>this.card?.toolbar(text,()=>this.translation?.stop()),()=>this.card?.clearToolbar());
    if('highlights' in CSS&&typeof Highlight!=='undefined') {
      this.difficult=new Highlight();this.learning=new Highlight();CSS.highlights.set('culingo-difficult',this.difficult);CSS.highlights.set('culingo-learning',this.learning);
      this.style=document.createElement('style');this.style.dataset.culingo='style';this.style.textContent='::highlight(culingo-difficult){background-color:#c4dcb066;color:inherit;text-decoration:underline;text-decoration-color:#659270}::highlight(culingo-learning){background-color:#edcf8266;color:inherit;text-decoration:underline;text-decoration-color:#ae8745}';document.head.append(this.style);
    }else this.card.toolbar('浏览器版本不支持高亮，请升级；仍可划词查词。',()=>this.card?.clearToolbar());
    this.intersection=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting)this.queue(entry.target);},{rootMargin:'600px'});
    this.observe(document.body);
    this.mutation=new MutationObserver(records=>{
      for(const record of records){
        const target=record.target instanceof Element?record.target:record.target.parentElement;if(target?.closest('[data-culingo]'))continue;
        const block=target?.closest(BLOCK_SELECTOR);if(block){this.translation?.invalidate(block);this.queue(block);}
        for(const node of record.addedNodes)if(node instanceof Element&&!node.closest('[data-culingo]')){this.observe(node);this.translation?.observe(node);}
        if(record.removedNodes.length)this.prune();
      }
    });this.mutation.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','style','class','contenteditable']});
    document.addEventListener('pointermove',this.pointer);document.addEventListener('pointerdown',this.outside);document.addEventListener('mouseup',this.selection);document.addEventListener('keydown',this.key);window.addEventListener('scroll',this.scroll,{passive:true});
  }
  private observe(root:Element) {
    const blocks=[...(root.matches(BLOCK_SELECTOR)?[root]:[]),...root.querySelectorAll(BLOCK_SELECTOR)];
    for(const block of blocks)if(!block.closest(EXCLUDED))this.intersection?.observe(block);
    // Body-level text has no paragraph; track it without modifying the page.
    if(root===document.body)this.intersection?.observe(root);
  }
  private queue(block:Element) {
    if(!this.active||!block.isConnected||block.closest(EXCLUDED))return;
    const box=block.getBoundingClientRect();if(box.bottom<-600||box.top>innerHeight+600)return;
    const version=(this.versions.get(block)??0)+1;this.versions.set(block,version);
    const old=this.blocks.get(block);if(old)for(const m of old)(m.learning?this.learning:this.difficult)?.delete(m.range);
    this.blocks.delete(block);const text=extractBlock(block);this.jobs.set(block,{block,marks:[],todo:tokens(text.text),text,next:0,version});this.schedule();
  }
  private schedule() {if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.process();});}
  private process() {
    if(!this.state||!this.active)return;const start=performance.now();let count=0;
    for(const [block,job]of this.jobs) {
      if(!block.isConnected){this.jobs.delete(block);continue;}
      while(job.next<job.todo.length) {
        const token=job.todo[job.next++]!;
        if(shouldHighlight(token.word,this.state.index,this.state.statuses,this.state.settings.level)) {
          const range=rangeFor(job.text.parts,token.start,token.end);
          if(range){const learning=wordStatus(token.word,this.state.index,this.state.statuses)==='learning';const mark={range,word:token.word,sentence:sentenceAt(job.text.text,token.start),learning};job.marks.push(mark);(learning?this.learning:this.difficult)?.add(range);}
        }
        if(++count>=200||performance.now()-start>8){this.blocks.set(block,job.marks);this.schedule();return;}
      }
      this.blocks.set(block,job.marks);this.jobs.delete(block);
    }
  }
  private prune() {for(const [block,marks]of this.blocks)if(!block.isConnected){for(const m of marks)(m.learning?this.learning:this.difficult)?.delete(m.range);this.blocks.delete(block);this.jobs.delete(block);this.intersection?.unobserve(block);}this.translation?.removeDetached();}
  private pointer=(event:PointerEvent)=>{
    if(!this.card)return;
    if(this.card.contains(event)){clearTimeout(this.closeTimer);this.closeTimer=undefined;clearTimeout(this.hoverTimer);return;}
    clearTimeout(this.hoverTimer);
    const element=event.target instanceof Element?event.target.closest(BLOCK_SELECTOR):null;let found:Mark|undefined;
    if(element)for(const mark of this.blocks.get(element)??[])for(const box of mark.range.getClientRects())if(event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom){found=mark;break;}
    if(found){clearTimeout(this.closeTimer);this.closeTimer=undefined;const word=found;this.hoverTimer=setTimeout(()=>{void this.card?.show({text:word.word,sentence:word.sentence,x:event.clientX,y:event.clientY,block:element??undefined});},250);}
    else if(this.card.visible&&!this.closeTimer)this.closeTimer=setTimeout(()=>{this.closeTimer=undefined;this.card?.close();},400);
  };
  private outside=(event:PointerEvent)=>{if(!this.card?.contains(event))this.card?.close();};
  private selection=(event:MouseEvent)=>{
    if(this.card?.contains(event))return;
    setTimeout(()=>{
      const selection=window.getSelection();const text=selection?.toString().trim();
      if(!text||text.length>50000||!selection?.rangeCount){this.card?.hideSelection();return;}
      const range=selection.getRangeAt(0);const parent=range.startContainer.parentElement;if(parent?.closest(EXCLUDED))return;
      const block=parent?.closest(BLOCK_SELECTOR);let sentence=text;
      if(block){const extracted=extractBlock(block);const part=extracted.parts.find(p=>p.node===range.startContainer);sentence=sentenceAt(extracted.text,(part?.start??0)+range.startOffset);}
      const box=range.getBoundingClientRect();this.card?.selectionAt({text,sentence,x:box.left,y:box.bottom,block:block??undefined});
    },0);
  };
  private key=(event:KeyboardEvent)=>{if(event.key==='Escape'){this.card?.close();}if(event.altKey&&event.key.toLowerCase()==='t'&&!(event.target as Element)?.closest('input,textarea,[contenteditable]')){event.preventDefault();const block=window.getSelection()?.anchorNode?.parentElement?.closest(BLOCK_SELECTOR);if(block)void this.translation?.paragraph(block);}};
  private scroll=()=>{this.card?.hideSelection();};
  private stop(){this.active=false;this.intersection?.disconnect();this.mutation?.disconnect();this.intersection=undefined;this.mutation=undefined;this.translation?.stop();this.translation=undefined;this.card?.destroy();this.card=undefined;this.style?.remove();this.style=undefined;if('highlights' in CSS){CSS.highlights.delete('culingo-difficult');CSS.highlights.delete('culingo-learning');}this.blocks.clear();this.jobs.clear();cancelAnimationFrame(this.frame);this.frame=0;clearTimeout(this.hoverTimer);clearTimeout(this.closeTimer);this.closeTimer=undefined;document.removeEventListener('pointermove',this.pointer);document.removeEventListener('pointerdown',this.outside);document.removeEventListener('mouseup',this.selection);document.removeEventListener('keydown',this.key);window.removeEventListener('scroll',this.scroll);}
  destroy=()=>{if(this.disposed)return;this.disposed=true;this.stop();clearInterval(this.navigationTimer);browser.runtime.onMessage.removeListener(this.message);window.removeEventListener('pagehide',this.pageHide);window.removeEventListener('pageshow',this.pageShow);};
}
