import { test,expect,chromium,type BrowserContext,type Page } from '@playwright/test';
import { createServer,type Server } from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
test.describe.configure({mode:'serial'});
let context:BrowserContext;let extension:string;let server:Server;let origin:string;let management:Page;let requests=0;
const article='<article><h1>A small reading experiment</h1><p id="reading">A resilient ecosystem brings extraordinary opportunities. <a id="link" href="#intact">An original link</a> remains intact.</p><p id="second">The scientist investigates a remarkable phenomenon.</p><pre id="code">resilient ecosystem</pre><div contenteditable="true" id="editor">resilient</div></article>';
test.beforeAll(async()=>{
  server=createServer((req,res)=>{
    if(req.url==='/v1/chat/completions'){let body='';req.on('data',c=>body+=c);req.on('end',()=>{requests++;const data=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'这是测试译文：'+data.messages.at(-1).content}}]}));});}
    else {const length=req.url?.includes('long')?(req.url.includes('20000')?20000:5000):0;const text=length?`<article>${Array.from({length:length/100},()=>'<p>'+('resilient ecosystem opportunity remarkable curious '.repeat(20))+'</p>').join('')}</article>`:article;res.setHeader('Content-Type','text/html');res.end(`<html><head><title>CuLingo Test Article</title></head><body style="font:20px/2 Georgia;max-width:760px;margin:40px auto">${text}</body></html>`);}
  });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const profile=path.resolve('.cache/e2e-'+Date.now());await fs.mkdir(profile,{recursive:true});
  const source=path.resolve('.output/chrome-mv3');const manifest=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8'));
  expect(manifest.host_permissions).toBeUndefined();expect(manifest.content_scripts).toEqual([]);
  // Headless Chromium cannot approve native optional-permission dialogs. Pregrant hosts
  // in a separate test-only copy; production manifest remains optional-only.
  const extensionPath=path.join(profile,'extension');await fs.cp(source,extensionPath,{recursive:true});
  manifest.host_permissions=['https://*/*','http://*/*'];await fs.writeFile(path.join(extensionPath,'manifest.json'),JSON.stringify(manifest));
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
  const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');extension=new URL(worker.url()).host;
  management=await context.newPage();await management.goto(`chrome-extension://${extension}/options.html`);
  await expect(management.getByText('我的生词本',{exact:true}).first()).toBeVisible();
});
test.afterAll(async()=>{await context?.close();await new Promise<void>(resolve=>server?.close(()=>resolve()));});
async function rpc<M=unknown>(method:string,input?:unknown):Promise<M>{return management.evaluate(async({method,input})=>{const response=await Promise.race([(globalThis as any).chrome.runtime.sendMessage({channel:'culingo',method,input}),new Promise<never>((_resolve,reject)=>setTimeout(()=>reject(new Error('RPC timeout: '+method)),20000))]);if(!response.ok)throw new Error(response.error);return response.data;},{method,input});}
test('installation, offline dictionary, permissions, reading, review and restore',async()=>{
  await expect.poll(async()=> (await rpc<any>('dictionary.progress')).state,{timeout:60000}).toBe('ready');
  const word=await rpc<any>('dictionary.lookup',{word:'resilient'});expect(word.translation).toBeTruthy();
  const untouched=await context.newPage();await untouched.goto(origin);await expect(untouched.locator('[data-culingo="ui"]')).toHaveCount(0);await untouched.close();
  // Activate reading with a real UI click; host permissions are pregranted by the fixture.
  await management.goto(`chrome-extension://${extension}/options.html#settings`);
  const all=management.getByRole('switch',{name:'在所有网站启用'});await all.click();
  await expect.poll(async()=> (await rpc<any>('settings.public')).allSites).toBe(true);
  const page=await context.newPage();await page.goto(origin);
  await expect(page.locator('[data-culingo="ui"]')).toBeAttached();
  await expect.poll(()=>page.evaluate(()=>CSS.highlights.get('culingo-difficult')?.size??0)).toBeGreaterThan(0);
  expect(await page.locator('#reading').innerHTML()).toContain('<a id="link"');expect(await page.locator('#code').textContent()).toBe('resilient ecosystem');
  const wordBox=await page.locator('#reading').evaluate(node=>{const text=node.firstChild!;const textContent=text.textContent!;const start=textContent.indexOf('resilient');const range=document.createRange();range.setStart(text,start);range.setEnd(text,start+9);const b=range.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});
  await page.mouse.move(wordBox.x,wordBox.y);await expect(page.getByRole('dialog',{name:'CuLingo 查词'})).toBeVisible();
  await page.getByRole('button',{name:'＋ 收藏',exact:true}).click();await expect.poll(async()=> (await rpc<any[]>('vocabulary.list',{})).length).toBe(1);
  await page.reload();await expect(page.locator('[data-culingo="ui"]')).toBeAttached();
  await expect.poll(()=>page.evaluate(()=>CSS.highlights.get('culingo-learning')?.size??0)).toBeGreaterThan(0);
  const queue=await rpc<any[]>('review.getQueue');expect(queue).toHaveLength(1);
  await rpc('review.rate',{vocabularyId:queue[0].vocabulary.id,rating:3,token:queue[0].token,operationId:'e2e-first-review'});
  const backup=await rpc<any>('backup.export');expect(JSON.stringify(backup)).not.toContain('apiKey');expect(backup.logs).toHaveLength(1);
  await rpc('vocabulary.remove',{ids:backup.vocabulary.map((w:any)=>w.id)});expect(await rpc('vocabulary.list',{})).toEqual([]);
  const preview=await rpc<any>('backup.preview',{text:JSON.stringify(backup),format:'json'});await rpc('backup.import',{backup:preview.backup});expect(await rpc<any[]>('vocabulary.list',{})).toHaveLength(1);
  await page.evaluate(()=>{const p=document.createElement('p');p.id='dynamic';p.textContent='A resilient ecosystem is extraordinary.';document.querySelector('article')!.append(p);});
  await expect.poll(()=>page.evaluate(()=>CSS.highlights.get('culingo-learning')?.size??0)).toBeGreaterThan(1);
  // Requests from the content script cannot retrieve settings containing secrets.
  const worker=context.serviceWorkers()[0]!;const privileged=await worker.evaluate(async({tabOrigin})=>{const tabs=await (globalThis as any).chrome.tabs.query({url:tabOrigin+'/*'});return tabs[0]?.id;},{tabOrigin:origin});expect(privileged).toBeDefined();
  await page.close();
});
test('custom API, bilingual rendering, caching and original restoration',async()=>{
  await management.goto(`chrome-extension://${extension}/options.html#settings`);
  await management.getByLabel('API 根地址',{exact:false}).fill(origin+'/v1');
  await management.getByPlaceholder('输入你的 API Key').fill('test-key');await management.getByLabel('模型名称').fill('mock-model');
  await management.getByRole('button',{name:'保存服务配置'}).click();await expect(management.getByText('翻译服务设置已保存。')).toBeVisible();
  await management.getByRole('button',{name:'测试连接',exact:true}).click();await expect(management.getByText(/连接成功/)).toBeVisible();
  const page=await context.newPage();await page.goto(origin);await expect(page.locator('[data-culingo="ui"]')).toBeAttached();
  const toggle=async()=>{const worker=context.serviceWorkers()[0]!;await worker.evaluate(async(tabOrigin)=>{const tabs=await (globalThis as any).chrome.tabs.query({url:tabOrigin+'/*'});await (globalThis as any).chrome.tabs.sendMessage(tabs.at(-1).id,{channel:'culingo-content',action:'translate.toggle'});},origin);};
  await toggle();await expect(page.locator('[data-culingo="translation"]').first()).toContainText('这是测试译文');expect(await page.locator('#reading').innerHTML()).toContain('id="link"');
  await page.getByRole('button',{name:'恢复原文',exact:true}).click();await expect(page.locator('[data-culingo="translation"]')).toHaveCount(0);
  const before=requests;await toggle();await expect(page.locator('[data-culingo="translation"]').first()).toContainText('这是测试译文');expect(requests).toBe(before);
  await page.getByRole('button',{name:'恢复原文',exact:true}).click();await page.close();
});
test('mastery sync, private settings denied, offline persistence after worker shutdown',async()=>{
  const page=await context.newPage();const other=await context.newPage();await page.goto(origin);await other.goto(origin);
  await expect.poll(()=>page.evaluate(()=>CSS.highlights.get('culingo-learning')?.size??0)).toBeGreaterThan(0);
  const worker=context.serviceWorkers()[0]!;
  const denied=await worker.evaluate(async tabOrigin=>{
    const chrome=(globalThis as any).chrome;const tabs=await chrome.tabs.query({url:tabOrigin+'/*'});
    return (await chrome.scripting.executeScript({target:{tabId:tabs[0].id},world:'ISOLATED',func:async()=>{
      const chrome=(globalThis as any).chrome;const rpc=await chrome.runtime.sendMessage({channel:'culingo',method:'settings.get'});const storage=await chrome.storage.local.get('settings').catch(()=>({}));return {rpc,storage};
    }}))[0].result;
  },origin);
  expect(denied.rpc.ok).toBe(false);expect(denied.storage.settings).toBeUndefined();
  await rpc('vocabulary.setStatus',{word:'resilient',status:'mastered'});
  await expect.poll(()=>other.evaluate(()=>CSS.highlights.get('culingo-learning')?.size??0)).toBe(0);
  await rpc('vocabulary.setStatus',{word:'resilient',status:'learning'});
  await expect.poll(()=>other.evaluate(()=>CSS.highlights.get('culingo-learning')?.size??0)).toBeGreaterThan(0);
  await context.setOffline(true);const entry=await rpc<any>('dictionary.lookup',{word:'resilient'});expect(entry.translation).toBeTruthy();expect(await rpc<any[]>('vocabulary.list',{})).toHaveLength(1);
  await context.setOffline(false);
  const cdp=await context.newCDPSession(management);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');await cdp.detach();
  expect((await rpc<any>('dictionary.lookup',{word:'resilient'})).translation).toBeTruthy();expect(await rpc<any[]>('vocabulary.list',{})).toHaveLength(1);
  await rpc('settings.update',{sites:{[origin]:false}});await expect(page.locator('[data-culingo="ui"]')).toHaveCount(0);expect(await page.locator('#reading').innerHTML()).toContain('<a id="link"');
  await rpc('settings.update',{sites:{[origin]:true}});await expect(page.locator('[data-culingo="ui"]')).toBeAttached();
  await page.close();await other.close();
});
test('first-screen highlighting and local lookup performance on long articles',async()=>{
  const page=await context.newPage();await page.goto(origin+'/long-5000',{waitUntil:'domcontentloaded'});
  const firstScreenMs=await page.evaluate(()=>new Promise<number>((resolve,reject)=>{
    const deadline=performance.now()+5000;const check=()=>{if((CSS.highlights.get('culingo-difficult')?.size??0)+(CSS.highlights.get('culingo-learning')?.size??0)>0)resolve(performance.now());else if(performance.now()>deadline)reject(new Error('No highlight'));else requestAnimationFrame(check);};check();
  }));
  const samples=await management.evaluate(async()=>{const times:number[]=[];for(let i=0;i<40;i++){const start=performance.now();const reply=await (globalThis as any).chrome.runtime.sendMessage({channel:'culingo',method:'dictionary.lookup',input:{word:'resilient'}});if(!reply.ok)throw new Error(reply.error);times.push(performance.now()-start);}return times.sort((a,b)=>a-b);});
  const p95=samples[Math.ceil(samples.length*.95)-1]!;
  await page.goto(origin+'/long-20000');await expect(page.locator('[data-culingo="ui"]')).toBeAttached();
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await expect.poll(()=>page.evaluate(()=>CSS.highlights.get('culingo-learning')?.size??0)).toBeGreaterThan(0);
  const report={browser:context.browser()?.version(),cpu:os.cpus()[0]?.model,ramGiB:Math.round(os.totalmem()/1024**3),firstScreenMs,lookupP95Ms:p95};console.log('Performance:',JSON.stringify(report));
  await test.info().attach('performance',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  expect(firstScreenMs).toBeLessThan(1000);expect(p95).toBeLessThan(200);
  await page.close();
});
test('imported word forms highlight and mastery updates the exact record from the UI',async()=>{
  const before=await rpc<any[]>('vocabulary.list',{});
  const preview=await rpc<any>('backup.preview',{text:'word,meaning\nrunning,跑步',format:'csv'});
  await rpc('backup.import',{backup:preview.backup});
  const page=await context.newPage();await page.goto(origin);
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='I am running every morning.';document.querySelector('article')!.append(p);});
  await expect.poll(()=>page.evaluate(()=>Array.from(CSS.highlights.get('culingo-learning')??[]).some(range=>range.toString()==='running'))).toBe(true);
  await management.goto(`chrome-extension://${extension}/options.html#vocabulary`);
  await management.getByRole('button',{name:/^running/}).click();
  await management.getByRole('button',{name:'我已掌握',exact:true}).click();
  await expect.poll(async()=> (await rpc<any[]>('vocabulary.list',{})).find(w=>w.word==='running')?.status).toBe('mastered');
  const records=await rpc<any[]>('vocabulary.list',{});expect(records).toHaveLength(before.length+1);expect(records.some(w=>w.word==='run')).toBe(false);
  await expect.poll(()=>page.evaluate(()=>Array.from(CSS.highlights.get('culingo-learning')??[]).some(range=>range.toString()==='running'))).toBe(false);
  await rpc('vocabulary.remove',{ids:['en:word:running']});await page.close();
});
