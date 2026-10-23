import { describe, expect, it } from 'vitest';
import { lemma, normalizeWord, parseCsv, shouldHighlight } from '../src';

describe('@culingo/core', () => {
  it('normalizes and resolves inflected words', () => {
    const index = { ranks: { run: 100 }, forms: { running: 'run' } };
    expect(normalizeWord('  Runn­ing  ')).toBe('running');
    expect(lemma('running', index)).toBe('run');
  });
  it('preserves CSV quoted newlines', () => {
    expect(parseCsv('word,meaning\nalpha,"a\nb"')).toEqual([['word', 'meaning'], ['alpha', 'a\nb']]);
  });
  it('allows platform-specific token filters without duplicating the rule', () => {
    const index = { ranks: { alpha: 9000 }, forms: {} };
    expect(shouldHighlight('alpha', index, {}, 5000)).toBe(true);
    expect(shouldHighlight('x', index, {}, 5000, { ignore: surface => surface.length === 1 })).toBe(false);
  });
});
