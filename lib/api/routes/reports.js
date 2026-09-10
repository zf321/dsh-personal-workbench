import { getTaskReport, listTaskReports, deleteTaskReport } from '../../db/repo.js';
import { REPORTS_PREFIX, authenticateWorkbenchRequest, enterWorkbenchAuthContext, pathSegments, reportContext, writeJson } from './helpers.js';
export function makeReportRoutes(db) {
    return [
        {
            kind: 'prefix',
            path: REPORTS_PREFIX,
            handler: async (req, res) => {
                const auth = await authenticateWorkbenchRequest(req);
                if (auth === undefined)
                    return writeJson(res, 401, { error: 'unauthorized: login required' });
                enterWorkbenchAuthContext(auth);
                const url = new URL(req.url ?? '/', 'http://localhost');
                const segments = pathSegments(url, REPORTS_PREFIX);
                const method = req.method ?? 'GET';
                if (segments.length === 0 && method === 'GET') {
                    const periodCode = url.searchParams.get('period_code') ?? undefined;
                    if (periodCode !== undefined && periodCode !== 'day' && periodCode !== 'week')
                        return writeJson(res, 400, { error: 'invalid period_code' });
                    const limitParam = Number(url.searchParams.get('limit') ?? 200);
                    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 500)) : 200;
                    return writeJson(res, 200, { ok: true, reports: listTaskReports(db, { periodCode: periodCode, limit }) });
                }
                if (segments.length === 1 && segments[0] === 'context' && method === 'GET') {
                    const periodCode = url.searchParams.get('period_code');
                    const periodStart = url.searchParams.get('period_start');
                    if (periodCode !== 'day' && periodCode !== 'week')
                        return writeJson(res, 400, { error: 'period_code must be day or week' });
                    if (periodStart === null || periodStart === '')
                        return writeJson(res, 400, { error: 'period_start is required' });
                    const context = reportContext(db, periodCode, periodStart);
                    if (context === undefined)
                        return writeJson(res, 400, { error: 'invalid period_start' });
                    return writeJson(res, 200, { ok: true, context });
                }
                if (segments.length === 2 && method === 'GET') {
                    const [periodCode, periodStart] = segments;
                    if (periodCode !== 'day' && periodCode !== 'week')
                        return writeJson(res, 400, { error: 'invalid period_code' });
                    const report = getTaskReport(db, periodCode, periodStart);
                    return writeJson(res, 200, { ok: true, report: report ?? null });
                }
                if (segments.length === 2 && method === 'DELETE') {
                    const [periodCode, periodStart] = segments;
                    if (periodCode !== 'day' && periodCode !== 'week')
                        return writeJson(res, 400, { error: 'invalid period_code' });
                    return writeJson(res, 200, { ok: true, deleted: deleteTaskReport(db, periodCode, periodStart) });
                }
                return writeJson(res, 404, { error: 'not found' });
            },
        },
    ];
}
