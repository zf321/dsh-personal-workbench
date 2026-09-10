import type { DatabaseSync } from 'node:sqlite';
import { type DictionaryEntry } from '../repo.js';
export declare function listDictionaries(db: DatabaseSync, kind?: string): DictionaryEntry[];
export declare function getDictionary(db: DatabaseSync, kind: string, code: string): DictionaryEntry | undefined;
export declare function createDictionaryEntry(db: DatabaseSync, input: {
    kind: string;
    code: string;
    name: string;
    config?: Record<string, unknown>;
    sortOrder?: number;
    builtin?: number | boolean;
    active?: number | boolean;
}, at?: string): DictionaryEntry;
export declare function updateDictionaryEntry(db: DatabaseSync, kind: string, code: string, input: {
    name?: string;
    config?: Record<string, unknown>;
    sortOrder?: number;
    active?: number | boolean;
}, at?: string): DictionaryEntry;
export declare function deleteDictionaryEntry(db: DatabaseSync, kind: string, code: string): void;
export declare function dictionaryUsageCount(db: DatabaseSync, kind: string, code: string): number;
