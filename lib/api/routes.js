/**
 * /api/workbench/* 路由入口。Loopback-only 保护（同 dsh-ssh 的信任围栏）。
 *
 * 领域路由已拆分到 routes/：tasks / reminders / drafts / ideas / idea-clusters /
 * knowledge / ai-sessions / reports / plans。本文件保留组合入口与跨领域基础端点
 * （workspaces/ensure、settings、bootstrap、maintenance、health）。
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { ensureRecurringInstances, fireReminder, getDailyPlan, getTask, listDictionaries, listDueReminders, listTasks, localDateString, readMeta, repairParentCompletion, writeMeta, } from '../db/repo.js';
import { makeAiSessionRoutes } from './routes/ai-sessions.js';
import { makeDraftRoutes } from './routes/drafts.js';
import { isInside } from '../tenant/workspace-map.js';
import { authenticateWorkbenchRequest, enterWorkbenchAuthContext, fileBoundaryOf, readJsonBody, todayRange, writeJson } from './routes/helpers.js';
import { makeIdeaClusterRoutes } from './routes/idea-clusters.js';
import { makeIdeaRoutes } from './routes/ideas.js';
import { makeKnowledgeRoutes } from './routes/knowledge.js';
import { makeMcpRoutes } from './routes/mcp.js';
import { makePlanRoutes } from './routes/plans.js';
import { makeReminderRoutes } from './routes/reminders.js';
import { makeReportRoutes } from './routes/reports.js';
import { makeTaskRoutes } from './routes/tasks.js';
/**
 * 插件版本：直接读包内 package.json，避免再出现"代码已升级、health 还报旧版本"的漂移。
 * lib/api/routes.js 相对包根是 ../../package.json。
 */
const PACKAGE_VERSION = (() => {
    try {
        const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
        return pkg.version ?? 'unknown';
    }
    catch {
        return 'unknown';
    }
})();
export function makeRoutes(db, deps = {}) {
    return [
        ...makeReminderRoutes(db, { channel: deps.channel, policy: deps.policy, test: deps.test, listDue: () => listDueReminders(db), fire: (id) => fireReminder(db, id) }),
        // ------------------------------------------------------------------ workspace ensure
        {
            kind: 'exact',
            path: '/api/workbench/workspaces/ensure',
            handler: async (req, res) => {
                const auth = await authenticateWorkbenchRequest(req);
                if (auth === undefined)
                    return writeJson(res, 401, { error: 'unauthorized: login required' });
                enterWorkbenchAuthContext(auth);
                if ((req.method ?? 'GET') !== 'POST')
                    return writeJson(res, 405, { error: 'method not allowed' });
                const body = await readJsonBody(req);
                const path = typeof body?.path === 'string' && body.path.trim() !== '' ? body.path.trim() : undefined;
                if (path === undefined)
                    return writeJson(res, 400, { error: 'path is required' });
                const boundary = fileBoundaryOf(auth);
                if (boundary.mode === 'denied')
                    return writeJson(res, 403, { error: 'no workspace for this account' });
                if (boundary.mode === 'workspace' && !isInside(boundary.root, path))
                    return writeJson(res, 403, { error: 'path is outside your workspace' });
                try {
                    mkdirSync(path, { recursive: true });
                    return writeJson(res, 200, { ok: true, path });
                }
                catch (error) {
                    return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        },
        // ------------------------------------------------------------------ settings
        {
            kind: 'exact',
            path: '/api/workbench/settings',
            handler: async (req, res) => {
                const auth = await authenticateWorkbenchRequest(req);
                if (auth === undefined)
                    return writeJson(res, 401, { error: 'unauthorized: login required' });
                enterWorkbenchAuthContext(auth);
                const method = req.method ?? 'GET';
                const boundary = fileBoundaryOf(auth);
                // 多租户：项目用户未显式设置默认工作区时回退到其工作区（前端据此派生子目录）；
                // 回环/管理员保持空值（由前端回退到当前工作区列表）。
                const defaultWorkspaceOf = (stored) => stored !== '' ? stored : boundary.mode === 'workspace' ? boundary.root : '';
                if (method === 'GET') {
                    return writeJson(res, 200, {
                        ok: true,
                        settings: {
                            defaultWorkspace: defaultWorkspaceOf(readMeta(db, 'ai_default_workspace') ?? ''),
                            autoCreateTypeFolders: (readMeta(db, 'auto_create_type_folders') ?? '1') === '1',
                            desktopNotify: (readMeta(db, 'desktop_notify') ?? '1') === '1',
                        },
                    });
                }
                if (method === 'POST') {
                    const body = await readJsonBody(req);
                    if (body === undefined)
                        return writeJson(res, 400, { error: 'invalid JSON body' });
                    if (typeof body.defaultWorkspace === 'string') {
                        const value = body.defaultWorkspace.trim();
                        if (value !== '') {
                            if (boundary.mode === 'denied')
                                return writeJson(res, 403, { error: 'no workspace for this account' });
                            if (boundary.mode === 'workspace' && !isInside(boundary.root, value))
                                return writeJson(res, 403, { error: 'defaultWorkspace is outside your workspace' });
                        }
                        writeMeta(db, 'ai_default_workspace', value);
                    }
                    if (body.autoCreateTypeFolders === true || body.autoCreateTypeFolders === false)
                        writeMeta(db, 'auto_create_type_folders', body.autoCreateTypeFolders ? '1' : '0');
                    if (body.desktopNotify === true || body.desktopNotify === false)
                        writeMeta(db, 'desktop_notify', body.desktopNotify ? '1' : '0');
                    return writeJson(res, 200, { ok: true, settings: {
                            defaultWorkspace: defaultWorkspaceOf(readMeta(db, 'ai_default_workspace') ?? ''),
                            autoCreateTypeFolders: (readMeta(db, 'auto_create_type_folders') ?? '1') === '1',
                            desktopNotify: (readMeta(db, 'desktop_notify') ?? '1') === '1',
                        } });
                }
                return writeJson(res, 405, { error: 'method not allowed' });
            },
        },
        // ------------------------------------------------------------------ bootstrap
        {
            kind: 'exact',
            path: '/api/workbench/bootstrap',
            async handler(req, res) {
                const auth = await authenticateWorkbenchRequest(req);
                if (auth === undefined)
                    return writeJson(res, 401, { error: 'unauthorized: login required' });
                enterWorkbenchAuthContext(auth);
                const now = new Date();
                const { start, end } = todayRange(now);
                ensureRecurringInstances(db, localDateString(now));
                const tasks = listTasks(db);
                const overdue = tasks.filter((task) => task.statusCode !== 'done' && task.statusCode !== 'cancelled' && task.effectiveDueAt !== null && Date.parse(task.effectiveDueAt) < now.getTime());
                const todayDue = tasks.filter((task) => task.statusCode !== 'done' && task.statusCode !== 'cancelled' && task.effectiveDueAt !== null &&
                    Date.parse(task.effectiveDueAt) >= Date.parse(start) && Date.parse(task.effectiveDueAt) < Date.parse(end));
                const doing = tasks.filter((task) => task.statusCode === 'doing' || task.statusCode === 'blocked');
                const plan = getDailyPlan(db, localDateString(now));
                const planView = plan === undefined ? null : {
                    ...plan,
                    items: plan.items
                        .map((item) => {
                        const task = getTask(db, item.taskId);
                        return task === undefined ? null : { taskId: item.taskId, order: item.order, title: task.title, note: item.note };
                    })
                        .filter((item) => item !== null),
                };
                writeJson(res, 200, {
                    ok: true,
                    dictionaries: listDictionaries(db),
                    stats: { overdue: overdue.length, todayDue: todayDue.length, doing: doing.length, total: tasks.length },
                    todayPlan: planView,
                    now: now.toISOString(),
                });
            },
        },
        ...makeTaskRoutes(db),
        // ------------------------------------------------------------------ maintenance
        {
            kind: 'exact',
            path: '/api/workbench/maintenance/repair-parents',
            handler: async (req, res) => {
                const auth = await authenticateWorkbenchRequest(req);
                if (auth === undefined)
                    return writeJson(res, 401, { error: 'unauthorized: login required' });
                enterWorkbenchAuthContext(auth);
                if ((req.method ?? 'GET') !== 'POST')
                    return writeJson(res, 405, { error: 'method not allowed' });
                try {
                    const changed = repairParentCompletion(db);
                    return writeJson(res, 200, { ok: true, changed });
                }
                catch (error) {
                    return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
                }
            },
        },
        ...makeDraftRoutes(db),
        ...makeIdeaRoutes(db),
        ...makeIdeaClusterRoutes(db),
        ...makeKnowledgeRoutes(db),
        ...makeAiSessionRoutes(db),
        ...makeReportRoutes(db),
        ...makePlanRoutes(db),
        ...makeMcpRoutes(db),
        // ------------------------------------------------------------------ health
        {
            kind: 'exact',
            path: '/api/workbench/health',
            async handler(_req, res) {
                const auth = await authenticateWorkbenchRequest(_req);
                if (auth === undefined)
                    return writeJson(res, 401, { error: 'unauthorized: login required' });
                enterWorkbenchAuthContext(auth);
                const versionRow = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
                writeJson(res, 200, {
                    ok: true,
                    name: '@dely0/dsh-personal-workbench',
                    version: PACKAGE_VERSION,
                    db: {
                        schemaVersion: versionRow?.value ?? 'unknown',
                        taskCount: listTasks(db, { includeArchived: true }).length,
                        dictionaryCount: listDictionaries(db).length,
                    },
                });
            },
        },
    ];
}
