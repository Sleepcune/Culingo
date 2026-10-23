import {build} from 'esbuild';
import {mkdir,readFile,writeFile,cp,readdir} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';
const project=fileURLToPath(new URL('../',import.meta.url));const dist=join(project,'dist');const addon=join(dist,'addon');
await mkdir(addon,{recursive:true});
await build({entryPoints:[join(project,'src/host/runtime.ts')],bundle:true,format:'iife',globalName:'CuLingoRuntime',outfile:join(addon,'runtime.js'),target:'firefox140',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},legalComments:'eof'});
await cp(join(project,'assets'),addon,{recursive:true});
await cp(join(project,'plugin'),addon,{recursive:true});
const files={};async function collect(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isDirectory())await collect(path);else files[relative(addon,path).replaceAll('\\','/')]=new Uint8Array(await readFile(path));}}
await collect(addon);const xpi=join(dist,'culingo-zotero-0.1.0.xpi');await writeFile(xpi,zipSync(files,{level:6}));
console.log(`Built ${xpi} (${Object.keys(files).length} files)`);
