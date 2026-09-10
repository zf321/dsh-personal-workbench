/**
 * dsh-personal-workbench DB schema（对应 docs/DSH个人工作台/01_数据模型.md）
 * 迁移只前向；所有“枚举”都走 dictionaries 表。
 */
import type { DatabaseSync } from 'node:sqlite';
export declare const SCHEMA_VERSION = 15;
export interface Migration {
    version: number;
    name: string;
    up(db: DatabaseSync): void;
}
export declare const MIGRATIONS: Migration[];
