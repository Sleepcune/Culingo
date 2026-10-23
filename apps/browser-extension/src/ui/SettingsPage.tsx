import { useState } from 'react';
import { browser } from 'wxt/browser';
import { rpc } from '../shared/client';
import type { ApiConfig, DictionaryProgress, Settings } from '../shared/types';
import { errorText, Toggle } from './common';

export function SettingsPage({ settings, refresh, onError, progress }: { settings: Settings; refresh: () => void; onError: (message: string) => void; progress: DictionaryProgress | null }) {
  const [api, setApi] = useState<ApiConfig>({ ...settings.api });
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [notice, setNotice] = useState('');
  const [showKey, setShowKey] = useState(false);
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); onError(''); setNotice('');
    try { await operation(); refresh(); } catch (e) { onError(errorText(e)); } finally { setBusy(false); }
  };
  const update = (patch: Partial<Settings>) => act(() => rpc('settings.update', patch));
  const validApi = () => {
    let url: URL;
    try { url = new URL(api.baseUrl.trim()); } catch { throw new Error('请输入完整的 API 根地址，例如 https://服务域名/v1。'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('远程服务需要 HTTPS 地址。本地服务可使用 localhost 或 127.0.0.1 的 HTTP 地址。');
    if (url.username || url.password || url.search || url.hash || /\/chat\/completions\/?$/.test(url.pathname)) throw new Error('请填写干净的 API 根地址，不包含凭据、查询参数、片段或 /chat/completions。');
    if (!api.model.trim()) throw new Error('请填写模型名称。');
    return { baseUrl: api.baseUrl.trim().replace(/\/+$/, ''), apiKey: api.apiKey.trim(), model: api.model.trim() };
  };
  const authorizedApi = async () => {
    const config = validApi();
    if (!await browser.permissions.request({ origins: [`${new URL(config.baseUrl).origin}/*`] })) throw new Error('需要获得翻译服务地址的访问权限，才能连接或保存。');
    return config;
  };
  const toggleAll = () => {
    const permission = settings.allSites ? Promise.resolve(true) : browser.permissions.request({ origins: ['https://*/*', 'http://*/*'] });
    void act(async () => {
      if (!await permission) throw new Error('所有网站的访问权限尚未授予。你仍可在弹窗中逐站授权。');
      await rpc('settings.update', { allSites: !settings.allSites });
    });
  };
  const toggleSite = (origin: string, enabled: boolean) => {
    const permission = enabled ? Promise.resolve(true) : browser.permissions.request({ origins: [`${origin}/*`] });
    void act(async () => {
      if (!await permission) throw new Error('此网站的访问权限尚未授予。');
      await rpc('settings.update', { sites: { ...settings.sites, [origin]: !enabled } });
    });
  };
  return <div className="settings-grid">
    <section className="panel settings-panel"><div className="panel-heading"><span className="section-label">READING</span><h2>阅读与词汇</h2></div><div className="setting-row"><div><strong>开启阅读辅助</strong><p>在已授权的网页上标记英语生词。</p></div><Toggle checked={settings.enabled} disabled={busy} label="开启阅读辅助" onChange={() => void update({ enabled: !settings.enabled })}/></div><label className="field-label">熟悉的词汇量</label><div className="segmented levels-wide">{([3000, 5000, 8000] as const).map(level => <button disabled={busy} key={level} aria-pressed={settings.level === level} className={settings.level === level ? 'selected' : ''} onClick={() => void update({ level })}>{level.toLocaleString()}<span>{level === 3000 ? '基础阅读' : level === 5000 ? '进阶阅读' : '广泛阅读'}</span></button>)}</div><p className="hint">标记超出当前词汇量的词；已掌握的词不再标记。</p><div className="setting-row"><div><strong>在所有网站启用</strong><p>开启时浏览器会请求所有 HTTP / HTTPS 网站的访问权限。</p></div><Toggle checked={settings.allSites} disabled={busy} label="在所有网站启用" onChange={toggleAll}/></div><p className="hint">关闭后仅在逐站授权的站点启用。单个网站的关闭选择优先。</p>{Object.keys(settings.sites).length > 0 && <div className="site-list"><h3 className="section-label">网站规则</h3>{Object.entries(settings.sites).map(([origin, enabled]) => <div key={origin}><span title={origin}>{origin}</span><button disabled={busy} className="text-button" onClick={() => toggleSite(origin, enabled)}>{enabled ? '已启用 · 点击关闭' : '已关闭 · 点击启用'}</button></div>)}</div>}</section>
    <section className="panel settings-panel"><div className="panel-heading"><span className="section-label">TRANSLATION</span><h2>翻译服务</h2><p>配置兼容 OpenAI 格式的服务，用于句子翻译与双语阅读。</p></div><form onSubmit={e => { e.preventDefault(); void act(async () => { await rpc('settings.update', { api: await authorizedApi() }); setNotice('翻译服务设置已保存。'); }); }}><label>API 根地址<input type="url" required autoComplete="off" placeholder="https://your-provider.example/v1" value={api.baseUrl} onChange={e => { setApi({ ...api, baseUrl: e.target.value }); setTestResult(''); }}/><span className="hint">填写服务的根地址，不包含 /chat/completions。</span></label><label>API Key<div className="key-field"><input aria-label="API Key" type={showKey ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={api.apiKey} onChange={e => { setApi({ ...api, apiKey: e.target.value }); setTestResult(''); }} placeholder="输入你的 API Key"/><button type="button" className="text-button" onClick={() => setShowKey(!showKey)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>{showKey ? '隐藏' : '显示'}</button></div></label><label>模型名称<input required autoComplete="off" placeholder="填写服务提供的模型标识" value={api.model} onChange={e => { setApi({ ...api, model: e.target.value }); setTestResult(''); }}/></label><div className="button-row"><button type="submit" className="primary" disabled={busy}>保存服务配置</button><button type="button" className="secondary" disabled={busy} onClick={() => void act(async () => { setTestResult(''); const result = await rpc('translation.test', { api: await authorizedApi() }); setTestResult(`连接成功：${result}`); })}>{busy ? '处理中…' : '测试连接'}</button></div></form>{notice && <p className="success-message" role="status">{notice}</p>}{testResult && <p className="success-message" role="status">{testResult}</p>}<p className="hint privacy-note">密钥仅存放在此设备的扩展设置中。使用翻译功能时，选中的文字或页面句子会发送至你配置的服务。</p></section>
    <section className="panel settings-panel"><div className="panel-heading"><span className="section-label">APPEARANCE</span><h2>外观</h2></div><div className="theme-options">{(['system', 'light', 'dark'] as const).map(theme => <button disabled={busy} key={theme} aria-pressed={settings.theme === theme} className={settings.theme === theme ? 'selected' : ''} onClick={() => void update({ theme })}><span aria-hidden="true">{theme === 'system' ? '◐' : theme === 'light' ? '☼' : '☾'}</span>{theme === 'system' ? '跟随系统' : theme === 'light' ? '浅色' : '深色'}</button>)}</div></section>
    <section className="panel settings-panel"><div className="panel-heading"><span className="section-label">LOCAL DICTIONARY</span><h2>本地词典</h2></div><p className="dictionary-state"><i className={progress?.state === 'ready' ? 'ready' : ''}/>{progress?.state === 'ready' ? `词典已就绪 · ${(progress.count ?? 0).toLocaleString()} 个词条` : progress?.state === 'error' ? '词典加载失败' : '正在准备词典…'}</p><p className="hint">查词和生词高亮在本地完成。词典就绪后不需要翻译服务。</p>{progress?.state === 'error' && <button disabled={busy} className="secondary" onClick={() => void act(() => rpc('dictionary.retry'))}>重新加载词典</button>}</section>
  </div>;
}
