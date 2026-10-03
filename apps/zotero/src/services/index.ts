import type { PluginService,SqlConnection,HostIO } from '../types';
import { Store } from '../storage/store';
import { DictionaryService } from './dictionary';
import { VocabularyService } from './vocabulary';
import { SettingsService } from './settings';
import { ReviewService } from './review';
import { BackupService } from './backup';
import { TranslationService } from './translation';
export function createService(learning:SqlConnection,cache:SqlConnection,io:HostIO):PluginService {
  const db=new Store(learning);const cachedb=new Store(cache);const listeners=new Set<()=>void>();const notify=()=>{for(const listener of listeners)try{listener();}catch{/* A detached view cannot break persistence. */}};
  const dictionary=new DictionaryService(cachedb,io,notify);const settings=new SettingsService(db,io,notify);const vocabulary=new VocabularyService(db,dictionary,io,notify);const review=new ReviewService(db,notify);const translation=new TranslationService(cachedb,settings,io);const backup=new BackupService(db,settings,io,notify);
  return{initialize:async()=>{await db.initialize();await cachedb.initialize();await dictionary.start();},close:async()=>{translation.close();listeners.clear();await db.close();await cachedb.close();},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},dictionary,vocabulary,review,translation,backup,settings:{getPublic:()=>settings.getPublic(),update:input=>settings.update(input),configureApi:async input=>{await settings.configureApi(input);translation.reset();}}};
}
