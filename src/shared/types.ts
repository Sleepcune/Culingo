export type WordStatus = 'learning' | 'mastered';
export interface DictionaryEntry { word: string; phonetic: string; definition: string; translation: string; pos: string; rank: number; }
export interface WordIndex { ranks: Record<string, number>; forms: Record<string, string>; }
export interface Vocabulary { id: string; language: 'en'; kind: 'word' | 'phrase'; word: string; meaning: string; phonetic: string; status: WordStatus; createdAt: number; updatedAt: number; }
export interface Example { id: string; vocabularyId: string; text: string; translation?: string; url: string; title: string; createdAt: number; }
export interface ReviewCard { vocabularyId: string; card: import('ts-fsrs').Card; }
export interface ReviewLog { id: string; vocabularyId: string; rating: number; reviewedAt: number; log: import('ts-fsrs').ReviewLog; }
export interface ApiConfig { baseUrl: string; apiKey: string; model: string; }
export interface Settings { enabled: boolean; level: 3000 | 5000 | 8000; allSites: boolean; sites: Record<string, boolean>; theme: 'system' | 'light' | 'dark'; api: ApiConfig; }
export interface PublicSettings extends Omit<Settings, 'api'> { apiConfigured: boolean; }
export interface DictionaryProgress { state: 'idle' | 'loading' | 'ready' | 'error'; completed: number; total: number; error?: string; count?: number; }
export interface ReadingState { siteAuthorized:boolean; settings: PublicSettings; index: WordIndex; statuses: Record<string, WordStatus>; progress: DictionaryProgress; }
export interface VocabularyDetail extends Vocabulary { examples: Example[]; due?: number; }
export interface ReviewItem { vocabulary: Vocabulary; examples: Example[]; card: ReviewCard['card']; token: number; }
export interface Stats { learning: number; mastered: number; due: number; reviewedToday: number; newToday: number; }
export interface Backup { version: 1; exportedAt: number; vocabulary: Vocabulary[]; examples: Example[]; cards: ReviewCard[]; logs: ReviewLog[]; settings?: Omit<Settings, 'api'>; }
export interface ImportPreview { valid: number; duplicates: number; invalid: number; backup: Backup; }
export interface SaveWord { word: string; meaning?: string; phonetic?: string; kind?: 'word' | 'phrase'; example?: { text: string; translation?: string; url: string; title: string }; }
export interface TranslationResult { text: string; cached: boolean; }
export interface Diagnostics { id?: number; at: number; code: string; duration?: number; }
export interface CacheEntry { key: string; text: string; bytes: number; accessedAt: number; }
