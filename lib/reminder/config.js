export const REMINDER_POLICY_META_KEY = 'reminder_policy';
/** 可推送的草稿类型（与 task_drafts.kind_code 对齐）。 */
export const NOTIFIABLE_DRAFT_KINDS = ['completion', 'review', 'report', 'knowledge', 'idea_cluster', 'idea_tasks', 'subtask_plan', 'task'];
export const DEFAULT_REMINDER_POLICY = {
    enabled: false,
    immediatePriorities: ['p0', 'p1'],
    digestPriorities: ['p2', 'p3'],
    digestAt: '09:00',
    quietHours: { start: '22:00', end: '08:00' },
    quietHoursBypassPriorities: ['p0'],
    hourlyLimit: 6,
    dailyLimit: 50,
    catchupWindowHours: 24,
    catchupMaxItems: 10,
    breakerCooldownMinutes: 30,
    channel: 'auto',
    // 默认只开"验收申请"与"复盘草稿"：这两类才需要用户立刻动手。
    // 报告/知识/点子/任务草稿默认关，避免噪音（可在设置页打开）。
    draftNotifyKinds: ['completion', 'review'],
};
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_BREAKER_COOLDOWN_MS = 4 * 60 * 60 * 1000;
function strList(value, fallback) {
    if (!Array.isArray(value))
        return fallback;
    const list = value.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim().toLowerCase());
    return list.length > 0 ? [...new Set(list)] : fallback;
}
function intInRange(value, fallback, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    const rounded = Math.floor(value);
    if (rounded < min)
        return min;
    if (rounded > max)
        return max;
    return rounded;
}
function hhmm(value, fallback) {
    return typeof value === 'string' && HHMM_RE.test(value.trim()) ? value.trim() : fallback;
}
/** 把任意（含损坏的）输入规整成完整策略；未知字段丢弃，越界值夹紧。 */
export function normalizeReminderPolicy(raw) {
    const input = (typeof raw === 'object' && raw !== null ? raw : {});
    const quiet = input.quietHours;
    let quietHours = DEFAULT_REMINDER_POLICY.quietHours;
    if (quiet === null) {
        quietHours = null;
    }
    else if (typeof quiet === 'object' && quiet !== null) {
        const q = quiet;
        const start = hhmm(q.start, DEFAULT_REMINDER_POLICY.quietHours.start);
        const end = hhmm(q.end, DEFAULT_REMINDER_POLICY.quietHours.end);
        // start === end 视为不启用（否则是"全天静默"，几乎肯定是误配）
        quietHours = start === end ? null : { start, end };
    }
    const channel = input.channel === 'wechat' || input.channel === 'browser' ? input.channel : 'auto';
    return {
        enabled: input.enabled === true,
        immediatePriorities: strList(input.immediatePriorities, DEFAULT_REMINDER_POLICY.immediatePriorities),
        digestPriorities: strList(input.digestPriorities, DEFAULT_REMINDER_POLICY.digestPriorities),
        digestAt: hhmm(input.digestAt, DEFAULT_REMINDER_POLICY.digestAt),
        quietHours,
        quietHoursBypassPriorities: strList(input.quietHoursBypassPriorities, DEFAULT_REMINDER_POLICY.quietHoursBypassPriorities),
        hourlyLimit: intInRange(input.hourlyLimit, DEFAULT_REMINDER_POLICY.hourlyLimit, 1, 60),
        dailyLimit: intInRange(input.dailyLimit, DEFAULT_REMINDER_POLICY.dailyLimit, 1, 500),
        catchupWindowHours: intInRange(input.catchupWindowHours, DEFAULT_REMINDER_POLICY.catchupWindowHours, 1, 168),
        catchupMaxItems: intInRange(input.catchupMaxItems, DEFAULT_REMINDER_POLICY.catchupMaxItems, 1, 50),
        breakerCooldownMinutes: intInRange(input.breakerCooldownMinutes, DEFAULT_REMINDER_POLICY.breakerCooldownMinutes, 1, 240),
        channel,
        // 显式传空数组 = 用户主动关掉所有草稿通知；缺省字段才回落到默认（验收/复盘）
        draftNotifyKinds: Array.isArray(input.draftNotifyKinds)
            ? input.draftNotifyKinds.filter((kind) => typeof kind === 'string' && NOTIFIABLE_DRAFT_KINDS.includes(kind))
            : DEFAULT_REMINDER_POLICY.draftNotifyKinds,
    };
}
export function readReminderPolicy(db) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(REMINDER_POLICY_META_KEY);
    if (row === undefined)
        return { ...DEFAULT_REMINDER_POLICY };
    try {
        return normalizeReminderPolicy(JSON.parse(row.value));
    }
    catch {
        return { ...DEFAULT_REMINDER_POLICY };
    }
}
export function writeReminderPolicy(db, raw) {
    const policy = normalizeReminderPolicy(raw);
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(REMINDER_POLICY_META_KEY, JSON.stringify(policy));
    return policy;
}
/** 熔断冷却时长：基础值按失败次数翻倍，上限 4 小时。 */
export function breakerCooldownMs(policy, failureCount) {
    const base = policy.breakerCooldownMinutes * 60_000;
    const doubled = base * Math.pow(2, Math.max(0, failureCount - 1));
    return Math.min(doubled, MAX_BREAKER_COOLDOWN_MS);
}
