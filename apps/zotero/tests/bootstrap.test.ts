import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
it('cleans up a loaded runtime even when plugin startup was rejected',async()=>{
 const shutdown=vi.fn(async()=>{});const scope:any={Zotero:{logError:vi.fn()},CuLingoRuntime:{shutdown}};
 vm.runInNewContext(readFileSync(new URL('../plugin/bootstrap.js',import.meta.url),'utf8'),scope);
 scope.runtimeReady=Promise.reject(new Error('Storage initialization failed'));
 await scope.shutdown({},0);expect(shutdown).toHaveBeenCalledOnce();expect(scope.Zotero.logError).toHaveBeenCalledOnce();
});
