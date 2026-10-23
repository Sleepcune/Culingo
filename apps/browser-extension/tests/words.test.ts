import { describe, it, expect } from 'vitest';
import { normalizeWord, lemma, shouldHighlight } from '../src/core/words';
const index = { ranks: { run: 100, resilient: 9100, unknown: 0 }, forms: { running: 'run', ran: 'run' } };
describe('vocabulary identity and highlighting', () => {
  it('normalizes Unicode apostrophes, case and outer punctuation', () => expect(normalizeWord(' “DON’T” ')).toBe("don't"));
  it('uses dictionary forms without guessing unknown suffixes', () => { expect(lemma('Ran', index)).toBe('run'); expect(lemma('analysis', index)).toBe('analysis'); });
  it('highlights ranked difficult vocabulary only', () => { expect(shouldHighlight('resilient', index, {}, 5000)).toBe(true); expect(shouldHighlight('run', index, {}, 5000)).toBe(false); expect(shouldHighlight('unknown', index, {}, 5000)).toBe(false); });
  it('learning overrides level while mastered overrides learning forms', () => { expect(shouldHighlight('running', index, {run:'learning'}, 5000)).toBe(true); expect(shouldHighlight('Ran', index, {run:'mastered'}, 50)).toBe(false); });
  it('honors an explicitly imported word form before its dictionary lemma',()=>{
    expect(shouldHighlight('Running',index,{running:'learning'},5000)).toBe(true);
    expect(shouldHighlight('running',index,{running:'mastered',run:'learning'},50)).toBe(false);
  });
});
