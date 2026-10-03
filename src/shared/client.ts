import { browser } from 'wxt/browser';
import type { Method, Methods, Response } from './messages';
export async function rpc<M extends Method>(method: M, ...args: Methods[M]['input'] extends undefined ? [input?: undefined] : [input: Methods[M]['input']]): Promise<Methods[M]['output']> {
  const result = await browser.runtime.sendMessage({ channel: 'culingo', method, input: args[0] }) as Response<Methods[M]['output']>;
  if (!result?.ok) throw new Error(result?.error || '扩展后台未响应，请重新加载扩展。');
  return result.data;
}
