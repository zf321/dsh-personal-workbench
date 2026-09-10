export { nowIso, getDraft, setDraftStatus, withDraftConfirm } from './repo/shared.js';
export type { DraftRow } from './repo/shared.js';
export { effectiveDueAtForTask, effectiveWorkspacePathForTask, parseTask, appendEvent } from './repo/task-primitives.js';
export type { RawTaskRow } from './repo/task-primitives.js';
/** 服务器本地时区的 YYYY-MM-DD；每日计划按本地“天”划分。 */
export declare function localDateString(date?: Date): string;
export interface DictionaryEntry {
    kind: string;
    code: string;
    name: string;
    config: Record<string, unknown>;
    builtin: number;
    active: number;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
}
export interface TaskInput {
    title: string;
    description?: string;
    typeCode: string;
    statusCode?: string;
    priorityCode: string;
    aiPolicyCode?: string;
    dueAt?: string | null;
    allDay?: boolean;
    estimatedMinutes?: number | null;
    source?: string;
    parentId?: string | null;
    workspacePath?: string | null;
    extra?: Record<string, unknown>;
    children?: Array<Partial<TaskInput>>;
    recurrenceCode?: string | null;
    recurrenceRule?: Record<string, unknown>;
    recurrenceMasterId?: string | null;
}
export interface TaskPatch {
    title?: string;
    description?: string;
    typeCode?: string;
    statusCode?: string;
    priorityCode?: string;
    aiPolicyCode?: string;
    dueAt?: string | null;
    allDay?: boolean;
    estimatedMinutes?: number | null;
    archived?: boolean;
    workspacePath?: string | null;
    extra?: Record<string, unknown>;
    recurrenceCode?: string | null;
    recurrenceRule?: Record<string, unknown>;
}
export interface TaskRow {
    id: string;
    parentId: string | null;
    title: string;
    description: string;
    typeCode: string;
    statusCode: string;
    priorityCode: string;
    aiPolicyCode: string;
    dueAt: string | null;
    /** 动态有效截止时间：优先自身 dueAt，未设置时向上继承最近一个有截止时间的祖先。 */
    effectiveDueAt: string | null;
    allDay: number;
    estimatedMinutes: number | null;
    source: string;
    workspacePath: string | null;
    /** 动态有效工作区：优先自身 workspacePath，未设置时向上继承最近一个已设工作区的祖先。 */
    effectiveWorkspacePath: string | null;
    archived: number;
    extra: Record<string, unknown>;
    recurrenceCode: string | null;
    recurrenceRule: Record<string, unknown>;
    recurrenceMasterId: string | null;
    recurrenceLastGenerated: string | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    cancelledAt: string | null;
}
export interface DraftInput {
    kindCode?: 'task' | 'subtask_plan' | string;
    sessionId?: string | null;
    payload: Record<string, unknown>;
}
export interface TaskSessionLinkInput {
    taskId: string;
    sessionId: string;
    roleCode: string;
    workspace?: string;
    note?: string;
}
export { listDictionaries, getDictionary, createDictionaryEntry, updateDictionaryEntry, deleteDictionaryEntry, dictionaryUsageCount, } from './repo/dictionaries.js';
export { createTask, getTask, listTasks, listChildren, updateTask } from './repo/tasks.js';
export { completeTaskCascade, updateTaskWithCompletion, repairParentCompletion, archiveTask, restoreTask, listArchivedTasks, listTaskEvents, createTaskReview, listTaskReviews, } from './repo/status.js';
export type { TaskReviewInput } from './repo/status.js';
export { createDraft, updateDraft, getDraftBySession, confirmTaskDraft, confirmSubtaskPlanDraft, getLatestPendingDraft, getPendingDraftForTask, abandonDraft, toTaskInputFromDraftItem, getLatestActiveDraft, listDeferredDrafts, getDeferredDraftForTask, deferDraft, resumeDraft, isDeferrableDraftKind, DEFERRABLE_DRAFT_KINDS, } from './repo/drafts.js';
export type { DraftTaskItem } from './repo/drafts.js';
export { linkTaskSession, listTaskSessions } from './repo/task-sessions.js';
export { getTaskRootId, getTaskMemory, listTaskMemories, addTaskMemory, getTaskMemoryContext } from './repo/task-memory.js';
export type { TaskMemoryRow } from './repo/task-memory.js';
export { listDueReminders, listReminders, fireReminder, addReminder } from './repo/reminders.js';
export type { DueReminder, TaskReminderRow } from './repo/reminders.js';
export { readMeta, writeMeta } from './repo/meta.js';
export { REMINDER_QUEUE_LIMIT, enqueueReminder, listDueQueue, listQueue, countQueue, removeQueueEntry, markQueueAttempt, countFiredRemindersSince, listDueRemindersInWindow, getTaskRootIdOrSelf, } from './repo/reminder-queue.js';
export type { ReminderQueueRow, ReminderQueueInput } from './repo/reminder-queue.js';
export { getDailyPlan, saveDailyPlan, updateDailyPlan, deleteDailyPlan, confirmDailyPlanDraft, getPendingDailyPlanDraft, } from './repo/plans.js';
export type { DailyPlanItem, DailyPlanRow } from './repo/plans.js';
export { saveTaskReport, getTaskReport, listTaskReports, deleteTaskReport, confirmReportDraft, getPendingReportDraft, } from './repo/reports.js';
export type { ReportPeriodCode, TaskReportInput, TaskReportRow } from './repo/reports.js';
export { getAiSession, registerAiSession } from './repo/ai-sessions.js';
export type { AiSessionRegistryRow } from './repo/ai-sessions.js';
export { ensureRecurringInstances, RECURRENCE_BACKFILL_LIMIT } from './repo/recurring.js';
export { normalizeFileLink, assertValidFileLink, createKnowledge, getKnowledge, listKnowledge, updateKnowledge, deleteKnowledge, confirmKnowledgeDraft, getPendingKnowledgeDraft, } from './repo/knowledge.js';
export type { KnowledgeInput, KnowledgeRow } from './repo/knowledge.js';
export { createIdea, getIdea, listIdeas, updateIdea, deleteIdea, createIdeaCluster, getIdeaCluster, listIdeaClusters, deleteIdeaCluster, listIdeaClustersForIdea, confirmIdeaClusterDraft, confirmIdeaTaskDraft, getPendingDraftForSession, } from './repo/ideas.js';
export type { IdeaInput, IdeaRow, IdeaClusterInput, IdeaClusterRow } from './repo/ideas.js';
export { MCP_TIMEOUT_DEFAULT_MS, MCP_TIMEOUT_MIN_MS, MCP_TIMEOUT_MAX_MS, normalizeMcpServerName, normalizeMcpServerUrl, normalizeMcpHeaders, clampMcpTimeoutMs, createMcpServer, getMcpServer, getMcpServerByName, listMcpServers, updateMcpServer, deleteMcpServer, recordMcpTools, recordMcpStatus, } from './repo/mcp.js';
export type { McpServerInput, McpServerPatch, McpServerRow, McpToolInfo } from './repo/mcp.js';
