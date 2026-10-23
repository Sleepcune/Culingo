import type {Source,WordIndex} from '../types';
import {pageText,wordsFromPage,type PageText,type PDFWord} from './geometry';
export interface ReaderPage {index:number;label:string;text:PageText;words:PDFWord[];element:HTMLElement;viewport:any}
export class ReaderAdapter10 {
 private view:any;private app:any;private cache=new Map<number,ReaderPage>();private pending=new Map<number,Promise<ReaderPage>>();private listeners=new Set<()=>void>();private cleanups:(()=>void)[]=[];private closed=false;
 constructor(readonly reader:any,readonly index:WordIndex){}
 async start():Promise<void>{
  await this.reader._initPromise;
  if(this.reader.type!=='pdf')throw new Error('CuLingo 首版支持 PDF 原版式阅读。');
  const raw=this.reader._internalReader??this.reader._iframeWindow?.wrappedJSObject?.reader;
  this.view=raw?._primaryView;await this.view?.initializedPromise;
  const win=this.view?._iframeWindow;this.app=win?.PDFViewerApplication??win?.wrappedJSObject?.PDFViewerApplication;
  if(!this.app?.pdfDocument?.getPageData||!this.app?.pdfViewer?.getPageView)throw new Error('阅读器接口不可用，自动高亮已暂停；仍可划词查询。');
  const update=()=>{if(!this.closed)this.listeners.forEach(fn=>fn());};
  for(const name of ['pagechanging','pagerendered','scalechanging','rotationchanging','textlayerrendered']){this.app.eventBus.on(name,update);this.cleanups.push(()=>this.app.eventBus.off(name,update));}
  const container=this.document.getElementById('viewerContainer');container?.addEventListener('scroll',update,{passive:true});this.cleanups.push(()=>container?.removeEventListener('scroll',update));
  this.document.defaultView?.addEventListener('unload',()=>this.dispose(),{once:true});
 }
 get document():Document {return this.view._iframeWindow.document;}
 get currentPage():number{return Math.max(0,(this.app?.pdfViewer.currentPageNumber??1)-1);}
 get pageCount():number{return this.app?.pdfDocument.numPages??0;}
 get cachedCount():number{return this.cache.size;}
 subscribe(fn:()=>void):()=>void{this.listeners.add(fn);return ()=>this.listeners.delete(fn);}
 visiblePages():number[]{const views=this.app?.pdfViewer._getVisiblePages?.().views;const current=views?.map((v:any)=>v.id-1)??[this.currentPage];return [...new Set<number>(current)].filter(i=>i>=0&&i<this.pageCount);}
 async loadPage(index:number):Promise<ReaderPage>{
  if(this.closed)throw new Error('阅读器已关闭。');if(index<0||index>=this.pageCount)throw new Error('页码超出范围。');
  const old=this.cache.get(index);const view=this.app.pdfViewer.getPageView(index);if(old){this.cache.delete(index);this.cache.set(index,old);old.viewport=view.viewport;old.element=view.div;return old;}
  if(this.pending.has(index))return this.pending.get(index)!;
  const task=(async()=>{const data=this.view._pdfPages?.[index]??await this.app.pdfDocument.getPageData({pageIndex:index});if(this.closed)throw new Error('阅读器已关闭。');
   const text=pageText(data.chars??[]);const page:ReaderPage={index,label:String(this.app.pdfViewer._pageLabels?.[index]??index+1),text,words:wordsFromPage(text,this.index),element:view.div,viewport:view.viewport};
   this.cache.set(index,page);while(this.cache.size>8)this.cache.delete(this.cache.keys().next().value!);return page;
  })();this.pending.set(index,task);try{return await task;}finally{this.pending.delete(index);}
 }
 async source(pageIndex:number):Promise<Source>{const attachment=await Zotero.Items.getAsync(this.reader.itemID);if(!attachment)throw new Error('来源附件已不存在。');const parent=attachment.parentItemID?await Zotero.Items.getAsync(attachment.parentItemID):undefined;
  return {libraryID:attachment.libraryID,attachmentKey:attachment.key,parentKey:parent?.key,title:parent?.getField('title')||attachment.getField('title')||'PDF',doi:parent?.getField('DOI')||undefined,pageIndex,pageLabel:String(this.app?.pdfViewer._pageLabels?.[pageIndex]??pageIndex+1)};
 }
 async navigate(pageIndex:number):Promise<void>{await this.reader.navigate({pageIndex});}
 dispose():void{if(this.closed)return;this.closed=true;this.cleanups.splice(0).forEach(fn=>fn());this.listeners.clear();this.cache.clear();this.pending.clear();}
}
