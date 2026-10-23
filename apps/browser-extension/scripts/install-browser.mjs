import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const appRoot=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const repoRoot=path.resolve(appRoot,'../..');
const child=spawn(process.execPath,[path.join(repoRoot,'node_modules/playwright/cli.js'),'install','chromium'],{stdio:'inherit',cwd:appRoot,env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:path.join(appRoot,'.cache/playwright')}});
child.on('exit',code=>process.exit(code??1));child.on('error',error=>{console.error(error.message);process.exit(1);});
