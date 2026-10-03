// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyCard } from 'ts-fsrs';
import type { ReviewItem } from '../src/shared/types';
import { ReviewPage } from '../src/ui/ReviewPage';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock('../src/shared/client', () => ({ rpc: rpcMock }));
// Review behavior is independent of extension messaging used by common UI hooks.
vi.mock('../src/ui/common', async () => {
  const { createElement } = await import('react');
  return {
    errorText: (error: unknown) => error instanceof Error ? error.message : String(error),
    Empty: ({ title }: { title: string }) => createElement('p', null, title),
    SourceLink: () => null,
  };
});

function reviewItem(id: string, word: string): ReviewItem {
  return {
    vocabulary: { id, word, meaning: '中文释义', phonetic: '', status: 'learning', language: 'en', kind: 'word', createdAt: 0, updatedAt: 0 },
    examples: [], card: createEmptyCard(new Date(0)), token: 123,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  rpcMock.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(text: string) {
  const result = [...container.querySelectorAll('button')].find(element => element.textContent?.includes(text));
  if (!result) throw new Error(`Missing button: ${text}`);
  return result;
}

async function click(text: string) {
  await act(async () => { button(text).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

async function mount() {
  const pending = { current: false };
  const onError = vi.fn();
  const next = reviewItem('next', 'remember');
  const refresh = vi.fn(async () => {
    root.render(createElement(ReviewPage, { queue: [next], refresh, pending, onError }));
  });
  await act(async () => root.render(createElement(ReviewPage, {
    queue: [reviewItem('first', 'curious')], refresh, pending, onError,
  })));
  await click('显示答案');
  return { pending, refresh, onError };
}

describe('review submission recovery', () => {
  it.each([
    '该词汇已被删除。',
    '该词汇已掌握，无需复习。',
    '这张卡已在其他页面复习，请刷新队列。',
    '今日已学习 20 个新词，明天继续。',
  ])('unblocks review and shows the refreshed queue after definitive rejection: %s', async message => {
    rpcMock.mockRejectedValueOnce(new Error(message));
    const { pending, refresh, onError } = await mount();

    await click('记得');

    expect(pending.current).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('h2')?.textContent).toBe('remember');
    expect(container.textContent).not.toContain('重试提交');
    expect(button('显示答案').disabled).toBe(false);
    expect(onError).toHaveBeenLastCalledWith(expect.stringContaining(message));
  });

  it('retries a transient failure with the same operation ID and releases pending after success', async () => {
    rpcMock.mockRejectedValueOnce(new Error('后台暂时未响应')).mockResolvedValueOnce({});
    const { pending, refresh } = await mount();

    await click('记得');
    const firstSubmission = rpcMock.mock.calls[0]?.[1];
    expect(firstSubmission).toMatchObject({ vocabularyId: 'first', token: 123, rating: 3, operationId: expect.any(String) });
    expect(pending.current).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    expect(button('重试提交').disabled).toBe(false);

    await click('重试提交');

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[1]?.[0]).toBe('review.rate');
    expect(rpcMock.mock.calls[1]?.[1]).toEqual(firstSubmission);
    expect(pending.current).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('h2')?.textContent).toBe('remember');
    expect(container.textContent).not.toContain('重试提交');
  });
});
