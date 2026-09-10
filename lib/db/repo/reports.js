/**
 * 日报 / 周报域（V2）。
 *
 * 从 repo.ts 原样抽出（行为不变）。对外符号由 repo.ts 再导出。
 */
import { randomUUID } from 'node:crypto';
import { nowIso, getDraft, withDraftConfirm } from '../repo.js';
import { parseDraft } from './shared.js';
function parseTaskReport(row) {
    if (row === undefined)
        return undefined;
    const stats = JSON.parse(row.stats_json);
    return {
        id: row.id,
        periodCode: row.period_code,
        periodStart: row.period_start,
        title: row.title,
        summaryMd: row.summary_md,
        stats: typeof stats === 'object' && stats !== null ? stats : {},
        sessionId: row.session_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
/** 同一周期（日报按天 / 周报按周）只保留一份，重复保存即覆盖。 */
export function saveTaskReport(db, input, at = nowIso()) {
    const id = randomUUID();
    db.prepare(`
    INSERT INTO task_reports (id, period_code, period_start, title, summary_md, stats_json, session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(period_code, period_start) DO UPDATE SET
      title = excluded.title,
      summary_md = excluded.summary_md,
      stats_json = excluded.stats_json,
      session_id = excluded.session_id,
      updated_at = excluded.updated_at
  `).run(id, input.periodCode, input.periodStart, input.title, input.summaryMd, JSON.stringify(input.stats ?? {}), input.sessionId ?? null, at, at);
    return getTaskReport(db, input.periodCode, input.periodStart);
}
export function getTaskReport(db, periodCode, periodStart) {
    return parseTaskReport(db.prepare('SELECT * FROM task_reports WHERE period_code = ? AND period_start = ?').get(periodCode, periodStart));
}
export function listTaskReports(db, opts = {}) {
    const rows = (opts.periodCode === undefined
        ? db.prepare('SELECT * FROM task_reports ORDER BY period_start DESC, created_at DESC LIMIT ?').all(opts.limit ?? 200)
        : db.prepare('SELECT * FROM task_reports WHERE period_code = ? ORDER BY period_start DESC, created_at DESC LIMIT ?').all(opts.periodCode, opts.limit ?? 200));
    return rows.map((row) => parseTaskReport(row)).filter((report) => report !== undefined);
}
export function deleteTaskReport(db, periodCode, periodStart) {
    return db.prepare('DELETE FROM task_reports WHERE period_code = ? AND period_start = ?').run(periodCode, periodStart).changes > 0;
}
export function confirmReportDraft(db, draftId, at = nowIso()) {
    const draft = getDraft(db, draftId);
    if (draft === undefined || draft.kindCode !== 'report')
        return undefined;
    const payload = draft.payload;
    if (payload.periodCode !== 'day' && payload.periodCode !== 'week')
        throw new Error('report requires periodCode "day" or "week"');
    if (typeof payload.periodStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(payload.periodStart))
        throw new Error('report requires a valid periodStart (YYYY-MM-DD)');
    const title = typeof payload.title === 'string' && payload.title.trim() !== '' ? payload.title : payload.periodCode === 'day' ? `${payload.periodStart} 日报` : `${payload.periodStart} 周报`;
    const summaryMd = typeof payload.summaryMd === 'string' ? payload.summaryMd : '';
    if (summaryMd.trim() === '')
        throw new Error('report requires summary_md');
    return withDraftConfirm(db, draftId, 'report', () => saveTaskReport(db, {
        periodCode: payload.periodCode,
        periodStart: payload.periodStart,
        title,
        summaryMd,
        stats: payload.stats ?? {},
        sessionId: draft.sessionId,
    }, at), { at });
}
export function getPendingReportDraft(db, sessionId, periodCode, periodStart) {
    if (sessionId === null || sessionId === undefined)
        return undefined;
    const rows = db.prepare("SELECT * FROM task_drafts WHERE status_code = 'pending' AND kind_code = 'report' ORDER BY created_at DESC").all();
    for (const row of rows) {
        if (row.session_id !== sessionId)
            continue;
        const payload = JSON.parse(row.payload_json);
        if (periodCode !== undefined && payload.periodCode !== periodCode)
            continue;
        if (periodStart !== undefined && payload.periodStart !== periodStart)
            continue;
        return parseDraft(row);
    }
    return undefined;
}
