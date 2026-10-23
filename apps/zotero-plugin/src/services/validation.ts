import { z } from 'zod';
import { normalizeWord } from '../core/words';
import type { Backup,CardRecord,LogRecord } from '../types';
const time=z.number().finite().nonnegative();
const date=z.union([z.date(),z.string().datetime(),time]).transform(value=>new Date(value)).refine(value=>Number.isFinite(value.getTime()),'无效日期');
export const preferences=z.object({enabled:z.boolean(),level:z.union([z.literal(3000),z.literal(5000),z.literal(8000)]),theme:z.enum(['system','light','dark'])}).strict();
export const sourceSchema=z.object({libraryID:z.number().int().nonnegative(),attachmentKey:z.string().regex(/^[A-Z0-9]{8}$/),parentKey:z.string().regex(/^[A-Z0-9]{8}$/).optional(),title:z.string().max(2000),doi:z.string().max(2000).optional(),pageIndex:z.number().int().nonnegative(),pageLabel:z.string().max(100),rects:z.array(z.tuple([z.number().finite(),z.number().finite(),z.number().finite(),z.number().finite()])).max(1000).optional()}).strict();
const cardSchema=z.object({due:date,stability:z.number().finite().nonnegative(),difficulty:z.number().finite().nonnegative(),elapsed_days:z.number().finite().nonnegative(),scheduled_days:z.number().finite().nonnegative(),reps:z.number().int().nonnegative(),lapses:z.number().int().nonnegative(),state:z.number().int().min(0).max(3),last_review:date.optional(),learning_steps:z.number().int().nonnegative()}).strict();
const logSchema=z.object({rating:z.number().int().min(1).max(4),state:z.number().int().min(0).max(3),due:date,stability:z.number().finite().nonnegative(),difficulty:z.number().finite().nonnegative(),elapsed_days:z.number().finite().nonnegative(),last_elapsed_days:z.number().finite().nonnegative(),scheduled_days:z.number().finite().nonnegative(),review:date,learning_steps:z.number().int().nonnegative()}).strict();
export const wordSchema=z.object({id:z.string().min(1).max(300),language:z.literal('en'),kind:z.enum(['word','phrase']),word:z.string().min(1).max(200),meaning:z.string().max(20000),phonetic:z.string().max(1000),status:z.enum(['learning','mastered']),createdAt:time,updatedAt:time}).strict();
export const exampleSchema=z.object({id:z.string().min(1).max(300),vocabularyId:z.string().min(1).max(300),text:z.string().min(1).max(10000),translation:z.string().max(20000).optional(),source:sourceSchema.optional(),createdAt:time}).strict();
const cardRecord=z.object({vocabularyId:z.string(),card:cardSchema}).strict();
const logRecord=z.object({id:z.string().min(1).max(300),vocabularyId:z.string(),rating:z.number().int().min(1).max(4),reviewedAt:time,log:logSchema}).strict();
export function reviveCard(value:unknown):CardRecord{return cardRecord.parse(value) as CardRecord;}
export function reviveLog(value:unknown):LogRecord{return logRecord.parse(value) as LogRecord;}
const schema=z.object({format:z.literal('culingo-zotero'),version:z.literal(1),exportedAt:time,vocabulary:z.array(wordSchema).max(100000),examples:z.array(exampleSchema).max(300000),cards:z.array(cardRecord).max(100000),logs:z.array(logRecord).max(1000000),settings:preferences.optional()}).strict();
export function validateBackup(input:unknown):Backup {
  const backup=schema.parse(input) as Backup;const words=new Set<string>();
  for(const word of backup.vocabulary){if(normalizeWord(word.word)!==word.word||word.id!==`en:${word.kind}:${word.word}`||words.has(word.id))throw new Error('备份词汇标识无效或重复。');words.add(word.id);}
  for(const record of [...backup.examples,...backup.cards,...backup.logs])if(!words.has(record.vocabularyId))throw new Error('备份包含没有关联词汇的数据。');
  if(new Set(backup.examples.map(x=>x.id)).size!==backup.examples.length||new Set(backup.logs.map(x=>x.id)).size!==backup.logs.length||new Set(backup.cards.map(x=>x.vocabularyId)).size!==backup.cards.length)throw new Error('备份包含重复记录。');
  for(const item of backup.logs)if(item.rating!==item.log.rating||item.reviewedAt!==item.log.review.getTime())throw new Error('备份复习日志不一致。');
  return backup;
}
