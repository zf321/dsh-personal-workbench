import type { DatabaseSync } from 'node:sqlite';
export interface AiSessionRegistryInput {
    scopeCode: string;
    anchor: string;
    sessionId: string;
    workspace?: string | null;
    note?: string | null;
}
export interface AiSessionRegistryRow {
    scopeCode: string;
    anchor: string;
    sessionId: string;
    workspace: string | null;
    note: string | null;
    createdAt: string;
    lastActivityAt: string;
}
export declare function getAiSession(db: DatabaseSync, scopeCode: string, anchor: string): AiSessionRegistryRow | undefined;
/** 登记或刷新复用型 AI 会话；同 scope+anchor 只保留一条。 */
export declare function registerAiSession(db: DatabaseSync, input: AiSessionRegistryInput, at?: string): AiSessionRegistryRow;
