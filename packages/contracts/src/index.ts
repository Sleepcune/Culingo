import type { Card, ReviewLog } from 'ts-fsrs';

export type WordStatus = 'learning' | 'mastered';
export interface DictionaryEntry { word: string; phonetic: string; definition: string; translation: string; pos: string; rank: number; }
export interface WordIndex { ranks: Record<string, number>; forms: Record<string, string>; }
export interface TranslationResult { text: string; cached: boolean; }
export interface MeaningOverride { word: string; meaning: string; source: 'ai' | 'user'; model?: string; updatedAt: number; }
export interface ReviewCardContract { vocabularyId: string; card: Card; }
export interface ReviewLogContract { id: string; vocabularyId: string; rating: number; reviewedAt: number; log: ReviewLog; }
