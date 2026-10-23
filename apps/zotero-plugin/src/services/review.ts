import { fsrs,State } from 'ts-fsrs';
import type { Vocabulary,Example,Stats,ReviewItem,CardRecord } from '../types';
import type { Store } from '../storage/store';
import { reviveCard,reviveLog } from './validation';
export class ReviewService {
  private scheduler=fsrs({request_retention:0.9,enable_fuzz:false});
  constructor(private db:Store,private notify:()=>void){}
  private day(now:number){const date=new Date(now);date.setHours(0,0,0,0);return date.getTime();}
  private async cards(){return(await this.db.all('cards')).map(reviveCard);}
  private async logs(){return(await this.db.all('logs')).map(reviveLog);}
  async stats(now=Date.now()):Promise<Stats>{const words=await this.db.all<Vocabulary>('vocabulary');const learning=new Set(words.filter(w=>w.status==='learning').map(w=>w.id));const logs=(await this.logs()).filter(log=>log.reviewedAt>=this.day(now)&&log.reviewedAt<=now);return{learning:learning.size,mastered:words.length-learning.size,due:(await this.cards()).filter(c=>learning.has(c.vocabularyId)&&c.card.state!==State.New&&c.card.due.getTime()<=now).length,reviewedToday:logs.length,newToday:new Set(logs.filter(l=>l.log.state===State.New).map(l=>l.vocabularyId)).size};}
  async getQueue(now=Date.now()):Promise<ReviewItem[]>{const allowance=Math.max(0,20-(await this.stats(now)).newToday);const words=new Map((await this.db.all<Vocabulary>('vocabulary')).filter(w=>w.status==='learning').map(w=>[w.id,w]));const cards=(await this.cards()).filter(c=>words.has(c.vocabularyId));const due=cards.filter(c=>c.card.state!==State.New&&c.card.due.getTime()<=now).sort((a,b)=>a.card.due.getTime()-b.card.due.getTime());const fresh=cards.filter(c=>c.card.state===State.New).sort((a,b)=>a.card.due.getTime()-b.card.due.getTime()).slice(0,allowance);const examples=await this.db.all<Example>('examples');return [...due,...fresh].map(c=>({vocabulary:words.get(c.vocabularyId)!,examples:examples.filter(e=>e.vocabularyId===c.vocabularyId),card:c.card,token:c.card.last_review?.getTime()??0}));}
  async rate(input:{vocabularyId:string;rating:1|2|3|4;token:number;operationId:string},now=Date.now()):Promise<Stats>{
    if(!input.operationId||input.operationId.length>300||![1,2,3,4].includes(input.rating)||!Number.isFinite(input.token)||!Number.isFinite(now))throw new Error('无效复习操作。');
    await this.db.transaction(async()=>{
      const previous=await this.db.get<{vocabularyId:string;rating:number}>('logs',input.operationId);if(previous){if(previous.vocabularyId!==input.vocabularyId||previous.rating!==input.rating)throw new Error('复习操作标识已用于另一项评分。');return;}
      const raw=await this.db.get<CardRecord>('cards',input.vocabularyId);const word=await this.db.get<Vocabulary>('vocabulary',input.vocabularyId);if(!raw||!word)throw new Error('该词汇已被删除。');if(word.status!=='learning')throw new Error('该词汇已掌握，无需复习。');const record=reviveCard(raw);
      if((record.card.last_review?.getTime()??0)!==input.token)throw new Error('这张卡已在其他窗口复习，请刷新队列。');
      if(record.card.state===State.New&&(await this.stats(now)).newToday>=20)throw new Error('今日已学习 20 个新词，明天继续。');
      const at=new Date(Math.max(now,input.token+1));const result=this.scheduler.next(record.card,at,input.rating);
      await this.db.put('cards',input.vocabularyId,{vocabularyId:input.vocabularyId,card:result.card});await this.db.put('logs',input.operationId,{id:input.operationId,vocabularyId:input.vocabularyId,rating:input.rating,reviewedAt:at.getTime(),log:result.log});
    });this.notify();return this.stats(now);
  }
}
