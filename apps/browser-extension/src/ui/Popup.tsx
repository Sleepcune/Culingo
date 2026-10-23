import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { rpc } from '../shared/client';
import type { DictionaryProgress, PublicSettings, Stats } from '../shared/types';
import { Alert, Brand, DictionaryNotice, errorText, Toggle, useChanges, useTheme } from './common';
import { pageOrigin, siteEnabled } from './export';

export function Popup() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [progress, setProgress] = useState<DictionaryProgress | null>(null);
  const [tab, setTab] = useState<{ id?: number; url?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useTheme(settings?.theme);
  const refresh = useCallback(() => {
    Promise.all([rpc('settings.public'), rpc('stats.get'), rpc('dictionary.progress'), browser.tabs.query({ active: true, currentWindow: true })]).then(([next, counts, dictionary, tabs]) => {
      setSettings(next); setStats(counts); setProgress(dictionary); setTab(tabs[0] ?? {});
    }).catch(e => setError(errorText(e))).finally(() => setLoaded(true));
  }, []);
  useEffect(refresh, [refresh]);
  useChanges(refresh);
  useEffect(() => {
    if (!progress || !['idle', 'loading'].includes(progress.state)) return;
    const timer = setInterval(() => rpc('dictionary.progress').then(setProgress).catch(e => setError(errorText(e))), 1500);
    return () => clearInterval(timer);
  }, [progress?.state]);
  const origin = pageOrigin(tab.url);
  const currentEnabled = !!(settings && origin && siteEnabled(origin, settings.allSites, settings.sites));
  const action = async (task: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await task(); refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const open = (route: string) => action(async () => { await browser.tabs.create({ url: `${browser.runtime.getURL('/options.html')}#${route}` }); window.close(); });
  const toggleSite = () => {
    if (!origin || !settings) return;
    const request = currentEnabled ? Promise.resolve(true) : browser.permissions.request({ origins: [`${origin}/*`] });
    void action(async () => {
      if (!await request) throw new Error('尚未获得此网站的访问权限，可再次点击授权。');
      await rpc('settings.update', { sites: { ...settings.sites, [origin]: !currentEnabled } });
    });
  };
  return <main className="popup">
    <header className="popup-header"><Brand small/><button className="icon-button" title="打开设置" aria-label="打开设置" onClick={() => void open('settings')}>⚙</button></header>
    <Alert message={error} dismiss={() => setError('')}/>
    {!loaded && <p className="loading" role="status">正在连接学习空间…</p>}
    {loaded && !settings && <button className="primary full" onClick={refresh}>重新连接</button>}
    {settings && <>
      <section className="popup-site"><div className="section-label">当前网站</div><h2>{origin ? new URL(origin).hostname : '此页面暂不支持'}</h2><p>{origin ? currentEnabled ? '已启用阅读辅助，遇见新词就收藏。' : '授权后，在阅读时发现并积累生词。' : '请打开一个普通网页后使用 CuLingo。'}</p><button disabled={busy || !origin} className={currentEnabled ? 'secondary full' : 'primary full'} onClick={toggleSite}>{currentEnabled ? '关闭此网站的阅读辅助' : '授权并启用此网站'}</button></section>
      <div className="setting-row"><div><strong>阅读辅助总开关</strong><p>{settings.enabled ? '自动标记超出词汇量的英语单词' : '阅读辅助已暂停'}</p></div><Toggle checked={settings.enabled} disabled={busy} label="阅读辅助总开关" onChange={() => void action(() => rpc('settings.update', { enabled: !settings.enabled }))}/></div>
      <div className="popup-level"><div className="section-label">我的词汇量</div><div className="segmented">{([3000, 5000, 8000] as const).map(level => <button key={level} aria-pressed={settings.level === level} disabled={busy} className={settings.level === level ? 'selected' : ''} onClick={() => void action(() => rpc('settings.update', { level }))}>{level.toLocaleString()}</button>)}</div><p className="hint">只标记高于这个词汇量的单词。</p></div>
      <button className="secondary full" disabled={busy || !origin || !currentEnabled || !settings.enabled || !settings.apiConfigured} onClick={() => void action(async () => {
        if (tab.id === undefined) throw new Error('找不到当前标签页。');
        const response = await browser.tabs.sendMessage(tab.id, { channel: 'culingo-content', action: 'translate.toggle' });
        if (response?.ok === false) throw new Error(response.error || '双语阅读未能启动。');
      })}>切换当前页双语阅读</button>
      {!settings.apiConfigured && <p className="hint">双语阅读需要 API。<button className="inline-link" onClick={() => void open('settings')}>前往配置 ↗</button></p>}
      <DictionaryNotice progress={progress} retry={() => void action(() => rpc('dictionary.retry'))}/>
      <div className="popup-counts"><div><strong>{stats?.learning ?? '—'}</strong><span>积累中的词</span></div><div><strong>{stats?.due ?? '—'}</strong><span>今天待复习</span></div></div>
      <button className="primary full" onClick={() => void open('review')}>开始今日复习 <span aria-hidden="true">↗</span></button>
      <nav className="popup-nav"><button onClick={() => void open('vocabulary')}>我的生词本</button><button onClick={() => void open('data')}>导入与备份</button></nav>
    </>}
    <footer className="popup-footer">一点点积累，读懂更大的世界。</footer>
  </main>;
}
