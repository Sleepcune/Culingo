import { fsrs, State } from 'ts-fsrs';
import type { AppDB } from './db';
import type { ReviewItem, Stats } from '../shared/types';
export class ReviewService {
  private scheduler = fsrs({ request_retention: 0.9, enable_fuzz: false });
  constructor(private db: AppDB) {}
  private startOfDay(now: number) { const date = new Date(now); date.setHours(0, 0, 0, 0); return date.getTime(); }
  async stats(now = Date.now()): Promise<Stats> {
    const words = await this.db.vocabulary.toArray();
    const learning = new Set(words.filter(w => w.status === 'learning').map(w => w.id));
    const cards = await this.db.cards.toArray();
    const logs = await this.db.logs.where('reviewedAt').aboveOrEqual(this.startOfDay(now)).toArray();
    return { learning: learning.size, mastered: words.length - learning.size, due: cards.filter(c => learning.has(c.vocabularyId) && c.card.state !== State.New && c.card.due.getTime() <= now).length, reviewedToday: logs.length, newToday: new Set(logs.filter(l => l.log.state === State.New).map(l => l.vocabularyId)).size };
  }
  async queue(now = Date.now()): Promise<ReviewItem[]> {
    const stats = await this.stats(now); const allowance = Math.max(0, 20 - stats.newToday);
    const learning = (await this.db.vocabulary.toArray()).filter(w => w.status === 'learning');
    const byId = new Map(learning.map(w => [w.id, w]));
    const cards = (await this.db.cards.toArray()).filter(c => byId.has(c.vocabularyId));
    const due = cards.filter(c => c.card.state !== State.New && c.card.due.getTime() <= now).sort((a, b) => a.card.due.getTime() - b.card.due.getTime());
    const fresh = cards.filter(c => c.card.state === State.New).sort((a, b) => a.card.due.getTime() - b.card.due.getTime()).slice(0, allowance);
    return Promise.all([...due, ...fresh].map(async c => ({ vocabulary: byId.get(c.vocabularyId)!, examples: await this.db.examples.where('vocabularyId').equals(c.vocabularyId).toArray(), card: c.card, token: c.card.last_review?.getTime() ?? 0 })));
  }
  async rate(input: { vocabularyId: string; rating: 1 | 2 | 3 | 4; token: number; operationId: string }, now = Date.now()) {
    await this.db.transaction('rw', this.db.cards, this.db.logs, this.db.vocabulary, async () => {
      if (await this.db.logs.get(input.operationId)) return;
      const record = await this.db.cards.get(input.vocabularyId);
      const word = await this.db.vocabulary.get(input.vocabularyId);
      if (!record || !word) throw new Error('该词汇已被删除。');
      if (word.status !== 'learning') throw new Error('该词汇已掌握，无需复习。');
      if ((record.card.last_review?.getTime() ?? 0) !== input.token) throw new Error('这张卡已在其他页面复习，请刷新队列。');
      if (record.card.state === State.New) {
        const today = await this.db.logs.where('reviewedAt').aboveOrEqual(this.startOfDay(now)).toArray();
        if (new Set(today.filter(l => l.log.state === State.New).map(l => l.vocabularyId)).size >= 20) throw new Error('今日已学习 20 个新词，明天继续。');
      }
      const at = new Date(Math.max(now, input.token + 1));
      const result = this.scheduler.next(record.card, at, input.rating);
      await this.db.cards.put({ vocabularyId: input.vocabularyId, card: result.card });
      await this.db.logs.put({ id: input.operationId, vocabularyId: input.vocabularyId, rating: input.rating, reviewedAt: at.getTime(), log: result.log });
    });
    return this.stats(now);
  }
}
