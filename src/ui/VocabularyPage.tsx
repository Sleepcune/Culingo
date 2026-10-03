import { useEffect, useMemo, useState } from 'react';
import { rpc } from '../shared/client';
import type { VocabularyDetail, WordStatus } from '../shared/types';
import { Empty, errorText, SourceLink } from './common';

export function VocabularyPage({ words, refresh, onError }: { words: VocabularyDetail[]; refresh: () => void; onError: (message: string) => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WordStatus | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [meaning, setMeaning] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newWord, setNewWord] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const detail = words.find(item => item.id === detailId);
  const visible = useMemo(() => words.filter(item => (status === 'all' || item.status === status) && `${item.word} ${item.meaning}`.toLowerCase().includes(search.trim().toLowerCase())), [words, search, status]);
  useEffect(() => setSelected(previous => new Set([...previous].filter(id => words.some(word => word.id === id)))), [words]);
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); onError('');
    try { await operation(); } catch (e) { onError(errorText(e)); } finally { setBusy(false); refresh(); }
  };
  const toggle = (id: string) => setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const setStatuses = (ids: string[], nextStatus: WordStatus) => act(async () => {
    const results = await Promise.allSettled(words.filter(item => ids.includes(item.id)).map(item => rpc('vocabulary.setStatusById', { id: item.id, status: nextStatus })));
    const failures = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
    if (failures.length) throw new Error(`${failures.length} 个词未能更新：${errorText(failures[0]?.reason)}`);
    setSelected(new Set());
  });
  return <>
    <div className="toolbar"><div className="search-field"><span aria-hidden="true">⌕</span><input aria-label="搜索词汇或释义" placeholder="搜索词汇或释义…" value={search} onChange={e => setSearch(e.target.value)}/></div><div className="filter-tabs" role="group" aria-label="词汇状态筛选">{(['all', 'learning', 'mastered'] as const).map(value => <button key={value} aria-pressed={status === value} className={status === value ? 'active' : ''} onClick={() => { setStatus(value); setSelected(new Set()); }}>{value === 'all' ? '全部' : value === 'learning' ? '学习中' : '已掌握'}</button>)}</div><button className="primary" onClick={() => setAdding(!adding)}>{adding ? '收起' : '+ 添加词汇'}</button></div>
    {adding && <form className="panel add-word" onSubmit={e => { e.preventDefault(); if (!newWord.trim()) return; void act(async () => { await rpc('vocabulary.save', { word: newWord.trim(), meaning: newMeaning.trim(), kind: /\s/.test(newWord.trim()) ? 'phrase' : 'word' }); setNewWord(''); setNewMeaning(''); setAdding(false); }); }}><label>单词或短语<input required maxLength={200} value={newWord} onChange={e => setNewWord(e.target.value)} placeholder="例如 curious 或 look forward to"/></label><label>中文释义<input value={newMeaning} onChange={e => setNewMeaning(e.target.value)} placeholder="输入释义，稍后也可修改"/></label><button className="primary" disabled={busy}>加入生词本</button></form>}
    {!!selected.size && <div className="bulk-bar"><strong>已选择 {selected.size} 个词</strong><button disabled={busy} className="text-button" onClick={() => void setStatuses([...selected], 'mastered')}>标为已掌握</button><button disabled={busy} className="text-button" onClick={() => void setStatuses([...selected], 'learning')}>恢复学习</button><button disabled={busy} className="danger-text text-button" onClick={() => setDeleting([...selected])}>移除所选</button><button className="text-button" onClick={() => setSelected(new Set())}>取消选择</button></div>}
    {!!deleting.length && <div className="confirm-bar" role="alert"><span>移除 {deleting.length} 个词及其例句和复习记录？</span><button className="danger-button" disabled={busy} onClick={() => void act(async () => { await rpc('vocabulary.remove', { ids: deleting }); setDeleting([]); setSelected(new Set()); if (detailId && deleting.includes(detailId)) setDetailId(null); })}>确认移除</button><button className="secondary" onClick={() => setDeleting([])}>取消</button></div>}
    <div className="vocabulary-layout"><section className="panel vocabulary-panel"><div className="table-caption"><span>{visible.length} 个词汇</span><span>按收藏时间排列</span></div>{!visible.length ? <Empty title={words.length ? '没有找到这个词' : '从一次阅读开始'} description={words.length ? '试试其他关键词或切换筛选条件。' : '在网页上收藏新词，它们和例句会一起出现在这里。也可以手动添加。'}/> : <div className="word-table"><div className="word-table-head"><input type="checkbox" aria-label="选择当前列表全部词汇" checked={!!visible.length && visible.every(word => selected.has(word.id))} onChange={e => setSelected(e.target.checked ? new Set(visible.map(item => item.id)) : new Set())}/><span>词汇 / 释义</span><span>学习状态</span><span>收藏日期</span></div>{visible.map(item => <div className={`word-row ${detailId === item.id ? 'word-selected' : ''}`} key={item.id}><input type="checkbox" aria-label={`选择 ${item.word}`} checked={selected.has(item.id)} onChange={() => toggle(item.id)}/><button className="word-cell" onClick={() => { setDetailId(item.id); setMeaning(item.meaning); }}><strong>{item.word}<small>{item.kind === 'phrase' ? '短语' : ''}</small></strong><span>{item.meaning || '暂无释义'}</span></button><span className={`status-pill ${item.status}`}>{item.status === 'mastered' ? '已掌握' : '学习中'}</span><span className="word-date">{new Date(item.createdAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span></div>)}</div>}</section>
      {detail && <aside className="panel detail-panel" aria-label={`${detail.word} 的详情`}><div className="detail-heading"><span className="section-label">词汇详情</span><button className="icon-button" aria-label="关闭详情" onClick={() => setDetailId(null)}>×</button></div><h2>{detail.word}</h2><p className="phonetic">{detail.phonetic || (detail.kind === 'phrase' ? '短语' : '英语单词')}</p><form onSubmit={e => { e.preventDefault(); void act(() => rpc('vocabulary.edit', { id: detail.id, meaning })); }}><label>中文释义<textarea value={meaning} onChange={e => setMeaning(e.target.value)} rows={3}/></label><button className="secondary full" disabled={busy || meaning === detail.meaning}>保存释义</button></form><div className="detail-actions"><button className="primary full" disabled={busy} onClick={() => void setStatuses([detail.id], detail.status === 'mastered' ? 'learning' : 'mastered')}>{detail.status === 'mastered' ? '恢复学习' : '我已掌握'}</button></div><h3 className="section-label">遇见这个词的地方 · {detail.examples.length}</h3>{detail.examples.length ? detail.examples.map(example => <article className="example" key={example.id}><p>{example.text}</p>{example.translation && <p className="muted">{example.translation}</p>}<SourceLink url={example.url} title={example.title}/></article>) : <p className="hint">暂无例句。下次从网页收藏这个词时，会记下它的语境。</p>}{detail.due && <p className="hint">下次复习：{new Date(detail.due).toLocaleString('zh-CN')}</p>}<button className="text-button danger-text" disabled={busy} onClick={() => setDeleting([detail.id])}>从生词本移除</button></aside>}
    </div>
  </>;
}
