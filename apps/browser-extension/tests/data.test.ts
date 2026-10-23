import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppDB } from '../src/background/db';
import { VocabularyService } from '../src/background/vocabulary';
import { ReviewService } from '../src/background/review';
import { BackupService } from '../src/background/backup';
let db: AppDB; let words: VocabularyService; let review: ReviewService;
beforeEach(() => { db = new AppDB('test-'+crypto.randomUUID()); words = new VocabularyService(db, async()=>null); review = new ReviewService(db); });
afterEach(async()=> {await db.delete();});
describe('persistent learning data',()=> {
  it('deduplicates concurrent saves and keeps distinct examples',async()=>{
    await Promise.all([words.save({word:'Resilient',meaning:'坚韧',example:{text:'A resilient system.',url:'https://example.com',title:'One'}}),words.save({word:'resilient',meaning:'坚韧',example:{text:'A resilient system.',url:'https://example.com',title:'One'}})]);
    await words.save({word:'resilient',example:{text:'Stay resilient.',url:'https://example.com/2',title:'Two'}});
    expect(await db.vocabulary.count()).toBe(1); expect(await db.examples.count()).toBe(2); expect(await db.cards.count()).toBe(1);
  });
  it('pauses mastered cards and restores them when learning',async()=> {
    const word=await words.save({word:'resilient'}); await words.setStatus('resilient','mastered'); expect(await review.queue()).toHaveLength(0);
    await words.setStatus('resilient','learning'); expect((await review.queue())[0]?.vocabulary.id).toBe(word.id);
  });
  it('preserves learned FSRS progress while mastery is paused',async()=>{
    await words.save({word:'resilient'});const item=(await review.queue())[0]!;
    await review.rate({vocabularyId:item.vocabulary.id,rating:3,token:item.token,operationId:'pause-review'});
    const original=await db.cards.get(item.vocabulary.id);
    await words.setStatus('resilient','mastered');await words.setStatus('resilient','learning');
    expect(await db.cards.get(item.vocabulary.id)).toEqual(original);
  });
  it('scores once by operation id and refuses a stale card token',async()=> {
    await words.save({word:'resilient'}); const item=(await review.queue())[0]!;
    const input={vocabularyId:item.vocabulary.id,rating:3 as const,token:item.token,operationId:'op-1'};
    await review.rate(input); await review.rate(input); expect(await db.logs.count()).toBe(1);
    await expect(review.rate({...input,operationId:'op-2'})).rejects.toThrow('其他页面');
  });
  it('round trips backup without API secrets and rejects future versions',async()=>{
    await words.save({word:'resilient',meaning:'坚韧'}); const service=new BackupService(db, words);
    const backup=await service.export(); expect(JSON.stringify(backup)).not.toContain('apiKey');
    const preview=await service.preview(JSON.stringify(backup),'json'); expect(preview.duplicates).toBe(1); await service.import(preview.backup); expect(await db.vocabulary.count()).toBe(1);
    await expect(service.preview(JSON.stringify({...backup,version:2}),'json')).rejects.toThrow('版本');
  });
  it('reads quoted multiline CSV and rejects broken imports atomically',async()=>{
    const service=new BackupService(db,words); const p=await service.preview('word,meaning,example,url,title\r\nresilient,"坚韧,有弹性","Line one\nLine two",https://example.com,测试','csv');
    expect(p.valid).toBe(1); expect(p.backup.examples[0]?.text).toBe('Line one\nLine two'); await service.import(p.backup); expect((await words.list({}))[0]?.meaning).toBe('坚韧,有弹性');
    await expect(service.import({...p.backup,vocabulary:[{...p.backup.vocabulary[0]!,status:'bad' as never}]})).rejects.toThrow(); expect(await db.vocabulary.count()).toBe(1);
  });
  it('counts repeated CSV words as duplicates rather than invalid records',async()=>{
    const service=new BackupService(db,words);
    const preview=await service.preview('word,meaning\nresilient,坚韧\nResilient,有弹性\n,空白','csv');
    expect(preview).toMatchObject({valid:1,duplicates:1,invalid:1});
    expect(preview.backup.vocabulary).toHaveLength(1);
  });
  it('updates imported inflected vocabulary by its identity without creating another word',async()=>{
    const service=new BackupService(db,words);
    const preview=await service.preview('word,meaning\nrunning,跑步','csv');await service.import(preview.backup);
    const imported=preview.backup.vocabulary[0]!;
    await words.setStatusById(imported.id,'mastered');
    expect((await db.vocabulary.get(imported.id))?.status).toBe('mastered');
    expect(await db.vocabulary.count()).toBe(1);
    expect(await review.queue()).toHaveLength(0);
  });
  it('round trips the longest permitted example and source URL',async()=>{
    await words.save({word:'resilient',example:{text:'A'.repeat(10000),url:'https://example.com/'+ 'b'.repeat(1980),title:'Long source'}});
    const service=new BackupService(db,words);const backup=await service.export();
    const restored=await service.preview(JSON.stringify(backup),'json');
    expect(restored.backup.examples[0]?.text).toHaveLength(10000);
  });
  it('persists an AI meaning override and returns it on later dictionary lookup', async()=>{
    const dictionary = new (await import('../src/background/dictionary')).DictionaryService(db, () => '');
    dictionary.start = async()=>{ dictionary.progress = {state:'ready',completed:0,total:0}; };
    dictionary.getIndex = async()=>({ranks:{},forms:{}});
    await dictionary.saveMeaningOverride('Resilient', '坚韧不拔（AI）');
    const entry = await dictionary.lookup('resilient');
    expect(entry?.aiTranslation).toBe('坚韧不拔（AI）');
    expect(await db.meaningOverrides.get('resilient')).toMatchObject({ word: 'resilient', meaning: '坚韧不拔（AI）', source: 'ai' });
    const backupService = new BackupService(db, words);
    const backup = await backupService.export();
    expect(backup.meaningOverrides).toHaveLength(1);
    await db.meaningOverrides.clear();
    await backupService.import(backup);
    expect(await db.meaningOverrides.get('resilient')).toMatchObject({ meaning: '坚韧不拔（AI）' });
  });
});
