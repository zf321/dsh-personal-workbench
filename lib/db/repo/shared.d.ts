/**
 * repo 层共享原语：时间、草稿行类型与读取、草稿确认骨架。
 *
 * 从 repo.ts 原样抽出（行为不变）。各领域模块依赖本文件；repo.ts 再导出以保持对外 API。
 * 本文件不依赖任何其他 repo 模块，避免循环依赖。
 */
import type { DatabaseSync } from 'node:sqlite';
export declare const nowIso: () => string;
export interface DraftRow {
    id: string;
    kindCode: string;
    sessionId: string | null;
    payload: Record<string, unknown>;
    statusCode: string;
    /** 非空表示该草稿已「暂存」：仍是 pending，但不再自动弹窗 */
    deferredAt: string | null;
    /** 累计暂存次数（用于展示"第 N 次"） */
    deferCount: number;
    createdAt: string;
    updatedAt: string;
}
export interface RawDraftRow {
    id: string;
    kind_code: string;
    session_id: string | null;
    payload_json: string;
    status_code: string;
    deferred_at?: string | null;
    defer_count?: number | null;
    created_at: string;
    updated_at: string;
}
export declare function parseDraft(row: RawDraftRow | undefined): DraftRow | undefined;
export declare function getDraft(db: DatabaseSync, id: string): DraftRow | undefined;
export declare function setDraftStatus(db: DatabaseSync, id: string, statusCode: string, at?: string): void;
/**
 * 草稿确认的公共骨架：取草稿 → 校验 kind → 开事务 → 执行业务 → 标记 confirmed → 提交/回滚。
 *
 * 抽出来的原因：7 个 confirm*Draft 曾各自重复这 6 步（连 ROLLBACK 分支都一字不差），
 * 任何一步改动都要改 7 处。现在各函数只负责"确认时具体建什么"。
 *
 * @param kindCode 期望的草稿类型；不匹配返回 undefined（保持既有语义）
 * @param emptyValue kind 匹配但业务产出为空时的返回值（部分函数历史上返回 [] 而非 undefined）
 */
export declare function withDraftConfirm<T>(db: DatabaseSync, draftId: string, kindCode: string, build: (draft: DraftRow) => T, options: {
    at?: string;
    emptyValue: T;
}): T;
export declare function withDraftConfirm<T>(db: DatabaseSync, draftId: string, kindCode: string, build: (draft: DraftRow) => T, options?: {
    at?: string;
}): T | undefined;
