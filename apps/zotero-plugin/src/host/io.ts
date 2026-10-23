import type {HostIO,Source} from '../types';
const ORIGIN='chrome://culingo-zotero';const REALM='CuLingo Translation API';
export function makeHostIO(rootURI:string):HostIO {
 return {
  readAsset:path=>Zotero.File.getResourceAsync(rootURI+path),
  digest:async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join(''),
  getSecret:async()=>{const values=await Services.logins.findLogins(ORIGIN,null,REALM);return values[0]?.password??'';},
  setSecret:async value=>{const entries=await Services.logins.findLogins(ORIGIN,null,REALM);if(!value){for(const entry of entries)Services.logins.removeLogin(entry);return;}
   const LoginInfo=Components.Constructor('@mozilla.org/login-manager/loginInfo;1','nsILoginInfo','init');const login=new LoginInfo(ORIGIN,null,REALM,'api',value,'','');if(entries.length)await Services.logins.modifyLogin(entries[0],login);else await Services.logins.addLoginAsync(login);
  },
  fetch:globalThis.fetch.bind(globalThis)
 };
}
export async function openSource(source:Source):Promise<void>{
 const item=await Zotero.Items.getByLibraryAndKeyAsync(source.libraryID,source.attachmentKey);
 if(!item||item.deleted)throw new Error('来源附件已不存在。例句仍保存在 CuLingo 中。');
 if(!await item.fileExists())throw new Error('附件尚未下载或文件已移动，请先在 Zotero 中恢复附件。');
 await Zotero.Reader.open(item.id,{pageIndex:source.pageIndex,position:source.rects?.length?{pageIndex:source.pageIndex,rects:source.rects}:undefined});
}
export async function chooseFile(mode:'open'|'save',name:string):Promise<string|null>{const {FilePicker}=ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');const picker=new FilePicker();picker.init(Zotero.getMainWindow(),mode==='open'?'导入 CuLingo 数据':'导出 CuLingo 数据',mode==='open'?picker.modeOpen:picker.modeSave);picker.defaultString=name;if(mode==='open')picker.appendFilter('CuLingo JSON / CSV','*.json;*.csv');const result=await picker.show();return result===picker.returnOK||result===picker.returnReplace?picker.file:null;}
