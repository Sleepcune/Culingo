// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), start: vi.fn(), stop: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { runtime: { onMessage: { addListener: mocks.addListener, removeListener: mocks.removeListener } } } }));
vi.mock('../src/shared/client', () => ({ rpc: mocks.rpc }));
vi.mock('../src/content/card', () => ({ ReadingCard: class {
  constructor() { mocks.start(); }
  toolbar() {} clearToolbar() {} theme() {} destroy() { mocks.stop(); }
} }));
vi.mock('../src/content/translation', () => ({ PageTranslation: class { stop() {} } }));
import { Reader } from '../src/content/reader';
let reader: Reader | undefined;
afterEach(() => { reader?.destroy(); reader = undefined; vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('resumes reading after a page is restored from the browser back-forward cache', async () => {
  vi.stubGlobal('CSS', {});
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  document.body.innerHTML = '<p>A resilient ecosystem.</p>';
  mocks.rpc.mockResolvedValue({ siteAuthorized:true, settings: { enabled: true, allSites: true, sites: {}, theme: 'system', level: 5000 }, index: { ranks: {}, forms: {} }, statuses: {} });
  reader = new Reader();
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(1));
  window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
  expect(mocks.stop).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledTimes(2));
});
it('stops an already active reader when its host permission is revoked',async()=>{
  vi.stubGlobal('CSS', {});
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  document.body.innerHTML='<p>A resilient ecosystem.</p>';
  const state={siteAuthorized:true,settings:{enabled:true,allSites:true,sites:{},theme:'system',level:5000},index:{ranks:{},forms:{}},statuses:{}};
  mocks.rpc.mockResolvedValue(state);reader=new Reader();
  await vi.waitFor(()=>expect(mocks.start).toHaveBeenCalledTimes(1));
  mocks.rpc.mockResolvedValue({...state,siteAuthorized:false});
  const listener=mocks.addListener.mock.calls[0]![0];
  listener({channel:'culingo-event',type:'changed'},undefined,vi.fn());
  await vi.waitFor(()=>expect(mocks.stop).toHaveBeenCalledTimes(1));
  expect(mocks.start).toHaveBeenCalledTimes(1);
});
