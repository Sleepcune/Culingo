import { describe,it,expect,vi } from 'vitest';
import { createService } from '../src/services';
import { database,mockIO } from './services-fixture';
import type { PluginService } from '../src/types';
async function configured(request:typeof fetch){const service=createService(await database(),await database(),mockIO(request));await service.initialize();await service.settings.configureApi({baseUrl:'http://localhost:1234/v1',model:'model',apiKey:''});return service;}
const response=(text='译文')=>new Response(JSON.stringify({choices:[{message:{content:text}}]}),{status:200});
describe('translation scheduler',()=>{
  it('deduplicates across readers, caches and keeps configuration isolated',async()=>{
    const request=vi.fn(async()=>response());const service=await configured(request as typeof fetch);
    const [a,b]=await Promise.all([service.translation.translate('Hello.','reader1'),service.translation.translate('Hello.','reader2')]);expect(a.text).toBe(b.text);expect(request).toHaveBeenCalledTimes(1);
    expect((await service.translation.translate('Hello.','reader1')).cached).toBe(true);
    await service.settings.configureApi({baseUrl:'http://localhost:1234/v1',model:'other',apiKey:''});await service.translation.translate('Hello.','reader1');expect(request).toHaveBeenCalledTimes(2);
  });
  it('enforces two active requests and caps each segment at 2000 chars',async()=>{
    let active=0,max=0;const sizes:number[]=[];const request=vi.fn(async(_url:any,init:any)=>{active++;max=Math.max(max,active);sizes.push(JSON.parse(init.body).messages[1].content.length);await new Promise(r=>setTimeout(r,15));active--;return response();});const service=await configured(request as typeof fetch);
    await Promise.all([service.translation.translate('a'.repeat(4500),'a'),service.translation.translate('b','b'),service.translation.translate('c','c')]);expect(max).toBe(2);expect(Math.max(...sizes)).toBeLessThanOrEqual(2000);
  });
  it('cancels one owner while another shared consumer continues',async()=>{
    let release:()=>void=()=>{};const request=vi.fn(async()=>{await new Promise<void>(r=>{release=r;});return response();});const service=await configured(request as typeof fetch);
    const a=service.translation.translate('Hello','a');const b=service.translation.translate('Hello','b');const rejected=expect(a).rejects.toThrow('取消');
    await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(1));service.translation.cancel('a');release();await rejected;expect((await b).text).toBe('译文');
  });
  it('retries rate limits once and stops authentication failures until configuration changes',async()=>{
    const request=vi.fn().mockResolvedValueOnce(new Response('',{status:429})).mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response('',{status:401}));const service=await configured(request as typeof fetch);
    await service.translation.translate('retry','a');expect(request).toHaveBeenCalledTimes(2);
    await expect(service.translation.translate('bad','a')).rejects.toThrow('密钥');await expect(service.translation.translate('other','a')).rejects.toThrow('密钥');expect(request).toHaveBeenCalledTimes(3);
    await service.settings.configureApi({baseUrl:'http://localhost:1234/v1',model:'model',apiKey:'new'});request.mockResolvedValue(response());await service.translation.translate('other','a');expect(request).toHaveBeenCalledTimes(4);
  });
  it('rejects insecure remote endpoints and malformed model responses',async()=>{
    const service=await configured(vi.fn(async()=>new Response('{}',{status:200})) as typeof fetch);
    await expect(service.settings.configureApi({baseUrl:'http://remote.test/v1',model:'model',apiKey:'secret'})).rejects.toThrow('HTTPS');
    await expect(service.translation.translate('Hello','owner')).rejects.toThrow('格式');
  });
  it('times out after 25 seconds and ignores a late response after owner cancellation',async()=>{
    const request=vi.fn(async(_url:any,init:any)=>new Promise<Response>((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
    const service=await configured(request as typeof fetch);vi.useFakeTimers();
    try{const pending=service.translation.translate('timeout','owner');const rejected=expect(pending).rejects.toThrow('超时');await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(1));await vi.advanceTimersByTimeAsync(25000);await rejected;}finally{vi.useRealTimers();}
    let release:(value:Response)=>void=()=>{};const slow=await configured(vi.fn(async()=>new Promise<Response>(resolve=>{release=resolve;})) as typeof fetch);
    const pending=slow.translation.translate('late','owner');const rejected=expect(pending).rejects.toThrow('取消');await vi.waitFor(()=>expect(release.toString()).not.toBe('() => {}'));slow.translation.cancel('owner');release(response('late'));await rejected;
    const exported=await slow.backup.export();expect(exported.vocabulary).toEqual([]);
  });
});
