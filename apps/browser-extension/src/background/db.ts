import Dexie, { type Table } from 'dexie';
import type { Vocabulary, Example, ReviewCard, ReviewLog, DictionaryEntry, MeaningOverride, CacheEntry, Diagnostics } from '../shared/types';
export class AppDB extends Dexie {
  vocabulary!: Table<Vocabulary, string>; examples!: Table<Example, string>;
  cards!: Table<ReviewCard, string>; logs!: Table<ReviewLog, string>;
  dictionary!: Table<DictionaryEntry, string>; meaningOverrides!: Table<MeaningOverride, string>; cache!: Table<CacheEntry, string>;
  meta!: Table<{ key: string; value: unknown }, string>; diagnostics!: Table<Diagnostics, number>;
  constructor(name = 'culingo') {
    super(name);
    this.version(1).stores({ vocabulary: 'id,word,status,updatedAt', examples: 'id,vocabularyId', cards: 'vocabularyId', logs: 'id,vocabularyId,reviewedAt', dictionary: 'word', cache: 'key,accessedAt', meta: 'key', diagnostics: '++id,at' });
    this.version(2).stores({ vocabulary: 'id,word,status,updatedAt', examples: 'id,vocabularyId', cards: 'vocabularyId', logs: 'id,vocabularyId,reviewedAt', dictionary: 'word', meaningOverrides: 'word,updatedAt', cache: 'key,accessedAt', meta: 'key', diagnostics: '++id,at' });
  }
  async diagnose(code: string, duration?: number) {
    await this.diagnostics.add({ at: Date.now(), code, ...(duration !== undefined ? { duration } : {}) });
    const excess = (await this.diagnostics.count()) - 100;
    if (excess > 0) await this.diagnostics.orderBy('id').limit(excess).delete();
  }
}
