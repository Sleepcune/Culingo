import { describe, expect, it } from 'vitest';
import { splitText } from '../src';

describe('@culingo/translation', () => {
  it('splits long text on sentence boundaries without splitting surrogate pairs', () => {
    const parts = splitText('A'.repeat(900) + '. ' + '😀'.repeat(1100));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe('A'.repeat(900) + '. ' + '😀'.repeat(1100));
  });
});
