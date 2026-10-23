import { describe,it,expect,beforeEach } from 'vitest';
import { createService } from '../src/services';
import type { PluginService } from '../src/types';
import { database,mockIO,hash } from './services-fixture';
import {SettingsService} from '../src/services/settings';
import {Store} from '../src/storage/store';
describe('independent SQLite learning services',()=>{
  let service:PluginService;
  beforeEach(async()=>{service=createService(await database(),await database(),mockIO());await service.initialize();});
  it('imports the verified offline dictionary and normalizes inflections without duplicate examples',async()=>{
    expect(await service.dictionary.lookup('Analyses')).toMatchObject({word:'analysis'});
    const input={word:'Analyses',example:{text:'Several analyses support it.',source:{libraryID:1,attachmentKey:'ABCDEFGH',title:'Paper',pageIndex:2,pageLabel:'3'}}};
    const [a,b]=await Promise.all([service.vocabulary.save(input),service.vocabulary.save(input)]);
    expect(a.id).toBe(b.id);expect((await service.vocabulary.list())[0]?.examples).toHaveLength(1);
    expect((await service.review.getQueue())[0]?.card.due).toBeInstanceOf(Date);
  });
  it('rates transactionally, rejects stale cards, deduplicates operations and pauses mastered words',async()=>{
    const word=await service.vocabulary.save({word:'analysis'});const item=(await service.review.getQueue())[0]!;
    const input={vocabularyId:word.id,rating:3 as const,token:item.token,operationId:'review-1'};
    await service.review.rate(input);await service.review.rate(input);
    expect((await service.backup.export()).logs).toHaveLength(1);
    await expect(service.review.rate({...input,operationId:'review-2'})).rejects.toThrow('其他');
    await service.vocabulary.setStatusById(word.id,'mastered');expect(await service.review.getQueue()).toEqual([]);
    await service.vocabulary.setStatusById(word.id,'learning');expect((await service.backup.export()).cards[0]?.card.reps).toBe(1);
  });
  it('round-trips validated backups and keeps API keys out of public settings and all exports',async()=>{
    await service.settings.configureApi({baseUrl:'https://example.test/v1',model:'test',apiKey:'SECRET'});
    await service.vocabulary.save({word:'analysis',meaning:'分析\n"test"'});
    const backup=await service.backup.export();expect(JSON.stringify(backup)).not.toContain('SECRET');
    expect(JSON.stringify(await service.settings.getPublic())).not.toContain('SECRET');
    const preview=await service.backup.preview(JSON.stringify(backup),'json');expect(preview.duplicates).toBe(1);
    await service.backup.import(preview.backup);expect((await service.vocabulary.list())).toHaveLength(1);
    expect((await service.backup.preview(await service.backup.csv(),'csv')).backup.vocabulary[0]?.meaning).toBe('分析\n"test"');
    await expect(service.backup.preview(JSON.stringify({...backup,version:2}),'json')).rejects.toThrow();
    await expect(service.backup.preview(JSON.stringify({...backup,cards:[{vocabularyId:'missing',card:backup.cards[0]?.card}]}),'json')).rejects.toThrow();
    await expect(service.backup.preview(JSON.stringify({...backup,cards:[{...backup.cards[0],card:{...backup.cards[0]?.card,due:'bad'}}]}),'json')).rejects.toThrow();
  });
  it('keeps the new-word quota at 20 and imports CSV duplicates without replacing progress',async()=>{
    const data=await service.backup.preview('word,meaning\nalpha,first\nalpha,second\n,invalid','csv');expect(data).toMatchObject({valid:1,duplicates:1,invalid:1});
    await service.backup.import(data.backup);
    for(let i=0;i<24;i++)await service.vocabulary.save({word:`term${i}`});
    const queue=await service.review.getQueue();expect(queue).toHaveLength(20);
    for(const item of queue)await service.review.rate({vocabularyId:item.vocabulary.id,token:item.token,rating:4,operationId:item.vocabulary.id});
    expect((await service.review.stats()).newToday).toBe(20);
    expect((await service.review.getQueue()).filter(x=>x.card.state===0)).toHaveLength(0);
  });
  it('preserves the existing key when saving API settings with a blank key',async()=>{
    await service.settings.configureApi({baseUrl:'https://example.test/v1',model:'old',apiKey:'SECRET'});
    await service.settings.configureApi({baseUrl:'https://example.test/v1',model:'new',apiKey:''});
    expect(await service.settings.getPublic()).toMatchObject({model:'new',apiConfigured:true});
    expect(JSON.stringify(await service.backup.export())).not.toContain('SECRET');
  });
  it('requires a new key when changing provider and does not inherit remote secrets at localhost',async()=>{
    const io=mockIO();const local=createService(await database(),await database(),io);await local.initialize();
    await local.settings.configureApi({baseUrl:'https://old-provider.test/v1',model:'old',apiKey:'OLD_SECRET'});
    await expect(local.settings.configureApi({baseUrl:'https://new-provider.test/v1',model:'new',apiKey:''})).rejects.toThrow('密钥');
    expect(await local.settings.getPublic()).toMatchObject({baseUrl:'https://old-provider.test/v1'});
    await local.settings.configureApi({baseUrl:'http://localhost:11434/v1',model:'local',apiKey:''});expect(await io.getSecret()).toBe('');
  });
  it('reads endpoint and key as one snapshot while API configuration is saving',async()=>{
    const io=mockIO();const store=new Store(await database());await store.initialize();const settings=new SettingsService(store,io,()=>{});
    await settings.configureApi({baseUrl:'https://old-provider.test/v1',model:'old',apiKey:'OLD_SECRET'});
    const originalSet=io.setSecret;let entered!:()=>void;let release!:()=>void;const ready=new Promise<void>(r=>entered=r);const barrier=new Promise<void>(r=>release=r);
    io.setSecret=async value=>{await originalSet(value);entered();await barrier;};
    const save=settings.configureApi({baseUrl:'https://new-provider.test/v1',model:'new',apiKey:'NEW_SECRET'});await ready;
    const read=settings.getApi();await new Promise(r=>setTimeout(r,10));release();await save;
    expect(await read).toMatchObject({baseUrl:'https://new-provider.test/v1',apiKey:'NEW_SECRET'});
  });
  it('restores the old secret when the SQLite transaction fails at commit',async()=>{
    const connection=await database();const original=connection.executeTransaction.bind(connection);let fail=false;
    connection.executeTransaction=fn=>original(async()=>{const result=await fn();if(fail){fail=false;throw new Error('COMMIT failed: disk full');}return result;});
    const io=mockIO();const store=new Store(connection);await store.initialize();const settings=new SettingsService(store,io,()=>{});
    await settings.configureApi({baseUrl:'https://old-provider.test/v1',model:'old',apiKey:'OLD_SECRET'});fail=true;
    await expect(settings.configureApi({baseUrl:'https://new-provider.test/v1',model:'new',apiKey:'NEW_SECRET'})).rejects.toThrow('COMMIT');
    expect(await settings.getApi()).toMatchObject({baseUrl:'https://old-provider.test/v1',apiKey:'OLD_SECRET'});
  });
  it('round-trips multiple paper examples in CSV while deduplicating repeated rows',async()=>{
    const source={libraryID:1,attachmentKey:'ABCDEFGH',title:'Paper',pageIndex:0,pageLabel:'1'};
    await service.vocabulary.save({word:'analysis',example:{text:'First analysis, with "quotes".',source}});
    await service.vocabulary.save({word:'analysis',example:{text:'Second analysis.\nNew line.',source:{...source,pageIndex:1,pageLabel:'2'}}});
    const csv=await service.backup.csv();const preview=await service.backup.preview(csv,'csv');
    expect(preview.backup.vocabulary).toHaveLength(1);expect(preview.backup.cards).toHaveLength(1);expect(preview.backup.examples).toHaveLength(2);
    await service.backup.clearLearning();await service.backup.import(preview.backup);
    expect((await service.vocabulary.list())[0].examples.map(e=>e.text)).toEqual(['First analysis, with "quotes".','Second analysis.\nNew line.']);
  });
  it('rolls back the entire save if creating its review card fails',async()=>{
    const learning=await database();const query=learning.queryAsync;let fail=true;
    learning.queryAsync=async(sql,params)=>{if(fail&&sql.startsWith('INSERT OR REPLACE INTO cards')){fail=false;throw new Error('storage full');}return query(sql,params);};
    const local=createService(learning,await database(),mockIO());await local.initialize();
    await expect(local.vocabulary.save({word:'analysis'})).rejects.toThrow('storage full');expect(await local.vocabulary.list()).toEqual([]);
    await local.vocabulary.save({word:'analysis'});expect(await local.vocabulary.list()).toHaveLength(1);
  });
  it('rejects newer SQLite schemas without erasing existing records',async()=>{
    const learning=await database();await learning.queryAsync('CREATE TABLE culingo_schema (version INTEGER NOT NULL)');await learning.queryAsync('INSERT INTO culingo_schema VALUES (2)');await learning.queryAsync('CREATE TABLE sentinel (value TEXT)');await learning.queryAsync("INSERT INTO sentinel VALUES ('keep')");
    const local=createService(learning,await database(),mockIO());await expect(local.initialize()).rejects.toThrow('版本');expect(await learning.queryAsync('SELECT value FROM sentinel')).toEqual([{value:'keep'}]);
  });
  it('resumes verified dictionary chunks after interrupted initialization',async()=>{
    const io=mockIO();const original=io.readAsset;const first=await original('dictionary/chunk-000.json');const second=first.replace(/analysis/g,'synthesis');const index=JSON.stringify({ranks:{analysis:6000,synthesis:9000},forms:{}});let failed=true;
    const manifest=JSON.stringify({version:'resume-fixture',count:2,indexSha256:hash(index),chunks:[{file:'chunk-000.json',count:1,sha256:hash(first)},{file:'chunk-001.json',count:1,sha256:hash(second)}]});
    io.readAsset=async(path)=>{if(path.endsWith('manifest.json'))return manifest;if(path.endsWith('index.json'))return index;if(path.endsWith('chunk-001.json')){if(failed)throw new Error('interrupted');return second;}return first;};
    const cache=await database();const local=createService(await database(),cache,io);await local.initialize();expect(local.dictionary.progress).toMatchObject({state:'error',completed:1});
    expect(await cache.queryAsync('SELECT id FROM dictionary')).toEqual([{id:'analysis'}]);failed=false;await local.dictionary.start(true);expect(local.dictionary.progress).toMatchObject({state:'ready',completed:2});expect(await local.dictionary.lookup('synthesis')).toMatchObject({word:'synthesis'});
  });
  it('persists distinct schedules for all four FSRS ratings',async()=>{
    const now=Date.now();const due:number[]=[];
    for(const [index,word]of ['alpha','bravo','charlie','delta'].entries()){
      const saved=await service.vocabulary.save({word});const item=(await service.review.getQueue(now+1000)).find(card=>card.vocabulary.id===saved.id)!;
      await service.review.rate({vocabularyId:saved.id,rating:(index+1) as 1|2|3|4,token:item.token,operationId:`rating-${index}`},now+1000);
      const backup=await service.backup.export();const card=backup.cards.find(card=>card.vocabularyId===saved.id)!;expect(card.card.reps).toBe(1);expect(backup.logs.find(log=>log.vocabularyId===saved.id)?.rating).toBe(index+1);due.push(card.card.due.getTime());
    }
    expect(due[0]).toBeLessThan(due[1]);expect(due[1]).toBeLessThan(due[2]);expect(due[2]).toBeLessThan(due[3]);
  });
  it('resets the independent new-card quota at the next local midnight',async()=>{
    const now=Date.now()+1000;for(let i=0;i<25;i++)await service.vocabulary.save({word:`dayword${i}`});
    for(const item of await service.review.getQueue(now))await service.review.rate({vocabularyId:item.vocabulary.id,rating:4,token:item.token,operationId:item.vocabulary.id},now);
    expect((await service.review.stats(now)).newToday).toBe(20);expect((await service.review.getQueue(now)).filter(item=>item.card.state===0)).toHaveLength(0);
    const tomorrow=new Date(now);tomorrow.setHours(24,0,0,0);expect((await service.review.stats(tomorrow.getTime())).newToday).toBe(0);expect((await service.review.getQueue(tomorrow.getTime())).filter(item=>item.card.state===0)).toHaveLength(5);
  });
});
