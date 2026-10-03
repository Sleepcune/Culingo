import type { Card, ReviewLog as FSRSLog } from 'ts-fsrs';
export type WordStatus = 'learning' | 'mastered';
export interface DictionaryEntry { word:string; phonetic:string; definition:string; translation:string; pos:string; rank:number }
export interface WordIndex { ranks:Record<string,number>; forms:Record<string,string> }
export type Rect = [number,number,number,number];
export interface Source { libraryID:number; attachmentKey:string; parentKey?:string; title:string; doi?:string; pageIndex:number; pageLabel:string; rects?:Rect[] }
export interface Example { id:string; vocabularyId:string; text:string; translation?:string; source?:Source; createdAt:number }
export interface Vocabulary { id:string; language:'en'; kind:'word'|'phrase'; word:string; meaning:string; phonetic:string; status:WordStatus; createdAt:number; updatedAt:number }
export interface VocabularyDetail extends Vocabulary { examples:Example[]; due?:number }
export interface CardRecord { vocabularyId:string; card:Card }
export interface LogRecord { id:string; vocabularyId:string; rating:number; reviewedAt:number; log:FSRSLog }
export interface Preferences { enabled:boolean; level:3000|5000|8000; theme:'system'|'light'|'dark' }
export interface ApiConfig { baseUrl:string; model:string; apiKey:string }
export interface PublicSettings extends Preferences { baseUrl:string; model:string; apiConfigured:boolean }
export interface SaveWord { word:string; kind?:'word'|'phrase'; meaning?:string; phonetic?:string; example?:{text:string;translation?:string;source?:Source} }
export interface ReviewItem { vocabulary:Vocabulary; examples:Example[]; card:Card; token:number }
export interface Stats { learning:number; mastered:number; due:number; reviewedToday:number; newToday:number }
export interface Progress { state:'idle'|'loading'|'ready'|'error'; completed:number; total:number; error?:string; count?:number }
export interface Backup { format:'culingo-zotero'; version:1; exportedAt:number; vocabulary:Vocabulary[]; examples:Example[]; cards:CardRecord[]; logs:LogRecord[]; settings?:Preferences }
export interface ImportPreview { valid:number;duplicates:number;invalid:number;backup:Backup }
export interface TranslationResult { text:string;cached:boolean }
export interface CacheEntry { key:string;text:string;bytes:number;accessedAt:number }
export interface SqlConnection { queryAsync(sql:string,params?:unknown[]):Promise<any[]>; executeTransaction<T>(fn:()=>Promise<T>):Promise<T>; closeDatabase():Promise<void> }
export interface HostIO { readAsset(path:string):Promise<string>; digest(text:string):Promise<string>; getSecret():Promise<string>; setSecret(value:string):Promise<void>; fetch:typeof fetch }
export interface PluginService {
  initialize():Promise<void>; close():Promise<void>; subscribe(fn:()=>void):()=>void;
  dictionary:{ progress:Progress;start(force?:boolean):Promise<void>;getIndex():Promise<WordIndex>;lookup(word:string):Promise<DictionaryEntry|null> };
  vocabulary:{save(input:SaveWord):Promise<Vocabulary>;setStatusById(id:string,status:WordStatus):Promise<void>;edit(id:string,meaning:string):Promise<void>;remove(ids:string[]):Promise<void>;list(query?:string,status?:WordStatus):Promise<VocabularyDetail[]>;statuses():Promise<Record<string,WordStatus>>;editExample(id:string,text:string,translation?:string):Promise<void>};
  review:{stats(now?:number):Promise<Stats>;getQueue(now?:number):Promise<ReviewItem[]>;rate(input:{vocabularyId:string;rating:1|2|3|4;token:number;operationId:string},now?:number):Promise<Stats>};
  settings:{getPublic():Promise<PublicSettings>;update(input:Partial<Preferences>):Promise<void>;configureApi(input:ApiConfig):Promise<void>};
  translation:{translate(text:string,owner:string):Promise<TranslationResult>;cancel(owner:string):void;test():Promise<TranslationResult>;clearCache():Promise<void>};
  backup:{export():Promise<Backup>;preview(text:string,format:'json'|'csv'):Promise<ImportPreview>;import(backup:Backup):Promise<void>;csv():Promise<string>;tsv():Promise<string>;clearLearning():Promise<void>};
}
