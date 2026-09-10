import type { DatabaseSync } from 'node:sqlite';
export declare const RECURRENCE_BACKFILL_LIMIT = 100;
/** 把重复模板到期实例补齐到 today；单次最多补 RECURRENCE_BACKFILL_LIMIT 条，剩余下一请求继续。 */
export declare function ensureRecurringInstances(db: DatabaseSync, today?: string, at?: string): number;
