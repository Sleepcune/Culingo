import { createEmptyCard } from 'ts-fsrs';
import type { Backup,Vocabulary,Example,HostIO,ImportPreview } from '../types';
import type { Store } from '../storage/store';
import type { SettingsService } from './settings';
import { normalizeWord } from '../core/words';
import { parseCsv } from '../core/csv';
import { validateBackup,reviveCard,reviveLog,wordSchema,exampleSchema } from './validation';
const escapeCSV=(value:string)=>`"${value.replace(/"/g,'""')}"`;
const escapeHtml=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/[\t\r\n]+/g,'<br>');
export class BackupService {
  constructor(private db:Store,private settings:SettingsService,private io:HostIO,private notify:()=>void){}
  async export():Promise<Backup>{return this.db.transaction(async()=>({format:'culingo-zotero',version:1,exportedAt:Date.now(),vocabulary:await this.db.all<Vocabulary>('vocabulary'),examples:await this.db.all<Example>('examples'),cards:(await this.db.all('cards')).map(reviveCard),logs:(await this.db.all('logs')).map(reviveLog),settings:await this.settings.getPreferences()}));}
  async preview(text:string,format:'json'|'csv'):Promise<ImportPreview>{
    if(text.length>100*1024*1024)throw new Error('导入文件超过 100 MB。');let backup:Backup;let invalid=0;let duplicates=0;
    if(format==='json'){const raw=JSON.parse(text);if(raw.format!=='culingo-zotero'||raw.version!==1)throw new Error('备份格式或版本不兼容，请选择 Zotero 版备份。');backup=validateBackup(raw);}
    else{
      const rows=parseCsv(text);const header=rows.shift()?.map(value=>value.trim().toLowerCase())??[];const column=(key:string)=>header.indexOf(key);if(column('word')<0)throw new Error('CSV 必须包含 word 列。');
      backup={format:'culingo-zotero',version:1,exportedAt:Date.now(),vocabulary:[],examples:[],cards:[],logs:[]};const seen=new Set<string>();const seenExamples=new Set<string>();
      for(const row of rows){
        const word=normalizeWord(row[column('word')]??'');const kind=word.includes(' ')?'phrase':'word';const id=`en:${kind}:${word}`;const now=Date.now();
        try{
          const value=wordSchema.parse({id,word,kind,language:'en',meaning:row[column('meaning')]??'',phonetic:row[column('phonetic')]??'',status:'learning',createdAt:now,updatedAt:now});
          const exampleText=row[column('example')]??'';const translation=row[column('translation')]||undefined;let example:Example|undefined;
          if(exampleText){const sourceText=row[column('source')]??'';example=exampleSchema.parse({id:await this.io.digest(JSON.stringify([id,sourceText,exampleText])),vocabularyId:id,text:exampleText,translation,source:sourceText?JSON.parse(sourceText):undefined,createdAt:now});}
          if(seen.has(id))duplicates++;else {seen.add(id);backup.vocabulary.push(value);backup.cards.push({vocabularyId:id,card:createEmptyCard(new Date(now))});}
          if(example&&!seenExamples.has(example.id)){seenExamples.add(example.id);backup.examples.push(example);}
        }catch{invalid++;}
      }
      backup=validateBackup(backup);
    }
    for(const word of backup.vocabulary)if(await this.db.get('vocabulary',word.id))duplicates++;
    return {valid:backup.vocabulary.length,duplicates,invalid,backup};
  }
  async import(input:Backup){const backup=validateBackup(input);await this.db.transaction(async()=>{
    for(const word of backup.vocabulary){const old=await this.db.get<Vocabulary>('vocabulary',word.id);if(!old||word.updatedAt>old.updatedAt)await this.db.put('vocabulary',word.id,word);}
    const examples=await this.db.all<Example>('examples');const identities=new Set(examples.map(e=>JSON.stringify([e.vocabularyId,e.source?.libraryID,e.source?.attachmentKey,e.source?.pageIndex,e.text])));
    for(const example of backup.examples){const identity=JSON.stringify([example.vocabularyId,example.source?.libraryID,example.source?.attachmentKey,example.source?.pageIndex,example.text]);if(!await this.db.get('examples',example.id)&&!identities.has(identity)){await this.db.put('examples',example.id,example);identities.add(identity);}}
    for(const record of backup.cards){const raw=await this.db.get('cards',record.vocabularyId);const old=raw?reviveCard(raw):undefined;if(!old||(record.card.last_review?.getTime()??0)>(old.card.last_review?.getTime()??0))await this.db.put('cards',record.vocabularyId,record);}
    for(const log of backup.logs)if(!await this.db.get('logs',log.id))await this.db.put('logs',log.id,log);
    for(const word of backup.vocabulary)if(!await this.db.get('cards',word.id))await this.db.put('cards',word.id,{vocabularyId:word.id,card:createEmptyCard()});
    if(backup.settings)await this.db.put('meta','preferences',backup.settings);
  });this.notify();}
  async csv(){const backup=await this.export();const rows=[['word','meaning','phonetic','example','translation','source']];for(const word of backup.vocabulary){const examples=backup.examples.filter(e=>e.vocabularyId===word.id);for(const example of examples.length?examples:[undefined])rows.push([word.word,word.meaning,word.phonetic,example?.text??'',example?.translation??'',example?.source?JSON.stringify(example.source):'']);}return '\uFEFF'+rows.map(row=>row.map(escapeCSV).join(',')).join('\r\n');}
  async tsv(){const backup=await this.export();return backup.vocabulary.map(word=>{const example=backup.examples.find(e=>e.vocabularyId===word.id);return[word.word,word.meaning,example?.text??'',example?.translation??'',example?.source?`${example.source.title} · ${example.source.pageLabel}`:''].map(escapeHtml).join('\t');}).join('\n');}
  async clearLearning(){await this.db.transaction(async()=>{for(const table of ['vocabulary','examples','cards','logs'] as const)await this.db.clear(table);});this.notify();}
}
