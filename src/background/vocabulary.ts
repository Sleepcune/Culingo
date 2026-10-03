import { createEmptyCard } from 'ts-fsrs';
import { normalizeWord } from '../core/words';
import type { AppDB } from './db';
import type { DictionaryEntry, SaveWord, Vocabulary, VocabularyDetail, WordStatus } from '../shared/types';
export class VocabularyService {
  constructor(private db: AppDB, private lookup: (word: string) => Promise<DictionaryEntry | null>) {}
  async save(input: SaveWord): Promise<VocabularyDetail> {
    const original = normalizeWord(input.word);
    if (!original || original.length > 200) throw new Error('词汇需为 1–200 个字符。');
    const kind = input.kind ?? (original.includes(' ') ? 'phrase' : 'word');
    const entry = kind === 'word' ? await this.lookup(original) : null;
    const word = entry?.word ?? original;
    const id = `en:${kind}:${word}`;
    const now = Date.now();
    await this.db.transaction('rw', this.db.vocabulary, this.db.examples, this.db.cards, async () => {
      const existing = await this.db.vocabulary.get(id);
      if (!existing) {
        const item: Vocabulary = { id, word, language: 'en', kind, meaning: input.meaning ?? entry?.translation ?? '', phonetic: input.phonetic ?? entry?.phonetic ?? '', status: 'learning', createdAt: now, updatedAt: now };
        await this.db.vocabulary.put(item);
        await this.db.cards.put({ vocabularyId: id, card: createEmptyCard(new Date(now)) });
      }
      if (input.example?.text.trim()) {
        const exampleId = `${id}:${input.example.url}:${input.example.text}`;
        const oldExample=await this.db.examples.get(exampleId);
        if (!oldExample) await this.db.examples.put({ ...input.example, id: exampleId, vocabularyId: id, createdAt: now });
        else if(input.example.translation&&!oldExample.translation)await this.db.examples.update(exampleId,{translation:input.example.translation});
      }
    });
    return this.detail(id);
  }
  async detail(id: string): Promise<VocabularyDetail> {
    const word = await this.db.vocabulary.get(id);
    if (!word) throw new Error('该词汇已被删除。');
    const examples = await this.db.examples.where('vocabularyId').equals(id).toArray();
    const card = await this.db.cards.get(id);
    return { ...word, examples, due: card?.card.due.getTime() };
  }
  async setStatus(word: string, status: WordStatus) {
    const normalized=normalizeWord(word);const kind=normalized.includes(' ')?'phrase':'word';
    const existing=await this.db.vocabulary.get(`en:${kind}:${normalized}`);
    const item = existing ?? await this.save({ word });
    return this.setStatusById(item.id,status);
  }
  async setStatusById(id:string,status:WordStatus) {
    await this.db.transaction('rw', this.db.vocabulary, this.db.cards, async () => {
      if(!await this.db.vocabulary.get(id))throw new Error('该词汇已被删除。');
      await this.db.vocabulary.update(id, { status, updatedAt: Date.now() });
      if (!await this.db.cards.get(id)) await this.db.cards.put({ vocabularyId: id, card: createEmptyCard() });
    });
    return this.detail(id);
  }
  async edit(id: string, meaning: string) {
    await this.detail(id);
    await this.db.vocabulary.update(id, { meaning, updatedAt: Date.now() });
    return this.detail(id);
  }
  async list(input: { search?: string; status?: WordStatus }) {
    const search = input.search?.trim().toLowerCase();
    const items = (await this.db.vocabulary.orderBy('updatedAt').reverse().toArray()).filter(w => (!input.status || w.status === input.status) && (!search || w.word.includes(search) || w.meaning.toLowerCase().includes(search)));
    return Promise.all(items.map(w => this.detail(w.id)));
  }
  async remove(ids: string[]) {
    await this.db.transaction('rw', this.db.vocabulary, this.db.examples, this.db.cards, this.db.logs, async () => {
      await this.db.vocabulary.bulkDelete(ids); await this.db.cards.bulkDelete(ids);
      await this.db.examples.where('vocabularyId').anyOf(ids).delete();
      await this.db.logs.where('vocabularyId').anyOf(ids).delete();
    });
  }
}
