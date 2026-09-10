/**
 * 任务与会话的关联（澄清/拆解/执行/复盘等会话挂到任务上）。
 *
 * 从 repo.ts 原样抽出（行为不变）。对外符号由 repo.ts 再导出。
 */
import type { DatabaseSync } from 'node:sqlite';
import { type TaskSessionLinkInput } from '../repo.js';
export declare function linkTaskSession(db: DatabaseSync, input: TaskSessionLinkInput, at?: string): void;
export declare function listTaskSessions(db: DatabaseSync, taskId: string): Array<Record<string, unknown>>;
