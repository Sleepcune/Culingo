import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse';
const revision = 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b';
const folder = new URL('../public/dictionary/', import.meta.url);
await mkdir(folder, { recursive: true });
const records = new Map(); const forms = {};
const input = createReadStream(new URL('../data/source/ecdict.csv', import.meta.url)).pipe(parse({ columns: true, bom: true, relax_quotes: true }));
for await (const row of input) {
  const word = row.word.trim().toLowerCase(); const rank = Number(row.frq) || Number(row.bnc) || 0;
  if (!/^[a-z]+(?:['-][a-z]+)*$/.test(word) || word.length > 60 || (!rank && !row.tag) || rank > 100000) continue;
  records.set(word, { word, rank, phonetic: row.phonetic || '', definition: row.definition?.replace(/\\n/g, '\n') || '', translation: row.translation?.replace(/\\n/g, '\n') || '', pos: row.pos || '' });
  for (const exchange of (row.exchange || '').split('/')) {
    const [type, value] = exchange.split(':');
    if (type === '0') continue;
    for (const form of (value || '').split(',')) if (/^[a-z]+(?:['-][a-z]+)*$/.test(form)) { const previous = forms[form]; if (!previous || rank < (records.get(previous)?.rank || 100001)) forms[form] = word; }
  }
}
// Explicit lemma fields take precedence over generated inflections.
const lemmas = createReadStream(new URL('../data/source/ecdict.csv', import.meta.url)).pipe(parse({ columns:true,bom:true,relax_quotes:true }));
for await(const row of lemmas) {
  const match=/(?:^|\/)0:([^/]+)/.exec(row.exchange||''); const base=match?.[1]?.split(',')[0]?.toLowerCase(); const word=row.word.trim().toLowerCase();
  if(base && records.has(base) && /^[a-z]+(?:['-][a-z]+)*$/.test(word)) forms[word]=base;
}
const entries = [...records.values()].sort((a,b)=>a.word.localeCompare(b.word)); const ranks = Object.fromEntries(entries.map(e=>[e.word,e.rank]));
for(const form of Object.keys(forms)) if(!records.has(forms[form])) delete forms[form];
const indexText = JSON.stringify({ranks, forms});
await writeFile(new URL('index.json',folder),indexText);
const chunks=[];
for(let i=0;i<entries.length;i+=3000) { const file=`chunk-${String(chunks.length).padStart(3,'0')}.json`; const text=JSON.stringify(entries.slice(i,i+3000));await writeFile(new URL(file,folder),text);chunks.push({file,count:Math.min(3000,entries.length-i),sha256:createHash('sha256').update(text).digest('hex')}); }
const sourceHash=createHash('sha256').update(await readFile(new URL('../data/source/ecdict.csv',import.meta.url))).digest('hex');
await writeFile(new URL('manifest.json',folder),JSON.stringify({version:revision,source:`https://github.com/skywind3000/ECDICT/tree/${revision}`,sourceSha256:sourceHash,indexSha256:createHash('sha256').update(indexText).digest('hex'),count:entries.length,chunks},null,2));
await copyFile(new URL('../data/source/LICENSE',import.meta.url),new URL('LICENSE',folder));
console.log(`Dictionary: ${entries.length} words, ${Object.keys(forms).length} forms, ${chunks.length} chunks.`);
