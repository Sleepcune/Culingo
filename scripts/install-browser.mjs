import { spawn } from 'node:child_process';
import path from 'node:path';
const child=spawn(process.execPath,[path.resolve('node_modules/playwright/cli.js'),'install','chromium'],{stdio:'inherit',env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:path.resolve('.cache/playwright')}});
child.on('exit',code=>process.exit(code??1));child.on('error',error=>{console.error(error.message);process.exit(1);});
