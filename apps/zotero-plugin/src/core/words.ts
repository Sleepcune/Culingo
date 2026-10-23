import { lemma as sharedLemma, normalizeWord as sharedNormalizeWord, shouldHighlight as sharedShouldHighlight, wordStatus as sharedWordStatus } from '@culingo/core';
import type { WordIndex, WordStatus } from '@culingo/contracts';

export const normalizeWord = sharedNormalizeWord;
export const lemma = sharedLemma;
export const wordStatus = sharedWordStatus;
export function shouldHighlight(text: string, index: WordIndex, statuses: Record<string, WordStatus>, level: number): boolean {
  return sharedShouldHighlight(text, index, statuses, level, { ignore: surface => surface.length === 1 && !/^[ai]$/.test(surface) });
}
