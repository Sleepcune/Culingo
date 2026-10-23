import { z } from 'zod';
import { normalizeWord,lemma } from '../core/words';
import type { DictionaryEntry,HostIO,Progress,WordIndex } from '../types';
import type { Store } from '../storage/store';
const manifestSchema=z.object({version:z.string().min(1),count:z.number().int().nonnegative(),indexSha256:z.string().regex(/^[a-f0-9]{64}$/),chunks:z.array(z.object({file:z.string().regex(/^chunk-\d+\.json$/),count:z.number().int().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).max(1000)});
const entrySchema=z.object({word:z.string().min(1),phonetic:z.string(),definition:z.string(),translation:z.string(),pos:z.string(),rank:z.number()});
export class DictionaryService {
  progress:Progress={state:'idle',completed:0,total:0};private working?:Promise<void>;private index?:WordIndex;
  constructor(private db:Store,private io:HostIO,private notify:()=>void){}
  private async json(path:string,hash?:string){const text=await this.io.readAsset(`dictionary/${path}`);if(hash&&await this.io.digest(text)!==hash)throw new Error('词库校验失败，请重新安装完整插件。');return JSON.parse(text);}
  async getIndex(){if(this.index)return this.index;const manifest=manifestSchema.parse(await this.json('manifest.json'));return this.index=z.object({ranks:z.record(z.number()),forms:z.record(z.string())}).parse(await this.json('index.json',manifest.indexSha256));}
  start(force=false):Promise<void>{
    if(this.working)return this.working;if(this.progress.state==='ready'||(this.progress.state==='error'&&!force))return Promise.resolve();
    this.working=this.load().catch(()=>{this.progress={...this.progress,state:'error',error:'词库初始化失败，可在设置中重试；学习数据已保留。'};this.notify();}).finally(()=>{this.working=undefined;});return this.working;
  }
  private async load(){
    const manifest=manifestSchema.parse(await this.json('manifest.json'));await this.getIndex();
    const saved=await this.db.get<{version:string;next:number}>('meta','dictionary');let next=saved?.version===manifest.version?saved.next:0;
    if(!Number.isInteger(next)||next<0||next>manifest.chunks.length)throw new Error('词库进度损坏。');
    if(saved?.version!==manifest.version)await this.db.transaction(async()=>{await this.db.clear('dictionary');await this.db.put('meta','dictionary',{version:manifest.version,next:0});});
    this.progress={state:'loading',completed:next,total:manifest.chunks.length,count:manifest.count};this.notify();
    for(;next<manifest.chunks.length;next++){
      const chunk=manifest.chunks[next]!;const rows=z.array(entrySchema).parse(await this.json(chunk.file,chunk.sha256));if(rows.length!==chunk.count)throw new Error('词库分块不完整。');
      await this.db.transaction(async()=>{await this.db.putMany('dictionary',rows.map(value=>({id:value.word,value})));await this.db.put('meta','dictionary',{version:manifest.version,next:next+1});});
      this.progress={...this.progress,completed:next+1};this.notify();
    }
    this.progress={...this.progress,state:'ready'};this.notify();
  }
  async lookup(text:string):Promise<DictionaryEntry|null>{await this.start();if(this.progress.state!=='ready')throw new Error(this.progress.error??'词库尚未准备好。');const original=normalizeWord(text);const base=lemma(original,await this.getIndex());return await this.db.get<DictionaryEntry>('dictionary',base)??await this.db.get<DictionaryEntry>('dictionary',original)??null;}
}
