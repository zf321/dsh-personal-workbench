/**
 * meta 键值设置（默认工作区、提醒策略等）。
 *
 * 从 repo.ts 原样抽出（行为不变）。对外符号由 repo.ts 再导出。
 */
import type { DatabaseSync } from 'node:sqlite';
export declare function readMeta(db: DatabaseSync, key: string): string | undefined;
export declare function writeMeta(db: DatabaseSync, key: string, value: string): void;
