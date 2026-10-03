import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';
const project=fileURLToPath(new URL('../',import.meta.url));const files={};
async function collect(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await collect(path);else files[relative(project,path).replaceAll('\\','/')]=new Uint8Array(await readFile(path));}}
for(const directory of ['assets','docs','plugin','scripts','src','tests'])await collect(join(project,directory));
for(const file of ['README.md','THIRD_PARTY.md','package.json','package-lock.json','tsconfig.json','vitest.config.ts','.gitignore','.gitattributes'])files[file]=new Uint8Array(await readFile(join(project,file)));
await mkdir(join(project,'dist'),{recursive:true});const output=join(project,'dist','culingo-zotero-0.1.0-source.zip');await writeFile(output,zipSync(files,{level:6}));console.log(`Packaged ${output} (${Object.keys(files).length} source files)`);
