import { browser } from 'wxt/browser';
import { route, syncContentScripts, translations } from '../src/background/router';
export default defineBackground(() => {
  const protect=()=>browser.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  const ready=protect();
  browser.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(message?.channel!=='culingo')return;
    ready.then(()=>route(message,sender)).then(sendResponse).catch(()=>sendResponse({ok:false,code:'STARTUP_FAILED',error:'扩展初始化失败，请重新加载。'}));
    return true;
  });
  browser.runtime.onInstalled.addListener(()=>{void syncContentScripts();});
  browser.runtime.onStartup.addListener(()=>{void syncContentScripts();});
  browser.permissions.onRemoved.addListener(()=>{void syncContentScripts();});
  browser.tabs.onRemoved.addListener(id=>translations.cancelOwner(`tab-${id}-0`));
});
