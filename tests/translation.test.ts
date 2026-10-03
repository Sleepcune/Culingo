import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { AppDB } from '../src/background/db';
import { TranslationService, validateApi, splitText } from '../src/background/translation';
const api={baseUrl:'https://example.com/v1',apiKey:'secret',model:'test'};
let db:AppDB;
beforeEach(()=>{db=new AppDB('translation-'+crypto.randomUUID());});afterEach(async()=>{await db.delete();});
describe('translation boundary',()=>{
  it('rejects remote HTTP and accepts local model URLs',()=>{expect(()=>validateApi({...api,baseUrl:'http://remote.test/v1'})).toThrow('HTTPS');expect(validateApi({...api,baseUrl:'http://localhost:1234/v1/'}).baseUrl).toBe('http://localhost:1234/v1');});
  it('splits long text without dropping characters',()=>{const text='A sentence. '.repeat(700);const parts=splitText(text);expect(parts.every(x=>x.length<=2000)).toBe(true);expect(parts.join('')).toBe(text);});
  it('deduplicates same requests and isolates model caches',async()=>{
    let calls=0;const request=vi.fn(async()=>{calls++;await new Promise(r=>setTimeout(r,10));return new Response(JSON.stringify({choices:[{message:{content:'译文'}}]}),{status:200});});
    const service=new TranslationService(db,async()=>api,request);
    const results=await Promise.all([service.translate('Hello','one','a'),service.translate('Hello','two','a')]);expect(results[0]?.text).toBe('译文');expect(calls).toBe(1);
    expect((await service.translate('Hello','three','a')).cached).toBe(true);expect(calls).toBe(1);
    const other=new TranslationService(db,async()=>({...api,model:'other'}),request);await other.translate('Hello','four','a');expect(calls).toBe(2);
  });
  it('never retries authentication but retries one server failure',async()=>{
    let calls=0;const auth=new TranslationService(db,async()=>api,async()=>{calls++;return new Response('',{status:401});});await expect(auth.translate('Hello','one','a')).rejects.toThrow('密钥');expect(calls).toBe(1);
    const server=new TranslationService(db,async()=>api,async()=>{calls++;return calls===2?new Response('',{status:503}):new Response(JSON.stringify({choices:[{message:{content:'好'}}]}));});await expect(server.translate('Other','two','a')).resolves.toMatchObject({text:'好'});expect(calls).toBe(3);
  });
  it('allows one consumer to cancel a shared request without cancelling the other',async()=>{
    const service=new TranslationService(db,async()=>api,async()=>{await new Promise(r=>setTimeout(r,30));return new Response(JSON.stringify({choices:[{message:{content:'好'}}]}));});
    const first=service.translate('Hello','one','a');const firstCheck=expect(first).rejects.toThrow('取消');const second=service.translate('Hello','two','b');await new Promise(r=>setTimeout(r,5));service.cancel(['one'],'a');await firstCheck;await expect(second).resolves.toMatchObject({text:'好'});
  });
});
