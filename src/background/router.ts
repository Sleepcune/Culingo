import { browser } from 'wxt/browser';
import { z } from 'zod';
import { AppDB } from './db';
import { DictionaryService } from './dictionary';
import { VocabularyService } from './vocabulary';
import { ReviewService } from './review';
import { BackupService } from './backup';
import { TranslationService, validateApi } from './translation';
import { apiSchema, getSettings, publicSettings, updateSettings } from './settings';
import { shouldHighlight } from '../core/words';
import { isTrustedContext,isWebOrigin } from '../core/security';
import type { Request, Response } from '../shared/messages';
import type { Backup, WordStatus } from '../shared/types';
const db=new AppDB();
export const dictionary=new DictionaryService(db,path=>new URL(path,browser.runtime.getURL('')).href,()=>{void broadcast('dictionary-progress');});
export const words=new VocabularyService(db,word=>dictionary.lookup(word));
export const reviews=new ReviewService(db);const backups=new BackupService(db,words);
export const translations=new TranslationService(db,async()=>{
  const api=validateApi((await getSettings()).api);await checkApiPermission(api.baseUrl);return api;
});
const safeText=z.string().min(1).max(200);const status=z.enum(['learning','mastered']);
const saveSchema=z.object({word:safeText,meaning:z.string().max(20000).optional(),phonetic:z.string().max(1000).optional(),kind:z.enum(['word','phrase']).optional(),example:z.object({text:z.string().max(10000),translation:z.string().max(20000).optional(),url:z.string().max(2000),title:z.string().max(1000)}).optional()}).strict();
const contentMethods=new Set(['reading.state','dictionary.lookup','dictionary.progress','dictionary.classify','vocabulary.save','vocabulary.setStatus','translation.translate','translation.cancel','settings.public']);
type Sender=Parameters<Parameters<typeof browser.runtime.onMessage.addListener>[0]>[1];
export async function checkApiPermission(baseUrl:string) {
  const origin=new URL(baseUrl).origin;
  if(!await browser.permissions.contains({origins:[`${origin}/*`]}))throw new Error('请在设置中授权翻译服务地址后重试。');
}
export async function broadcast(type='changed') {
  const event={channel:'culingo-event',type};
  try{await browser.runtime.sendMessage(event);}catch{}
  const tabs=await browser.tabs.query({});
  await Promise.all(tabs.filter(t=>t.id!==undefined).map(async tab=>{try{await browser.tabs.sendMessage(tab.id!,event);}catch{}}));
}
let registrationQueue=Promise.resolve();
export function syncContentScripts() {
  const work=registrationQueue.then(registerContentScripts);registrationQueue=work.catch(()=>{});return work;
}
async function registerContentScripts() {
  const settings=await getSettings();const granted=(await browser.permissions.getAll()).origins??[];
  const patterns=settings.enabled?(settings.allSites?['https://*/*','http://*/*']:Object.keys(settings.sites).filter(origin=>settings.sites[origin]).map(origin=>`${origin}/*`)):[];
  const allowed:string[]=[];
  for(const pattern of patterns)if(await browser.permissions.contains({origins:[pattern]}))allowed.push(pattern);
  const registered=await browser.scripting.getRegisteredContentScripts({ids:['culingo-reading']});
  if(registered.length)await browser.scripting.unregisterContentScripts({ids:['culingo-reading']});
  if(allowed.length){
    await browser.scripting.registerContentScripts([{id:'culingo-reading',matches:allowed,js:['/content-scripts/reading.js'],runAt:'document_idle',allFrames:false,persistAcrossSessions:true}]);
    const tabs=await browser.tabs.query({url:allowed});
    await Promise.all(tabs.filter(t=>t.id!==undefined).map(async tab=>{try{await browser.scripting.executeScript({target:{tabId:tab.id!},files:['/content-scripts/reading.js']});}catch{}}));
  }
  void granted;await broadcast();
}
export async function route(raw:unknown,sender:Sender):Promise<Response<unknown>> {
  try {
    const envelope=z.object({channel:z.literal('culingo'),method:z.string(),input:z.unknown().optional()}).strict().parse(raw);
    // Extension management pages opened in tabs also have sender.tab.
    const trusted=isTrustedContext(sender.url,sender.id,browser.runtime.id,browser.runtime.getURL(''));
    if(!trusted&&!contentMethods.has(envelope.method))throw new Error('此操作只能在扩展管理页面执行。');
    if(sender.id!==browser.runtime.id)throw new Error('消息来源无效。');
    const request=envelope as Request;const owner=sender.tab?`tab-${sender.tab.id}-${sender.frameId??0}`:`extension-${sender.documentId??sender.url}`;
    let data:unknown;let changed=false;
    switch(request.method) {
      case 'reading.state':{
        const settings=await publicSettings();const index=await dictionary.getIndex();void dictionary.start();
        const origin=sender.url?new URL(sender.url).origin:'';
        const siteAuthorized=isWebOrigin(origin)&&await browser.permissions.contains({origins:[`${origin}/*`]});
        const statuses=Object.fromEntries((await db.vocabulary.toArray()).filter(w=>w.kind==='word').map(w=>[w.word,w.status]));data={siteAuthorized,settings,index,statuses,progress:dictionary.progress};break;
      }
      case 'dictionary.lookup':data=await dictionary.lookup(z.object({word:safeText}).parse(request.input).word);break;
      case 'dictionary.progress':void dictionary.start();data=dictionary.progress;break;
      case 'dictionary.retry':await dictionary.start(true);data=dictionary.progress;break;
      case 'dictionary.classify':{
        const {words:list}=z.object({words:z.array(safeText).max(5000)}).parse(request.input);const index=await dictionary.getIndex();const settings=await publicSettings();
        const statuses=Object.fromEntries((await db.vocabulary.toArray()).map(w=>[w.word,w.status])) as Record<string,WordStatus>;
        data=Object.fromEntries(list.map(w=>[w,shouldHighlight(w,index,statuses,settings.level)]));break;
      }
      case 'vocabulary.save':data=await words.save(saveSchema.parse(request.input));changed=true;break;
      case 'vocabulary.setStatus':{const input=z.object({word:safeText,status}).parse(request.input);data=await words.setStatus(input.word,input.status);changed=true;break;}
      case 'vocabulary.setStatusById':{const input=z.object({id:z.string().min(1).max(300),status}).strict().parse(request.input);data=await words.setStatusById(input.id,input.status);changed=true;break;}
      case 'vocabulary.edit':{const input=z.object({id:z.string().max(300),meaning:z.string().max(20000)}).parse(request.input);data=await words.edit(input.id,input.meaning);changed=true;break;}
      case 'vocabulary.remove':await words.remove(z.object({ids:z.array(z.string().max(300)).max(100000)}).parse(request.input).ids);changed=true;break;
      case 'vocabulary.list':data=await words.list(z.object({search:z.string().max(200).optional(),status:status.optional()}).parse(request.input));break;
      case 'translation.translate':{const input=z.object({text:z.string().min(1).max(50000),requestId:z.string().min(1).max(100)}).strict().parse(request.input);data=await translations.translate(input.text,input.requestId,owner);break;}
      case 'translation.cancel':translations.cancel(z.object({requestIds:z.array(z.string().max(100)).max(10000)}).parse(request.input).requestIds,owner);break;
      case 'translation.test':{const api=validateApi(apiSchema.parse(z.object({api:apiSchema}).parse(request.input).api));await checkApiPermission(api.baseUrl);data=await translations.test(api);break;}
      case 'review.getQueue':data=await reviews.queue();break;
      case 'review.rate':data=await reviews.rate(z.object({vocabularyId:z.string().max(300),rating:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]),token:z.number().finite().nonnegative(),operationId:z.string().min(1).max(100)}).parse(request.input));changed=true;break;
      case 'stats.get':data=await reviews.stats();break;
      case 'settings.get':data=await getSettings();break;
      case 'settings.public':data=await publicSettings();break;
      case 'settings.update':data=await updateSettings(request.input);await syncContentScripts();changed=true;break;
      case 'backup.export':{const {api,...settings}=await getSettings();data={...await backups.export(),settings};break;}
      case 'backup.preview':{const input=z.object({text:z.string(),format:z.enum(['json','csv'])}).parse(request.input);data=await backups.preview(input.text,input.format);break;}
      case 'backup.import':{const input=z.object({backup:z.unknown()}).parse(request.input).backup as Backup;await backups.import(input);if(input.settings){const clean=await backups.preview(JSON.stringify(input),'json');if(clean.backup.settings)await updateSettings(clean.backup.settings);await syncContentScripts();}data=await reviews.stats();changed=true;break;}
      case 'diagnostics.get':data=(await db.diagnostics.orderBy('at').reverse().toArray()).map(({at,code,duration})=>({at,code,duration}));break;
      default:throw new Error('不支持的操作。');
    }
    if(changed)await broadcast();return {ok:true,data};
  } catch(error) {
    const code=error instanceof z.ZodError?'INVALID_INPUT':'OPERATION_FAILED';
    void db.diagnose(code).catch(()=>{});
    let message=error instanceof z.ZodError?'输入数据格式无效，请检查后重试。':error instanceof Error?error.message:'操作失败，请重试。';
    if((error as Error)?.name==='QuotaExceededError')message='本地存储空间不足，请先导出备份并释放空间。';
    return {ok:false,code,error:message};
  }
}
