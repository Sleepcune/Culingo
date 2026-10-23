import { createEmptyCard } from 'ts-fsrs';
import { normalizeWord } from '../core/words';
import type { HostIO,Vocabulary,VocabularyDetail,SaveWord,Example,WordStatus } from '../types';
import type { Store } from '../storage/store';
import type { DictionaryService } from './dictionary';
import { exampleSchema,reviveCard,wordSchema } from './validation';
export class VocabularyService {
  constructor(private db:Store,private dictionary:DictionaryService,private io:HostIO,private notify:()=>void){}
  async save(input:SaveWord):Promise<Vocabulary>{
    const original=normalizeWord(input.word);if(!original||original.length>200)throw new Error('词汇需为 1–200 个字符。');
    const kind=input.kind??(original.includes(' ')?'phrase':'word');const entry=kind==='word'?await this.dictionary.lookup(original):null;const word=entry?.word??original;const id=`en:${kind}:${word}`;const now=Date.now();
    let example:Example|undefined;
    if(input.example?.text.trim()){
      const source=input.example.source;const identity=JSON.stringify([id,source?.libraryID,source?.attachmentKey,source?.pageIndex,input.example.text.trim()]);
      example=exampleSchema.parse({...input.example,text:input.example.text.trim(),id:await this.io.digest(identity),vocabularyId:id,createdAt:now});
    }
    const result=await this.db.transaction(async()=>{
      let value=await this.db.get<Vocabulary>('vocabulary',id);
      if(!value){value=wordSchema.parse({id,word,kind,language:'en',meaning:input.meaning??entry?.translation??'',phonetic:input.phonetic??entry?.phonetic??'',status:'learning',createdAt:now,updatedAt:now});await this.db.put('vocabulary',id,value);await this.db.put('cards',id,{vocabularyId:id,card:createEmptyCard(new Date(now))});}
      if(example){const old=await this.db.get<Example>('examples',example.id);if(!old)await this.db.put('examples',example.id,example);else if(example.translation&&!old.translation)await this.db.put('examples',old.id,{...old,translation:example.translation});}
      return value;
    });this.notify();return result;
  }
  async setStatusById(id:string,status:WordStatus){if(!['learning','mastered'].includes(status))throw new Error('无效学习状态。');await this.db.transaction(async()=>{const word=await this.require(id);await this.db.put('vocabulary',id,{...word,status,updatedAt:Date.now()});if(!await this.db.get('cards',id))await this.db.put('cards',id,{vocabularyId:id,card:createEmptyCard()});});this.notify();}
  async require(id:string){const word=await this.db.get<Vocabulary>('vocabulary',id);if(!word)throw new Error('该词汇已被删除。');return word;}
  async edit(id:string,meaning:string){if(meaning.length>20000)throw new Error('释义过长。');await this.db.transaction(async()=>{const word=await this.require(id);await this.db.put('vocabulary',id,{...word,meaning,updatedAt:Date.now()});});this.notify();}
  async editExample(id:string,text:string,translation?:string){await this.db.transaction(async()=>{const old=await this.db.get<Example>('examples',id);if(!old)throw new Error('例句已被删除。');await this.db.put('examples',id,exampleSchema.parse({...old,text,translation}));});this.notify();}
  async list(query='',status?:WordStatus):Promise<VocabularyDetail[]>{const search=query.trim().toLowerCase();const examples=await this.db.all<Example>('examples');const cards=new Map((await this.db.all('cards')).map(value=>{const record=reviveCard(value);return[record.vocabularyId,record.card] as const;}));return(await this.db.all<Vocabulary>('vocabulary')).filter(word=>(!status||word.status===status)&&(!search||word.word.includes(search)||word.meaning.toLowerCase().includes(search))).sort((a,b)=>b.updatedAt-a.updatedAt).map(word=>({...word,examples:examples.filter(x=>x.vocabularyId===word.id),due:cards.get(word.id)?.due.getTime()}));}
  async statuses(){const result:Record<string,WordStatus>=Object.create(null);for(const word of await this.db.all<Vocabulary>('vocabulary'))result[word.word]=word.status;return result;}
  async remove(ids:string[]){await this.db.transaction(async()=>{const removed=new Set(ids);for(const id of removed){await this.db.remove('vocabulary',id);await this.db.remove('cards',id);}for(const table of ['examples','logs'] as const)for(const row of await this.db.all<{id:string;vocabularyId:string}>(table))if(removed.has(row.vocabularyId))await this.db.remove(table,row.id);});this.notify();}
}
