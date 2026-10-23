import { useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { rpc } from '../shared/client';
import type { ReviewItem } from '../shared/types';
import { Empty, errorText, SourceLink } from './common';

type Submission = { vocabularyId: string; rating: 1 | 2 | 3 | 4; token: number; operationId: string };
const ratings = [{ rating: 1, title: '忘记了', hint: '重新学习', className: 'again' }, { rating: 2, title: '有点难', hint: '还需练习', className: 'hard' }, { rating: 3, title: '记得', hint: '正常间隔', className: 'good' }, { rating: 4, title: '很轻松', hint: '延长间隔', className: 'easy' }] as const;

export function ReviewPage({ queue, refresh, pending, onError }: { queue: ReviewItem[]; refresh: () => Promise<void>; pending: MutableRefObject<boolean>; onError: (message: string) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<Submission | null>(null);
  const [finished, setFinished] = useState(0);
  const active = queue[0];
  const inFlight = useRef(false);
  useEffect(() => { if (!retry) setRevealed(false); }, [active?.vocabulary.id, active?.token]);
  const reload = async () => {
    if (inFlight.current) return;
    setBusy(true); onError('');
    try {
      await refresh();
      setRetry(null); setRevealed(false); pending.current = false;
    } catch (e) { onError(errorText(e)); }
    finally { setBusy(false); }
  };
  const pronounce = () => {
    if (!active) return;
    if (!('speechSynthesis' in window)) { onError('当前浏览器不支持语音朗读。'); return; }
    const utterance = new SpeechSynthesisUtterance(active.vocabulary.word);
    utterance.lang = 'en-US';
    utterance.onerror = () => onError('语音朗读未能启动，请检查浏览器语音服务。');
    speechSynthesis.cancel(); speechSynthesis.speak(utterance);
  };
  const submit = async (submission: Submission) => {
    if (inFlight.current) return;
    inFlight.current = true; pending.current = true; setBusy(true); onError('');
    try {
      await rpc('review.rate', submission);
      await refresh();
      setRetry(null); setRevealed(false); setFinished(count => count + 1); pending.current = false;
    } catch (e) {
      const message = errorText(e);
      if (/已被删除|已掌握|已在其他页面复习|今日已学习 20 个新词/.test(message)) {
        setRetry(null); setRevealed(false); pending.current = false;
        onError(`${message} 已重新加载复习队列。`);
        try { await refresh(); } catch (refreshError) { onError(`${message} ${errorText(refreshError)} 请点击“刷新队列”。`); }
      } else {
        setRetry(submission); onError(`${message} 点击“重试提交”继续，复习结果不会重复计入。`);
      }
    } finally { setBusy(false); inFlight.current = false; }
  };
  if (!active && !retry) return <div className="panel"><Empty title={finished ? '这一轮完成了' : '今天的复习已完成'} description={finished ? `刚刚巩固了 ${finished} 个词。继续阅读，积累下一次的小小进步。` : '到期的词汇会出现在这里。收藏新词后，也可以马上开始学习。'}/></div>;
  return <section className="review-area"><div className="review-progress"><span>本轮已复习 <strong>{finished}</strong> 个词</span><span>待复习 <strong>{queue.length}</strong></span></div>{active && <article className="flashcard"><div className="section-label">先试着回忆这个词的意思</div><h2>{active.vocabulary.word}</h2><p className="phonetic">{active.vocabulary.phonetic || 'ENGLISH · WORD IN CONTEXT'}</p>{active.examples[0] && <div className="review-example"><p>{active.examples[0].text}</p><SourceLink url={active.examples[0].url} title={active.examples[0].title}/></div>}{revealed ? <div className="answer" aria-live="polite"><span className="section-label">中文释义</span><p>{active.vocabulary.meaning || '暂无释义，可在生词本中补充。'}</p>{active.examples[0]?.translation && <p className="muted">{active.examples[0].translation}</p>}</div> : <button className="primary reveal-button" disabled={busy || !!retry} onClick={() => setRevealed(true)}>显示答案 <span aria-hidden="true">↓</span></button>}</article>}
    <div className="button-row"><button disabled={busy} className="text-button" onClick={() => void reload()}>刷新队列</button>{active && <button disabled={busy} className="text-button" aria-label={`朗读 ${active.vocabulary.word}`} onClick={pronounce}>朗读词汇 ♫</button>}</div>
    {retry ? <div className="panel retry-panel"><p>上次评分等待确认。重试将使用同一提交编号，也可刷新队列重新开始。</p><button disabled={busy} className="primary" onClick={() => void submit(retry)}>{busy ? '正在确认…' : '重试提交'}</button></div> : revealed && <div className="rating-buttons" aria-label="选择记忆程度">{ratings.map(item => <button key={item.rating} disabled={busy} className={item.className} onClick={() => active && void submit({ vocabularyId: active.vocabulary.id, rating: item.rating, token: active.token, operationId: crypto.randomUUID() })}><strong>{item.title}</strong><span>{item.hint}</span></button>)}</div>}
    <p className="review-tip">凭第一印象作答。诚实的评分，让下一次复习来得刚刚好。</p>
  </section>;
}
