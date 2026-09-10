import type { DatabaseSync } from 'node:sqlite';
import { type DraftRow, type TaskRow } from '../repo.js';
export interface IdeaInput {
    title: string;
    contentMd?: string;
    kindCode?: string;
    tags?: string[];
    sourceSessionId?: string | null;
}
export interface IdeaRow {
    id: string;
    title: string;
    contentMd: string;
    kindCode: string;
    tags: string[];
    sourceSessionId: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface IdeaClusterInput {
    title: string;
    summaryMd?: string;
    tags?: string[];
    ideaIds?: string[];
    notes?: Record<string, string>;
}
export interface IdeaClusterRow {
    id: string;
    title: string;
    summaryMd: string;
    tags: string[];
    ideas: IdeaRow[];
    createdAt: string;
    updatedAt: string;
}
export declare function createIdea(db: DatabaseSync, input: IdeaInput, at?: string): IdeaRow;
export declare function getIdea(db: DatabaseSync, id: string): IdeaRow | undefined;
export declare function listIdeas(db: DatabaseSync, opts?: {
    q?: string;
    kindCode?: string;
    limit?: number;
}): IdeaRow[];
export declare function updateIdea(db: DatabaseSync, id: string, patch: Partial<IdeaInput>, at?: string): IdeaRow | undefined;
export declare function deleteIdea(db: DatabaseSync, id: string): boolean;
export declare function createIdeaCluster(db: DatabaseSync, input: IdeaClusterInput, at?: string): IdeaClusterRow;
export declare function getIdeaCluster(db: DatabaseSync, id: string): IdeaClusterRow | undefined;
export declare function listIdeaClusters(db: DatabaseSync, opts?: {
    limit?: number;
}): IdeaClusterRow[];
export declare function deleteIdeaCluster(db: DatabaseSync, id: string): boolean;
export declare function listIdeaClustersForIdea(db: DatabaseSync, ideaId: string): IdeaClusterRow[];
export declare function confirmIdeaClusterDraft(db: DatabaseSync, draftId: string, actor?: string, at?: string): IdeaClusterRow[];
export declare function confirmIdeaTaskDraft(db: DatabaseSync, draftId: string, actor?: string, at?: string): TaskRow[];
export declare function getPendingDraftForSession(db: DatabaseSync, sessionId: string | null, kindCode: string): DraftRow | undefined;
