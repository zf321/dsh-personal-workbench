import type { DatabaseSync } from 'node:sqlite';
export interface TaskMemoryInput {
    taskId: string;
    kind?: string;
    content: string;
    sourceSessionId?: string | null;
}
export interface TaskMemoryRow {
    id: string;
    rootTaskId: string;
    taskId: string;
    kind: string;
    content: string;
    sourceSessionId: string | null;
    createdAt: string;
    updatedAt: string;
}
export declare function getTaskRootId(db: DatabaseSync, taskId: string): string | undefined;
export declare function getTaskMemory(db: DatabaseSync, id: string): TaskMemoryRow | undefined;
export declare function listTaskMemories(db: DatabaseSync, opts?: {
    rootTaskId?: string;
    taskId?: string;
    limit?: number;
}): TaskMemoryRow[];
export declare function addTaskMemory(db: DatabaseSync, input: TaskMemoryInput, at?: string): TaskMemoryRow | undefined;
/** 格式化任务共享记忆，用于注入 AI 会话 prompt。按整棵任务树（root）共享。 */
export declare function getTaskMemoryContext(db: DatabaseSync, taskId: string, limit?: number): string;
