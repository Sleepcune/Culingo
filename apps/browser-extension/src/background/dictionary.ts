import { normalizeWord, lemma } from '../core/words';
import type { DictionaryEntry, DictionaryProgress, MeaningOverride, WordIndex } from '../shared/types';
import type { AppDB } from './db';
interface Manifest { version: string; count: number; chunks: { file: string; count: number; sha256: string }[]; indexSha256: string; }
export class DictionaryService {
  private working?: Promise<void>; private index?: WordIndex;
  progress: DictionaryProgress = {state:'idle',completed:0,total:0};
  constructor(private db: AppDB, private asset: (path:string)=>string, private changed: ()=>void = ()=>{}) {}
  private async assetJson<T>(name:string, hash?:string):Promise<T> {
    const response=await fetch(this.asset(`dictionary/${name}`)); if(!response.ok) throw new Error('词库文件读取失败。');
    const text=await response.text();
    if(hash) {const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));const actual=Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');if(actual!==hash) throw new Error('词库校验失败，请重新安装完整扩展。');}
    return JSON.parse(text) as T;
  }
  async getIndex():Promise<WordIndex> {
    if(this.index)return this.index;
    const manifest=await this.assetJson<Manifest>('manifest.json');
    return this.index=await this.assetJson<WordIndex>('index.json',manifest.indexSha256);
  }
  start(force=false) {
    if(this.progress.state==='ready'||(this.progress.state==='error'&&!force))return Promise.resolve();
    if(this.working)return this.working;
    this.working=this.initialize().catch(()=>{this.progress={...this.progress,state:'error',error:'词库初始化失败，可在设置中重试；用户数据不受影响。'};this.changed();}).finally(()=>{this.working=undefined;});
    return this.working;
  }
  private async initialize() {
    const manifest=await this.assetJson<Manifest>('manifest.json');
    const current=(await this.db.meta.get('dictionary'))?.value as {version:string;next:number}|undefined;
    let next=current?.version===manifest.version?current.next:0;
    this.progress={state:'loading',completed:next,total:manifest.chunks.length,count:manifest.count};this.changed();
    if(current?.version!==manifest.version) await this.db.transaction('rw',this.db.dictionary,this.db.meta,async()=>{await this.db.dictionary.clear();await this.db.meta.put({key:'dictionary',value:{version:manifest.version,next:0}});});
    for(;next<manifest.chunks.length;next++) {
      const chunk=manifest.chunks[next]!;const rows=await this.assetJson<DictionaryEntry[]>(chunk.file,chunk.sha256);
      await this.db.transaction('rw',this.db.dictionary,this.db.meta,async()=>{await this.db.dictionary.bulkPut(rows);await this.db.meta.put({key:'dictionary',value:{version:manifest.version,next:next+1}});});
      this.progress={...this.progress,completed:next+1};this.changed();
    }
    this.progress={...this.progress,state:'ready'};this.changed();
  }
  async lookup(word:string):Promise<DictionaryEntry|null> {
    await this.start();
    if(this.progress.state!=='ready')throw new Error(this.progress.error??'词库尚未准备好。');
    const index=await this.getIndex();const normalized=normalizeWord(word);const base=lemma(normalized,index);
    const entry=await this.db.dictionary.get(base)??await this.db.dictionary.get(normalized)??null;
    const override=await this.db.meaningOverrides.get(base)??await this.db.meaningOverrides.get(normalized);
    if (!entry && !override) return null;
    return {...(entry ?? {word:base,phonetic:'',definition:'',translation:'',pos:'',rank:0}), ...(override ? {aiTranslation: override.meaning} : {})};
  }
  async saveMeaningOverride(word: string, meaning: string, source: MeaningOverride['source'] = 'ai', model?: string) {
    const normalized=normalizeWord(word); const trimmed=meaning.trim();
    if(!normalized||!trimmed) throw new Error('AI 释义不能为空。');
    const record: MeaningOverride={word:normalized,meaning:trimmed,source,updatedAt:Date.now(),...(model?{model}:{})};
    await this.db.meaningOverrides.put(record); return record;
  }
}
