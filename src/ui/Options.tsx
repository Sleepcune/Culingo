import { useCallback, useEffect, useRef, useState } from 'react';
import { rpc } from '../shared/client';
import type { Diagnostics, DictionaryProgress, ReviewItem, Settings, Stats, VocabularyDetail } from '../shared/types';
import { Alert, Brand, DictionaryNotice, errorText, StatsStrip, useChanges, useTheme } from './common';
import { VocabularyPage } from './VocabularyPage';
import { ReviewPage } from './ReviewPage';
import { SettingsPage } from './SettingsPage';
import { DataPage } from './DataPage';

export type Page = 'vocabulary' | 'review' | 'settings' | 'data';
const pages: { id: Page; title: string; description: string; icon: string }[] = [
  { id: 'vocabulary', title: '我的生词本', description: '每一个词，都带着你读过的故事。', icon: '▤' },
  { id: 'review', title: '今日复习', description: '让偶然遇见的词，变成长期记忆。', icon: '◈' },
  { id: 'settings', title: '阅读设置', description: '让 CuLingo 按照你的节奏工作。', icon: '⚙' },
  { id: 'data', title: '数据与备份', description: '你的词汇积累，随时可以带走。', icon: '⇅' },
];
const route = (): Page => pages.some(page => page.id === location.hash.slice(1)) ? location.hash.slice(1) as Page : 'vocabulary';

export function Options() {
  const [page, setPage] = useState<Page>(route);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [words, setWords] = useState<VocabularyDetail[]>([]);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [progress, setProgress] = useState<DictionaryProgress | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostics[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const reviewPending = useRef(false);
  const loadGeneration = useRef(0);
  useTheme(settings?.theme);

  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const results = await Promise.allSettled([rpc('settings.get'), rpc('stats.get'), rpc('vocabulary.list', {}), rpc('dictionary.progress'), rpc('diagnostics.get')]);
    if (generation !== loadGeneration.current) return;
    const [nextSettings, counts, items, dictionary, logs] = results;
    if (nextSettings?.status === 'fulfilled') setSettings(nextSettings.value);
    if (counts?.status === 'fulfilled') setStats(counts.value);
    if (items?.status === 'fulfilled') setWords(items.value);
    if (dictionary?.status === 'fulfilled') setProgress(dictionary.value);
    if (logs?.status === 'fulfilled') setDiagnostics(logs.value);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failures.length) setError([...new Set(failures.map(result => errorText(result.reason)))].join('；'));
    setLoading(false);
  }, []);
  const refreshQueue = useCallback(async () => { setQueue(await rpc('review.getQueue')); }, []);
  useEffect(() => {
    void refresh();
    void refreshQueue().catch(e => setError(errorText(e)));
    const navigate = () => setPage(route());
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [refresh, refreshQueue]);
  const onChange = useCallback(() => {
    void refresh();
    if (!reviewPending.current) void refreshQueue().catch(e => setError(errorText(e)));
  }, [refresh, refreshQueue]);
  useChanges(onChange);
  useEffect(() => {
    if (!progress || !['idle', 'loading'].includes(progress.state)) return;
    const timer = setInterval(() => rpc('dictionary.progress').then(setProgress).catch(e => setError(errorText(e))), 1500);
    return () => clearInterval(timer);
  }, [progress?.state]);
  const go = (next: Page) => { location.hash = next; setPage(next); };
  const current = pages.find(item => item.id === page)!;
  return <div className="app-shell">
    <aside className="sidebar"><Brand/><div className="sidebar-label">学习空间</div><nav aria-label="主要导航">{pages.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => go(item.id)} aria-current={page === item.id ? 'page' : undefined}><span aria-hidden="true">{item.icon}</span>{item.title}{item.id === 'review' && !!stats?.due && <small>{stats.due}</small>}</button>)}</nav><div className="sidebar-bottom"><div className="leaf" aria-hidden="true">❧</div><p>Read a little.<br/>Remember a little more.</p><span>CuLingo · 本地学习空间</span></div></aside>
    <main className="main-content"><header className="page-header"><div><div className="eyebrow">YOUR WORDS, YOUR WORLD</div><h1>{current.title}</h1><p>{current.description}</p></div><span className="local-badge"><i/> 本地保存</span></header>
      <Alert message={error} dismiss={() => setError('')}/>
      <DictionaryNotice progress={progress} retry={() => void rpc('dictionary.retry').then(setProgress).catch(e => setError(errorText(e)))}/>
      {loading ? <div className="panel loading" role="status">正在打开你的学习空间…</div> : <>
        <StatsStrip stats={stats}/>
        {page === 'vocabulary' && <VocabularyPage words={words} refresh={onChange} onError={setError}/>}
        <div hidden={page !== 'review'}><ReviewPage queue={queue} refresh={async () => { await refreshQueue(); await refresh(); }} pending={reviewPending} onError={setError}/></div>
        {page === 'settings' && (settings ? <SettingsPage settings={settings} refresh={onChange} onError={setError} progress={progress}/> : <div className="panel"><p>设置加载失败。</p><button className="primary" onClick={onChange}>重新连接</button></div>)}
        {page === 'data' && <DataPage words={words} diagnostics={diagnostics} refresh={onChange} onError={setError}/>}
      </>}
      <footer className="page-footer"><span>让词汇回到语境，让学习融入生活。</span><button className="text-button" onClick={onChange}>刷新数据</button></footer>
    </main>
  </div>;
}
