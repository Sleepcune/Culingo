import { z } from 'zod';
import { createEmptyCard } from 'ts-fsrs';
import type { AppDB } from './db';
import type { VocabularyService } from './vocabulary';
import type { Backup, ImportPreview } from '../shared/types';
import { normalizeWord } from '../core/words';
import { parseCsv } from '../core/csv';
import { isWebOrigin } from '../core/security';
const time = z.number().finite().nonnegative();
const card = z.object({ due: z.coerce.date(), stability: z.number().nonnegative(), difficulty: z.number().nonnegative(), elapsed_days: z.number().nonnegative(), scheduled_days: z.number().nonnegative(), reps: z.number().int().nonnegative(), lapses: z.number().int().nonnegative(), state: z.number().int().min(0).max(3), last_review: z.coerce.date().optional(), learning_steps: z.number().int().nonnegative() });
const vocabulary = z.object({id:z.string().min(1).max(300), language:z.literal('en'), kind:z.enum(['word','phrase']), word:z.string().min(1).max(200), meaning:z.string().max(20000), phonetic:z.string().max(1000), status:z.enum(['learning','mastered']), createdAt:time, updatedAt:time});
// Composite IDs include the permitted vocabulary ID, URL, text and two separators.
const example = z.object({id:z.string().max(300+2000+10000+2), vocabularyId:z.string(),text:z.string().max(10000),translation:z.string().max(20000).optional(),url:z.string().max(2000),title:z.string().max(1000),createdAt:time});
const log = z.object({rating:z.number().int().min(1).max(4),state:z.number().int().min(0).max(3),due:z.coerce.date(),stability:z.number().nonnegative(),difficulty:z.number().nonnegative(),elapsed_days:z.number().nonnegative(),last_elapsed_days:z.number().nonnegative(),scheduled_days:z.number().nonnegative(),review:z.coerce.date(),learning_steps:z.number().int().nonnegative()});
const preferences=z.object({enabled:z.boolean(),level:z.union([z.literal(3000),z.literal(5000),z.literal(8000)]),allSites:z.boolean(),sites:z.record(z.string().refine(isWebOrigin),z.boolean()),theme:z.enum(['system','light','dark'])});
const schema = z.object({version:z.literal(1),exportedAt:time,vocabulary:z.array(vocabulary).max(100000),examples:z.array(example).max(300000),cards:z.array(z.object({vocabularyId:z.string(),card})).max(100000),logs:z.array(z.object({id:z.string(),vocabularyId:z.string(),rating:z.number().int().min(1).max(4),reviewedAt:time,log})).max(1000000),settings:preferences.optional()});
export function validateBackup(input: unknown): Backup {
  const data = schema.parse(input) as Backup;
  const ids = new Set<string>();
  for (const w of data.vocabulary) {
    if (normalizeWord(w.word) !== w.word || w.id !== `en:${w.kind}:${w.word}` || ids.has(w.id)) throw new Error('备份中包含无效或重复词汇标识。');
    ids.add(w.id);
  }
  for (const x of [...data.examples,...data.cards,...data.logs]) if (!ids.has(x.vocabularyId)) throw new Error('备份中存在没有关联词汇的数据。');
  const unique = (items: {id: string}[]) => new Set(items.map(x=>x.id)).size === items.length;
  if (!unique(data.examples) || !unique(data.logs) || new Set(data.cards.map(x=>x.vocabularyId)).size !== data.cards.length) throw new Error('备份中存在重复标识。');
  return data;
}
export class BackupService {
  constructor(private db: AppDB, private words: VocabularyService) {}
  async export(): Promise<Backup> {
    return this.db.transaction('r',this.db.vocabulary,this.db.examples,this.db.cards,this.db.logs,async()=>({version:1,exportedAt:Date.now(),vocabulary:await this.db.vocabulary.toArray(),examples:await this.db.examples.toArray(),cards:await this.db.cards.toArray(),logs:await this.db.logs.toArray()}));
  }
  async preview(text: string, format: 'json' | 'csv'): Promise<ImportPreview> {
    if (text.length > 100 * 1024 * 1024) throw new Error('导入文件超过 100 MB。');
    let backup: Backup; let invalid = 0; let fileDuplicates = 0;
    if (format === 'json') {
      const raw = JSON.parse(text);
      if (raw.version !== 1) throw new Error('备份版本不兼容，请使用对应版本的 CuLingo。');
      backup = validateBackup(raw);
    } else {
      const rows = parseCsv(text); const header = rows.shift()?.map(s=>s.trim().toLowerCase()) ?? [];
      const col = (name:string)=>header.indexOf(name);
      if (col('word') < 0) throw new Error('CSV 必须包含 word 列。');
      backup = {version:1,exportedAt:Date.now(),vocabulary:[],examples:[],cards:[],logs:[]};
      const seen = new Set<string>();
      for (const row of rows) {
        const rawWord = row[col('word')] ?? ''; const word = normalizeWord(rawWord);
        if (!word || word.length > 200) {invalid++;continue;}
        const kind=word.includes(' ')?'phrase':'word'; const id=`en:${kind}:${word}`;
        if (seen.has(id)) {fileDuplicates++;continue;} seen.add(id);
        backup.vocabulary.push({id,word,kind,language:'en',meaning:row[col('meaning')]??'',phonetic:'',status:'learning',createdAt:Date.now(),updatedAt:Date.now()});
        backup.cards.push({vocabularyId:id,card:createEmptyCard()});
        const text=row[col('example')]??'';
        if(text) {const url=row[col('url')]??'';backup.examples.push({id:`${id}:${url}:${text}`,vocabularyId:id,text,url,title:row[col('title')]??'',createdAt:Date.now()});}
      }
      backup = validateBackup(backup);
    }
    const existing = await this.db.vocabulary.bulkGet(backup.vocabulary.map(w=>w.id));
    return {valid:backup.vocabulary.length,duplicates:existing.filter(Boolean).length+fileDuplicates,invalid,backup};
  }
  async import(input: Backup) {
    const backup = validateBackup(input);
    await this.db.transaction('rw',this.db.vocabulary,this.db.examples,this.db.cards,this.db.logs,async()=>{
      for (const w of backup.vocabulary) {const old=await this.db.vocabulary.get(w.id); if(!old||w.updatedAt>old.updatedAt) await this.db.vocabulary.put(w);}
      for (const e of backup.examples) if(!await this.db.examples.get(e.id)) await this.db.examples.put(e);
      for (const c of backup.cards) {const old=await this.db.cards.get(c.vocabularyId);if(!old||(c.card.last_review?.getTime()??0)>(old.card.last_review?.getTime()??0)) await this.db.cards.put(c);}
      for (const l of backup.logs) if(!await this.db.logs.get(l.id)) await this.db.logs.put(l);
      for (const w of backup.vocabulary) if(!await this.db.cards.get(w.id)) await this.db.cards.put({vocabularyId:w.id,card:createEmptyCard()});
    });
  }
}
