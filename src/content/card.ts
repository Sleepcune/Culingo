import { rpc } from '../shared/client';
import type { DictionaryEntry, PublicSettings } from '../shared/types';
export const CARD_STYLE=`
:host{all:initial;color-scheme:light dark;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.55;color:#223c34}
*{box-sizing:border-box}button{font:inherit;cursor:pointer;border:1px solid #d3ded5;border-radius:9px;background:#f3f7ef;color:#245943;padding:7px 10px}button:hover{background:#e6f0e2}button:disabled{opacity:.45;cursor:default}
.card{position:fixed;width:340px;max-width:calc(100vw - 24px);max-height:calc(100vh - 28px);overflow:auto;background:#fffffa;border:1px solid #d9e1d5;border-radius:16px;box-shadow:0 12px 50px #142d302b;padding:18px;z-index:2147483647;overscroll-behavior:contain}.top{display:flex;justify-content:space-between;gap:12px;align-items:center;cursor:move;user-select:none;touch-action:none}.brand{font-size:10px;letter-spacing:2px;color:#537460}.close{padding:0 6px;border:0;background:transparent;font-size:23px;color:#738579}.word{font-family:Georgia,serif;font-size:26px;font-weight:600;overflow-wrap:anywhere;margin:8px 0 4px}.phonetic{font-size:12px;color:#728278}.meaning{white-space:pre-wrap;margin:12px 0;max-height:180px;overflow:auto}.context{font-size:12px;line-height:1.6;color:#788578;background:#f3f5ef;border-radius:9px;padding:10px;white-space:pre-wrap}.actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.primary{background:#245943;color:#fff;border-color:#245943}.translated{margin-top:12px;white-space:pre-wrap;border-top:1px solid #d9e1d5;padding-top:10px}.message{font-size:12px;color:#a45331;margin-top:8px}.selection{position:fixed;padding:6px 12px;background:#245943;color:#fff;border-radius:8px;box-shadow:0 4px 16px #0003;z-index:2147483647}.toolbar{position:fixed;right:18px;bottom:18px;display:flex;gap:8px;align-items:center;background:#fffffa;border:1px solid #d9e1d5;border-radius:12px;padding:9px 12px;box-shadow:0 4px 24px #0002;font-size:12px;z-index:2147483646}
:host([data-theme="dark"]) {color:#e0e9dc}:host([data-theme="dark"]) .card,:host([data-theme="dark"]) .toolbar{background:#1c2924;border-color:#46584b}:host([data-theme="dark"]) button{background:#293e32;color:#dfebd7;border-color:#526850}:host([data-theme="dark"]) .context{background:#28372d;color:#c1cdbd}
@media(prefers-color-scheme:dark){:host([data-theme="system"]) {color:#e0e9dc}:host([data-theme="system"]) .card,:host([data-theme="system"]) .toolbar{background:#1c2924;border-color:#46584b}:host([data-theme="system"]) button{background:#293e32;color:#dfebd7;border-color:#526850}:host([data-theme="system"]) .context{background:#28372d;color:#c1cdbd}}
`;
export interface CardContext { text:string; sentence:string; x:number;y:number; block?:Element; }
export class ReadingCard {
  host:HTMLDivElement;root:ShadowRoot; private panel:HTMLDivElement;private selection:HTMLButtonElement;private generation=0;private requests=new Set<string>();private alive=true;private dragging=false;private dragStart?:{x:number;y:number;left:number;top:number};
  private current?:CardContext;
  constructor(private settings:()=>PublicSettings,private onClose:()=>void,private paragraph:(block:Element)=>Promise<unknown>) {
    this.host=document.createElement('div');this.host.dataset.culingo='ui';this.host.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none';this.host.dataset.theme=settings().theme;
    this.root=this.host.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=CARD_STYLE;this.root.append(style);
    this.panel=document.createElement('div');this.panel.className='card';this.panel.style.pointerEvents='auto';this.panel.hidden=true;this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-label','CuLingo 查词');this.root.append(this.panel);
    this.selection=document.createElement('button');this.selection.className='selection';this.selection.textContent='查词 / 翻译';this.selection.style.pointerEvents='auto';this.selection.hidden=true;this.root.append(this.selection);
    document.documentElement.append(this.host);
    window.addEventListener('resize',this.resizeHandler);
  }
  contains(event:Event) {return event.composedPath().includes(this.host);}
  get visible(){return !this.panel.hidden;}
  get hovering(){return this.host.matches(':hover');}
  theme(){this.host.dataset.theme=this.settings().theme;}
  private el<K extends keyof HTMLElementTagNameMap>(tag:K,className:string,text?:string) {const node=document.createElement(tag);node.className=className;if(text!==undefined)node.textContent=text;return node;}
  private button(label:string,callback:()=>Promise<unknown>|unknown,primary=false) {
    const button=this.el('button',primary?'primary':'',label);
    button.addEventListener('click',()=>{
      button.disabled=true;const generation=this.generation;
      Promise.resolve().then(callback).catch(e=>{if(generation===this.generation)this.message(e instanceof Error?e.message:'操作失败。');}).finally(()=>{if(this.alive)button.disabled=false;});
    });return button;
  }
  message(text:string) {let message=this.panel.querySelector('.message');if(!message){message=this.el('div','message');this.panel.append(message);}message.textContent=text;this.reflow();}
  selectionAt(context:CardContext) {
    this.selection.hidden=false;this.selection.style.left=`${Math.max(12,Math.min(context.x,innerWidth-140))}px`;this.selection.style.top=`${Math.max(12,Math.min(context.y+8,innerHeight-42))}px`;
    this.selection.onclick=()=>{this.selection.hidden=true;void this.show(context);};
  }
  hideSelection(){this.selection.hidden=true;}
  close(){this.generation++;this.panel.hidden=true;this.current=undefined;this.hideSelection();this.cancel();this.onClose();}
  cancel(){const ids=[...this.requests];this.requests.clear();if(ids.length)void rpc('translation.cancel',{requestIds:ids}).catch(()=>{});}
  private async translate(text:string) {const id=crypto.randomUUID();this.requests.add(id);try{return await rpc('translation.translate',{text,requestId:id});}finally{this.requests.delete(id);}}
  async show(context:CardContext) {
    this.cancel();const generation=++this.generation;this.current=context;this.panel.replaceChildren();this.panel.hidden=false;this.theme();
    const top=this.el('div','top');top.append(this.el('span','brand','CULINGO · 遇见一个新词'),this.button('×',()=>this.close()));top.lastElementChild!.className='close';top.lastElementChild!.setAttribute('aria-label','关闭查词');top.addEventListener('pointerdown',this.dragStartHandler);top.addEventListener('pointercancel',this.dragEndHandler);top.addEventListener('lostpointercapture',this.dragEndHandler);this.panel.append(top);
    this.panel.append(this.el('div','word',context.text.length>200?'选中的文字':context.text));
    const meaning=this.el('div','meaning','正在查询本地词典…');this.panel.append(meaning);
    const contextNode=this.el('div','context',context.sentence);if(context.sentence)this.panel.append(contextNode);
    const actions=this.el('div','actions');this.panel.append(actions);
    let entry:DictionaryEntry|null=null;
    const single=/^[a-z]+(?:['’‐‑-][a-z]+)*$/i.test(context.text.trim());
    if(single) {
      try{entry=await rpc('dictionary.lookup',{word:context.text});if(generation!==this.generation)return;meaning.textContent=entry?.translation||entry?.definition||'本地词典未收录这个词，可翻译当前句子或手动收藏。';if(entry?.phonetic||entry?.pos)this.panel.insertBefore(this.el('div','phonetic',[entry?.phonetic&&`/${entry.phonetic}/`,entry?.pos].filter(Boolean).join(' · ')),meaning);this.reflow();}
      catch(e){if(generation!==this.generation)return;meaning.textContent=e instanceof Error?e.message:'查词失败。';this.reflow();}
    } else meaning.textContent='点击翻译，查看短语或句子的中文含义。';
    const definition=entry?.translation??'';let sentenceTranslation:string|undefined;
    const save=this.button('＋ 收藏',async()=>{
      await rpc('vocabulary.save',{word:context.text,meaning:definition,phonetic:entry?.phonetic,example:{text:context.sentence,translation:sentenceTranslation,url:location.href,title:document.title}});if(generation===this.generation)this.message('已保存到生词本，例句一并保留。');
    },true);save.disabled=context.text.length>200;actions.append(save);
    if(context.text.length<=200)actions.append(this.button('已掌握',async()=>{await rpc('vocabulary.setStatus',{word:context.text,status:'mastered'});if(generation===this.generation)this.message('已掌握，此词不再自动高亮。');}));
    actions.append(this.button('发音',()=>{
      if(!('speechSynthesis' in window))throw new Error('此浏览器不支持语音。');const voices=speechSynthesis.getVoices().filter(v=>/^en[-_]/i.test(v.lang));if(!voices.length)throw new Error('系统没有可用英语语音，请安装英语语音包。');
      speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(context.text);utterance.voice=voices[0]!;utterance.lang=voices[0]!.lang;speechSynthesis.speak(utterance);
    }),this.button('复制',()=>navigator.clipboard.writeText(context.text)));
    const translate=this.button(single?'翻译当前句子':'翻译所选文字',async()=>{
      if(!this.settings().apiConfigured)throw new Error('请先在扩展设置中配置翻译服务。');
      let output=this.panel.querySelector('.translated') as HTMLElement|null;if(!output){output=this.el('div','translated');this.panel.append(output);}output.textContent='翻译中…';
      const result=await this.translate(single?context.sentence||context.text:context.text);if(generation===this.generation){output.textContent=result.text;if(single)sentenceTranslation=result.text;this.reflow();}
    });actions.append(translate);
    if(context.block)actions.append(this.button('翻译本段',()=>this.paragraph(context.block!)));
    this.position(context.x,context.y);
  }
  private clamp(left:number,top:number) {const width=this.panel.offsetWidth||340;const height=this.panel.offsetHeight||0;return {left:Math.max(12,Math.min(left,Math.max(12,innerWidth-width-12))),top:Math.max(12,Math.min(top,Math.max(12,innerHeight-height-12)))};}
  private position(x:number,y:number) {const point=this.clamp(x,y+12);this.panel.style.left=`${point.left}px`;this.panel.style.top=`${point.top}px`;}
  private reflow() {const point=this.clamp(parseFloat(this.panel.style.left)||12,parseFloat(this.panel.style.top)||12);this.panel.style.left=`${point.left}px`;this.panel.style.top=`${point.top}px`;}
  private dragStartHandler=(event:PointerEvent)=>{if((event.target as Element).closest('button'))return;event.preventDefault();(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);const rect=this.panel.getBoundingClientRect();this.dragging=true;this.dragStart={x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};window.addEventListener('pointermove',this.dragMoveHandler);window.addEventListener('pointerup',this.dragEndHandler,{once:true});window.addEventListener('pointercancel',this.dragEndHandler,{once:true});};
  private dragMoveHandler=(event:PointerEvent)=>{if(!this.dragging||!this.dragStart)return;event.preventDefault();const point=this.clamp(this.dragStart.left+event.clientX-this.dragStart.x,this.dragStart.top+event.clientY-this.dragStart.y);this.panel.style.left=`${point.left}px`;this.panel.style.top=`${point.top}px`;};
  private dragEndHandler=()=>{this.dragging=false;this.dragStart=undefined;window.removeEventListener('pointermove',this.dragMoveHandler);window.removeEventListener('pointercancel',this.dragEndHandler);};
  private resizeHandler=()=>{if(this.visible)this.reflow();};
  toolbar(text:string,stop:()=>void) {this.root.querySelector('.toolbar')?.remove();const bar=this.el('div','toolbar');bar.style.pointerEvents='auto';bar.append(this.el('span','',text),this.button('恢复原文',stop));this.root.append(bar);}
  clearToolbar(){this.root.querySelector('.toolbar')?.remove();}
  destroy(){this.alive=false;window.removeEventListener('resize',this.resizeHandler);this.dragEndHandler();this.close();this.host.remove();}
}
