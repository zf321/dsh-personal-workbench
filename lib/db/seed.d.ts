/**
 * 出厂字典种子。INSERT OR IGNORE：首次安装写入，之后用户改名/停用不会被覆盖。
 */
import type { DatabaseSync } from 'node:sqlite';
export interface DictionarySeed {
    kind: string;
    code: string;
    name: string;
    config: Record<string, unknown>;
    sortOrder: number;
}
export declare const DICTIONARY_SEEDS: DictionarySeed[];
export declare function seedDictionaries(db: DatabaseSync, now?: string): void;
