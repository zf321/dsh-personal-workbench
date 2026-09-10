import type { DatabaseSync } from 'node:sqlite';
import { type DraftRow } from '../repo.js';
export interface KnowledgeInput {
    kindCode?: string;
    title: string;
    contentMd?: string;
    tags?: string[];
    sourceTaskId?: string | null;
    sourceSessionId?: string | null;
    sourceReviewId?: string | null;
    fileLink?: string | null;
}
export interface KnowledgeRow {
    id: string;
    kindCode: string;
    title: string;
    contentMd: string;
    tags: string[];
    sourceTaskId: string | null;
    sourceSessionId: string | null;
    sourceReviewId: string | null;
    fileLink: string | null;
    createdAt: string;
    updatedAt: string;
}
/** 校验并规整知识条目本地文件链接：支持 file:// URL 或绝对路径，拒绝相对路径/空值。 */
export declare function normalizeFileLink(value: string | null | undefined): string | null;
export declare function assertValidFileLink(value: string | null | undefined): string | null;
export declare function createKnowledge(db: DatabaseSync, input: KnowledgeInput, at?: string): KnowledgeRow;
export declare function getKnowledge(db: DatabaseSync, id: string): KnowledgeRow | undefined;
export declare function listKnowledge(db: DatabaseSync, opts?: {
    q?: string;
    kindCode?: string;
    sourceTaskId?: string;
    sourceReviewId?: string;
    limit?: number;
}): KnowledgeRow[];
export declare function updateKnowledge(db: DatabaseSync, id: string, patch: Partial<KnowledgeInput>, at?: string): KnowledgeRow | undefined;
export declare function deleteKnowledge(db: DatabaseSync, id: string): boolean;
export declare function confirmKnowledgeDraft(db: DatabaseSync, draftId: string, actor?: string, at?: string): KnowledgeRow | undefined;
export declare function getPendingKnowledgeDraft(db: DatabaseSync, sessionId: string | null): DraftRow | undefined;
