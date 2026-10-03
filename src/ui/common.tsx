import { useEffect } from 'react';
import { browser } from 'wxt/browser';
import type { DictionaryProgress, Settings, Stats } from '../shared/types';

export const errorText = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请重试。';

export function useTheme(theme?: Settings['theme']) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme ?? 'system';
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'light dark';
  }, [theme]);
}

export function useChanges(refresh: () => void) {
  useEffect(() => {
    const handler = (message: unknown) => {
      if (message && typeof message === 'object' && 'channel' in message && message.channel === 'culingo-event' && 'type' in message && message.type === 'changed') refresh();
    };
    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, [refresh]);
}

export function Brand({ small = false }: { small?: boolean }) {
  return <div className={`brand ${small ? 'brand-small' : ''}`}><span className="brand-mark" aria-hidden="true">C<span>u</span></span><div><strong>CuLingo<span className="brand-dot">.</span></strong><span className="brand-tag">让阅读，成为积累。</span></div></div>;
}

export function Alert({ message, dismiss }: { message: string; dismiss?: () => void }) {
  if (!message) return null;
  return <div className="alert" role="alert"><span>{message}</span>{dismiss && <button aria-label="关闭提示" className="text-button" onClick={dismiss}>×</button>}</div>;
}

export function Empty({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <div className="empty"><span className="empty-symbol" aria-hidden="true">✧</span><h3>{title}</h3><p>{description}</p>{children}</div>;
}

export function StatsStrip({ stats }: { stats: Stats | null }) {
  return <div className="stats-strip">{[['learning', '正在学习'], ['mastered', '已掌握'], ['due', '待复习'], ['reviewedToday', '今日复习']].map(([key, label]) => <div key={key}><strong>{stats ? stats[key as keyof Stats] : '—'}</strong><span>{label}</span></div>)}</div>;
}

export function DictionaryNotice({ progress, retry }: { progress: DictionaryProgress | null; retry?: () => void }) {
  if (!progress || progress.state === 'ready') return null;
  return <div className={`dictionary-notice ${progress.state === 'error' ? 'notice-error' : ''}`} role="status">{progress.state === 'error' ? <><span>词典加载失败。可重试下载。</span>{retry && <button className="text-button" onClick={retry}>重试</button>}</> : <><span>正在准备本地词典…</span><progress max={progress.total || 1} value={progress.completed} aria-label="词典下载进度"/><span>{progress.total ? `${Math.round(progress.completed / progress.total * 100)}%` : '请稍候'}</span></>}</div>;
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? 'toggle-on' : ''}`} onClick={onChange}><span/></button>;
}

export function SourceLink({ url, title }: { url: string; title: string }) {
  try {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) return <span className="muted">{title || '本地记录'}</span>;
    return <a className="source-link" href={target.href} target="_blank" rel="noopener noreferrer">{title || target.hostname} ↗</a>;
  } catch { return <span className="muted">{title || '无来源链接'}</span>; }
}

export function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
