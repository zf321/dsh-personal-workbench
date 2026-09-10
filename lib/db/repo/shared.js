export const nowIso = () => new Date().toISOString();
export function parseDraft(row) {
    if (row === undefined)
        return undefined;
    return {
        id: row.id,
        kindCode: row.kind_code,
        sessionId: row.session_id,
        payload: JSON.parse(row.payload_json),
        statusCode: row.status_code,
        deferredAt: row.deferred_at ?? null,
        deferCount: row.defer_count ?? 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
export function getDraft(db, id) {
    return parseDraft(db.prepare('SELECT * FROM task_drafts WHERE id = ?').get(id));
}
export function setDraftStatus(db, id, statusCode, at = nowIso()) {
    db.prepare('UPDATE task_drafts SET status_code = ?, updated_at = ? WHERE id = ?').run(statusCode, at, id);
}
export function withDraftConfirm(db, draftId, kindCode, build, options = {}) {
    const at = options.at ?? nowIso();
    const draft = getDraft(db, draftId);
    if (draft === undefined || draft.kindCode !== kindCode)
        return options.emptyValue;
    db.exec('BEGIN');
    try {
        const result = build(draft);
        setDraftStatus(db, draftId, 'confirmed', at);
        db.exec('COMMIT');
        return result;
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
