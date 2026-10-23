export interface DictionaryChunk { file: string; count: number; sha256: string; }
export interface DictionaryManifest { version: string; source: string; sourceSha256: string; indexSha256: string; count: number; chunks: DictionaryChunk[]; }
export const DICTIONARY_ASSET_ROOT = 'dictionary';
