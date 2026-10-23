import type { ApiConfig,HostIO,Preferences,PublicSettings } from '../types';
import type { Store } from '../storage/store';
import { preferences } from './validation';
export function validateApi(input:ApiConfig):ApiConfig {
  let url:URL;try{url=new URL(input.baseUrl);}catch{throw new Error('请填写有效的 API 根地址。');}
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw new Error('远程 API 必须使用 HTTPS，本地回环地址可使用 HTTP。');
  if(url.username||url.password||url.search||url.hash||url.pathname.endsWith('/chat/completions'))throw new Error('请填写不含密钥和 /chat/completions 的 API 根地址。');
  if(!input.model.trim()||input.model.length>500)throw new Error('请填写有效的模型名称。');
  if(!local&&!input.apiKey.trim())throw new Error('请填写 API 密钥。');
  return {baseUrl:url.href.replace(/\/+$/,''),model:input.model.trim(),apiKey:input.apiKey.trim()};
}
export class SettingsService {
  private tail=Promise.resolve();
  private locked<T>(fn:()=>Promise<T>):Promise<T>{const result=this.tail.then(fn);this.tail=result.then(()=>{},()=>{});return result;}
  constructor(private db:Store,private io:HostIO,private notify:()=>void){}
  async getPreferences():Promise<Preferences>{return preferences.parse(await this.db.get('meta','preferences')??{enabled:true,level:5000,theme:'system'});}
  async getApi():Promise<ApiConfig>{return this.locked(()=>this.db.transaction(async()=>{const value=await this.db.get<{baseUrl:string;model:string}>('meta','api');return validateApi({baseUrl:value?.baseUrl??'',model:value?.model??'',apiKey:await this.io.getSecret()});}));}
  async getPublic():Promise<PublicSettings>{const value=await this.db.get<{baseUrl:string;model:string}>('meta','api');let configured=false;try{await this.getApi();configured=true;}catch{}return {...await this.getPreferences(),baseUrl:value?.baseUrl??'',model:value?.model??'',apiConfigured:configured};}
  async update(input:Partial<Preferences>){await this.db.transaction(async()=>{const value=preferences.parse({...await this.getPreferences(),...input});await this.db.put('meta','preferences',value);});this.notify();}
  async configureApi(input:ApiConfig){
    await this.locked(async()=>{const old=await this.io.getSecret();let changed=false;try{await this.db.transaction(async()=>{const previous=await this.db.get<{baseUrl:string;model:string}>('meta','api');let normalized='';try{normalized=new URL(input.baseUrl).href.replace(/\/+$/,'');}catch{}
      const preserved=normalized===previous?.baseUrl?old:'';const value=validateApi({...input,apiKey:input.apiKey.trim()||preserved});changed=true;await this.io.setSecret(value.apiKey);await this.db.put('meta','api',{baseUrl:value.baseUrl,model:value.model});});}catch(error){if(changed)await this.io.setSecret(old);throw error;}});this.notify();
  }
}
