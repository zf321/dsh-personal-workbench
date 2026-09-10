/**
 * 知识库域（V2.5：个人知识库 / 错题集）。
 *
 * 从 repo.ts 原样抽出（行为不变）。对外符号由 repo.ts 再导出，调用方无需改 import。
 */
import { randomUUID } from 'node:crypto';
import { nowIso, getDraft, withDraftConfirm } from '../repo.js';
import { parseDraft } from './shared.js';
/** 校验并规整知识条目本地文件链接：支持 file:// URL 或绝对路径，拒绝相对路径/空值。 */
export function normalizeFileLink(value) {
    if (value === undefined || value === null)
        return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}
export function assertValidFileLink(value) {
    const link = normalizeFileLink(value);
    if (link === null)
        return null;
    if (!/^file:/i.test(link) && !/^[A-Za-z]:[\\/]/.test(link) && !link.startsWith('/')) {
        throw new Error('fileLink must be a file:// URL or an absolute path');
    }
    return link;
}
function parseKnowledge(row) {
    if (row === undefined)
        return undefined;
    const tags = JSON.parse(row.tags_json);
    return {
        id: row.id,
        kindCode: row.kind_code,
        title: row.title,
        contentMd: row.content_md,
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : [],
        sourceTaskId: row.source_task_id,
        sourceSessionId: row.source_session_id,
        sourceReviewId: row.source_review_id,
        fileLink: row.file_link ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
export function createKnowledge(db, input, at = nowIso()) {
    const id = randomUUID();
    const fileLink = assertValidFileLink(input.fileLink);
    db.prepare(`
    INSERT INTO knowledge_entries (id, kind_code, title, content_md, tags_json, source_task_id, source_session_id, source_review_id, file_link, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.kindCode ?? 'note', input.title, input.contentMd ?? '', JSON.stringify(input.tags ?? []), input.sourceTaskId ?? null, input.sourceSessionId ?? null, input.sourceReviewId ?? null, fileLink, at, at);
    return getKnowledge(db, id);
}
export function getKnowledge(db, id) {
    return parseKnowledge(db.prepare('SELECT * FROM knowledge_entries WHERE id = ?').get(id));
}
export function listKnowledge(db, opts = {}) {
    const conditions = [];
    const params = [];
    if (opts.kindCode !== undefined) {
        conditions.push('kind_code = ?');
        params.push(opts.kindCode);
    }
    if (opts.sourceTaskId !== undefined) {
        conditions.push('source_task_id = ?');
        params.push(opts.sourceTaskId);
    }
    if (opts.sourceReviewId !== undefined) {
        conditions.push('source_review_id = ?');
        params.push(opts.sourceReviewId);
    }
    if (typeof opts.q === 'string' && opts.q.trim() !== '') {
        const like = `%${opts.q.trim()}%`;
        conditions.push('(title LIKE ? OR content_md LIKE ? OR tags_json LIKE ? OR file_link LIKE ?)');
        params.push(like, like, like, like);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(opts.limit ?? 200, 500));
    const rows = db.prepare(`SELECT * FROM knowledge_entries ${where} ORDER BY updated_at DESC, created_at DESC LIMIT ?`).all(...params, limit);
    return rows.map((row) => parseKnowledge(row)).filter((entry) => entry !== undefined);
}
export function updateKnowledge(db, id, patch, at = nowIso()) {
    const before = getKnowledge(db, id);
    if (before === undefined)
        return undefined;
    const next = {
        ...before,
        kindCode: patch.kindCode ?? before.kindCode,
        title: patch.title ?? before.title,
        contentMd: patch.contentMd ?? before.contentMd,
        tags: patch.tags ?? before.tags,
        sourceTaskId: patch.sourceTaskId === undefined ? before.sourceTaskId : patch.sourceTaskId,
        sourceSessionId: patch.sourceSessionId === undefined ? before.sourceSessionId : patch.sourceSessionId,
        sourceReviewId: patch.sourceReviewId === undefined ? before.sourceReviewId : patch.sourceReviewId,
        fileLink: patch.fileLink === undefined ? before.fileLink : assertValidFileLink(patch.fileLink),
        updatedAt: at,
    };
    db.prepare(`
    UPDATE knowledge_entries SET kind_code = ?, title = ?, content_md = ?, tags_json = ?, source_task_id = ?, source_session_id = ?, source_review_id = ?, file_link = ?, updated_at = ?
    WHERE id = ?
  `).run(next.kindCode, next.title, next.contentMd, JSON.stringify(next.tags), next.sourceTaskId, next.sourceSessionId, next.sourceReviewId, next.fileLink, next.updatedAt, id);
    return next;
}
export function deleteKnowledge(db, id) {
    return db.prepare('DELETE FROM knowledge_entries WHERE id = ?').run(id).changes > 0;
}
export function confirmKnowledgeDraft(db, draftId, actor = 'user', at = nowIso()) {
    const draft = getDraft(db, draftId);
    if (draft === undefined || draft.kindCode !== 'knowledge')
        return undefined;
    const payload = draft.payload;
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (title === '')
        throw new Error('knowledge requires a non-empty title');
    const contentMd = typeof payload.contentMd === 'string' ? payload.contentMd : '';
    if (contentMd.trim() === '')
        throw new Error('knowledge requires content');
    return withDraftConfirm(db, draftId, 'knowledge', () => createKnowledge(db, {
        kindCode: payload.kindCode ?? 'note',
        title,
        contentMd,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        sourceTaskId: typeof payload.sourceTaskId === 'string' ? payload.sourceTaskId : null,
        sourceSessionId: typeof payload.sourceSessionId === 'string' ? payload.sourceSessionId : draft.sessionId,
        sourceReviewId: typeof payload.sourceReviewId === 'string' ? payload.sourceReviewId : null,
        fileLink: typeof payload.fileLink === 'string' ? payload.fileLink : null,
    }, at), { at });
}
export function getPendingKnowledgeDraft(db, sessionId) {
    if (sessionId === null || sessionId === undefined)
        return undefined;
    const rows = db.prepare("SELECT * FROM task_drafts WHERE status_code = 'pending' AND kind_code = 'knowledge' ORDER BY created_at DESC").all();
    for (const row of rows) {
        if (row.session_id !== sessionId)
            continue;
        // 统一走 parseDraft，避免新增草稿字段时各处手写映射漏字段。
        return parseDraft(row);
    }
    return undefined;
}
