/**
 * 草稿域：提案草稿的建/读/改，以及把草稿确认成实体。
 *
 * 从 repo.ts 原样抽出（行为不变）。对外符号由 repo.ts 再导出。
 * 草稿行类型与确认骨架在 repo/shared.ts；实体创建分散在各自域。
 */
import { randomUUID } from 'node:crypto';
import { nowIso, getDraft, setDraftStatus, withDraftConfirm, parseDraft } from './shared.js';
import { getTask, listTasks, createTask } from './tasks.js';
import { getDictionary } from './dictionaries.js';
import { linkTaskSession } from './task-sessions.js';
import { addReminder } from './reminders.js';
/**
 * 把草稿里的一个任务节点归一化成 createTask 入参。
 * 三条确认路径（task / subtask_plan / idea_tasks）共用，避免各自只处理一种写法而静默丢字段
 * （历史事故：estimated_minutes 只读 camelCase，而提案工具写的是 snake_case）。
 */
export function toTaskInputFromDraftItem(item, defaults) {
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (title === '')
        return undefined;
    const estimate = item.estimatedMinutes ?? item.estimated_minutes;
    const allDay = item.allDay ?? item.all_day;
    return {
        title,
        input: {
            title,
            description: typeof item.description === 'string' ? item.description : undefined,
            typeCode: String(item.typeCode ?? item.type_code ?? defaults.typeCode),
            priorityCode: String(item.priorityCode ?? item.priority_code ?? defaults.priorityCode),
            statusCode: typeof item.statusCode === 'string' ? item.statusCode : typeof item.status_code === 'string' ? item.status_code : defaults.statusCode,
            dueAt: typeof item.dueAt === 'string' ? item.dueAt : typeof item.due_at === 'string' ? item.due_at : null,
            allDay: allDay === true,
            estimatedMinutes: typeof estimate === 'number' ? estimate : undefined,
            aiPolicyCode: typeof item.aiPolicyCode === 'string' ? item.aiPolicyCode : undefined,
            source: defaults.source,
            workspacePath: typeof item.workspacePath === 'string' && item.workspacePath !== '' ? item.workspacePath : undefined,
            extra: item.extra ?? defaults.extra,
        },
    };
}
/**
 * 幂等建节点：同 parent 下已有同名（trim 后精确相等）任务时复用它，不新建。
 * 重复确认同一份拆解提案曾导致整棵任务树第二次落地（见 docs/issues/2026-09-09-*）。
 */
function findSiblingByTitle(db, parentId, title) {
    const normalized = title.trim();
    return listTasks(db, { parentId, includeArchived: true }).find((task) => task.title.trim() === normalized);
}
export function createDraft(db, input, at = nowIso()) {
    const id = randomUUID();
    const row = {
        id,
        kindCode: input.kindCode ?? 'task',
        sessionId: input.sessionId ?? null,
        payload: input.payload,
        statusCode: 'pending',
        deferredAt: null,
        deferCount: 0,
        createdAt: at,
        updatedAt: at,
    };
    db.prepare(`
    INSERT INTO task_drafts (id, kind_code, session_id, payload_json, status_code, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(row.id, row.kindCode, row.sessionId, JSON.stringify(row.payload), row.createdAt, row.updatedAt);
    return row;
}
export function updateDraft(db, id, payload, at = nowIso()) {
    const draft = getDraft(db, id);
    if (draft === undefined || draft.statusCode !== 'pending')
        return undefined;
    db.prepare('UPDATE task_drafts SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(payload), at, id);
    return getDraft(db, id);
}
export function getDraftBySession(db, sessionId) {
    return parseDraft(db.prepare('SELECT * FROM task_drafts WHERE session_id = ? AND status_code = \'pending\' ORDER BY created_at DESC LIMIT 1').get(sessionId));
}
export function confirmTaskDraft(db, draftId, actor = 'user', at = nowIso()) {
    const draft = getDraft(db, draftId);
    if (draft === undefined || draft.kindCode !== 'task')
        return undefined;
    const payload = draft.payload;
    const title = typeof payload.title === 'string' ? payload.title : '';
    if (title.trim() === '')
        throw new Error('draft payload requires a non-empty title');
    return withDraftConfirm(db, draftId, 'task', () => {
        const task = createTask(db, {
            title,
            description: typeof payload.description === 'string' ? payload.description : undefined,
            typeCode: String(payload.typeCode ?? ''),
            statusCode: typeof payload.statusCode === 'string' ? payload.statusCode : undefined,
            priorityCode: String(payload.priorityCode ?? 'p2'),
            aiPolicyCode: typeof payload.aiPolicyCode === 'string' ? payload.aiPolicyCode : undefined,
            dueAt: typeof payload.dueAt === 'string' ? payload.dueAt : null,
            allDay: payload.allDay === true,
            estimatedMinutes: typeof payload.estimatedMinutes === 'number' ? payload.estimatedMinutes : null,
            source: typeof payload.source === 'string' ? payload.source : 'nl',
            parentId: typeof payload.parentId === 'string' ? payload.parentId : null,
            workspacePath: typeof payload.workspacePath === 'string' && payload.workspacePath !== '' ? payload.workspacePath : null,
            extra: payload.extra ?? {},
        }, actor, at);
        const explicitOffset = typeof payload.reminderOffsetMinutes === 'number'
            ? payload.reminderOffsetMinutes
            : typeof payload.reminder_offset_minutes === 'number' ? payload.reminder_offset_minutes : undefined;
        const typeDefault = getDictionary(db, 'type', task.typeCode)?.config.defaultReminderMinutes;
        const priorityDefault = getDictionary(db, 'priority', task.priorityCode)?.config.defaultReminderMinutes;
        const reminderOffset = explicitOffset ?? (typeof typeDefault === 'number' ? typeDefault : typeof priorityDefault === 'number' ? priorityDefault : undefined);
        if (task.dueAt !== null && typeof reminderOffset === 'number' && Number.isFinite(reminderOffset) && reminderOffset >= 0) {
            addReminder(db, task.id, reminderOffset, 'browser', at);
        }
        // workbench_submit_task 的 subtasks 参数：确认任务时同步创建简版子任务。
        const rawChildren = Array.isArray(payload.subtasks) ? payload.subtasks : [];
        const walkChildren = (items, parentId) => {
            for (const item of items) {
                const normalized = toTaskInputFromDraftItem(item, { typeCode: task.typeCode, priorityCode: task.priorityCode, statusCode: 'todo', source: 'nl' });
                if (normalized === undefined)
                    continue;
                const { input } = normalized;
                if (getDictionary(db, 'type', input.typeCode)?.active !== 1)
                    continue;
                if (getDictionary(db, 'priority', input.priorityCode)?.active !== 1)
                    continue;
                const child = createTask(db, { ...input, parentId }, actor, at);
                if (Array.isArray(item.children))
                    walkChildren(item.children, child.id);
            }
        };
        walkChildren(rawChildren, task.id);
        if (draft.sessionId !== null && draft.sessionId !== undefined) {
            linkTaskSession(db, { taskId: task.id, sessionId: draft.sessionId, roleCode: 'clarify' }, at);
        }
        return task;
    }, { at });
}
export function confirmSubtaskPlanDraft(db, draftId, actor = 'user', at = nowIso()) {
    const draft = getDraft(db, draftId);
    if (draft === undefined || draft.kindCode !== 'subtask_plan')
        return [];
    const payload = draft.payload;
    const parentTaskId = typeof payload.parentTaskId === 'string' ? payload.parentTaskId : undefined;
    if (parentTaskId === undefined)
        throw new Error('subtask_plan requires parentTaskId');
    const parent = getTask(db, parentTaskId);
    if (parent === undefined)
        throw new Error(`parent task ${parentTaskId} not found`);
    if (parent.archived === 1 || parent.statusCode === 'done' || parent.statusCode === 'cancelled') {
        throw new Error(`parent task「${parent.title}」is archived or closed`);
    }
    const subtasks = Array.isArray(payload.subtasks) ? payload.subtasks : [];
    return withDraftConfirm(db, draftId, 'subtask_plan', () => {
        const created = [];
        const walk = (items, parentId) => {
            for (const item of items) {
                const normalized = toTaskInputFromDraftItem(item, { typeCode: parent.typeCode, priorityCode: parent.priorityCode, source: parent.source });
                if (normalized === undefined)
                    continue;
                const { title, input } = normalized;
                if (getDictionary(db, 'type', input.typeCode)?.active !== 1)
                    continue;
                if (getDictionary(db, 'priority', input.priorityCode)?.active !== 1)
                    continue;
                // 幂等：同父下已有同名节点就复用，不重复建树（重确认同一份提案时保持任务 id/状态/用户编辑不变）。
                const existing = findSiblingByTitle(db, parentId, title);
                const task = existing ?? createTask(db, { ...input, parentId }, actor, at);
                created.push(task);
                if (Array.isArray(item.children))
                    walk(item.children, task.id);
            }
        };
        walk(subtasks, parentTaskId);
        if (draft.sessionId !== null && draft.sessionId !== undefined) {
            for (const task of created) {
                linkTaskSession(db, { taskId: task.id, sessionId: draft.sessionId, roleCode: 'breakdown' }, at);
            }
        }
        return created;
    }, { at, emptyValue: [] });
}
export function getLatestPendingDraft(db) {
    return parseDraft(db.prepare("SELECT * FROM task_drafts WHERE status_code = 'pending' ORDER BY created_at DESC LIMIT 1").get());
}
/**
 * 自动弹窗的数据源：只取**未暂存**的最新待确认草稿。
 * 暂存过的草稿仍是 pending（可确认/可驳回），只是不再打断用户。
 */
export function getLatestActiveDraft(db) {
    return parseDraft(db.prepare("SELECT * FROM task_drafts WHERE status_code = 'pending' AND deferred_at IS NULL ORDER BY created_at DESC LIMIT 1").get());
}
/** 已暂存的待确认草稿（按暂存时间倒序），供「待处理」弹窗的「已暂存」段展示。 */
export function listDeferredDrafts(db) {
    const rows = db.prepare("SELECT * FROM task_drafts WHERE status_code = 'pending' AND deferred_at IS NOT NULL ORDER BY deferred_at DESC").all();
    return rows.map((row) => parseDraft(row)).filter((draft) => draft !== undefined);
}
/** 该任务是否已有暂存中的草稿（用于 AI 重提时提示）。 */
export function getDeferredDraftForTask(db, kindCode, taskId) {
    const rows = db.prepare("SELECT * FROM task_drafts WHERE status_code = 'pending' AND deferred_at IS NOT NULL AND kind_code = ? ORDER BY deferred_at DESC").all(kindCode);
    for (const row of rows) {
        const draft = parseDraft(row);
        if (draft !== undefined && draft.payload.taskId === taskId)
            return draft;
    }
    return undefined;
}
/**
 * 可「暂存」的草稿类型白名单。
 * 只开放验收类：完成验收申请（completion）与复盘草稿（review）——这两类需要用户先做验证/回看再决定。
 */
export const DEFERRABLE_DRAFT_KINDS = ['completion', 'review'];
export function isDeferrableDraftKind(kindCode) {
    return DEFERRABLE_DRAFT_KINDS.includes(kindCode);
}
/** 暂存：仅 pending 且属于可暂存类型的草稿可暂存；返回 undefined 表示不允许。 */
export function deferDraft(db, draftId, at = nowIso()) {
    const draft = getDraft(db, draftId);
    if (draft === undefined || draft.statusCode !== 'pending' || !isDeferrableDraftKind(draft.kindCode))
        return undefined;
    db.prepare('UPDATE task_drafts SET deferred_at = ?, defer_count = defer_count + 1, updated_at = ? WHERE id = ?').run(at, at, draftId);
    return getDraft(db, draftId);
}
/** 唤回：清掉暂存标记，草稿重新进入自动弹窗队列。 */
export function resumeDraft(db, draftId, at = nowIso()) {
    const draft = getDraft(db, draftId);
    if (draft === undefined || draft.statusCode !== 'pending')
        return undefined;
    db.prepare('UPDATE task_drafts SET deferred_at = NULL, updated_at = ? WHERE id = ?').run(at, draftId);
    return getDraft(db, draftId);
}
export function getPendingDraftForTask(db, kindCode, taskId) {
    const rows = db.prepare("SELECT * FROM task_drafts WHERE status_code = 'pending' AND kind_code = ? ORDER BY created_at DESC").all(kindCode);
    for (const row of rows) {
        const draft = parseDraft(row);
        if (draft !== undefined && draft.payload.taskId === taskId)
            return draft;
    }
    return undefined;
}
export function abandonDraft(db, draftId, at = nowIso()) {
    setDraftStatus(db, draftId, 'abandoned', at);
}
