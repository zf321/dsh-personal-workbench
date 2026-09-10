/**
 * 任务列表页筛选/排序纯函数。
 * 与 React 解耦，便于单元测试；浏览器端由 client bundle 引入。
 */
export const EMPTY_TASK_FILTER = Object.freeze({ keyword: '', statusCodes: [], priorityCodes: [], typeCodes: [] });
export function isTaskFilterEmpty(filter) {
    return filter.keyword.trim() === '' && filter.statusCodes.length === 0 && filter.priorityCodes.length === 0 && filter.typeCodes.length === 0;
}
export function matchesTaskFilter(task, filter) {
    const keyword = filter.keyword.trim().toLowerCase();
    if (keyword !== '') {
        const haystack = `${task.title}\n${task.description ?? ''}`.toLowerCase();
        if (!haystack.includes(keyword))
            return false;
    }
    if (filter.statusCodes.length > 0 && !filter.statusCodes.includes(task.statusCode))
        return false;
    if (filter.priorityCodes.length > 0 && !filter.priorityCodes.includes(task.priorityCode))
        return false;
    if (filter.typeCodes.length > 0 && !filter.typeCodes.includes(task.typeCode))
        return false;
    return true;
}
export function compareTasks(a, b, key, dir, priorityWeight = new Map()) {
    const factor = dir === 'asc' ? 1 : -1;
    switch (key) {
        case 'dueAt': {
            const at = (t) => {
                const due = t.effectiveDueAt ?? t.dueAt;
                if (due !== null) {
                    const n = Date.parse(due);
                    if (!Number.isNaN(n))
                        return n;
                }
                // 已完成任务无有效截止时间时，列表右侧展示的是完成时间，排序也按它参与。
                if (t.statusCode === 'done' && t.completedAt !== null) {
                    const n = Date.parse(t.completedAt);
                    if (!Number.isNaN(n))
                        return n;
                }
                return null;
            };
            const av = at(a);
            const bv = at(b);
            if (av === null && bv === null)
                return 0;
            if (av === null)
                return 1;
            if (bv === null)
                return -1;
            return (av - bv) * factor;
        }
        case 'priority': {
            const weight = (t) => priorityWeight.get(t.priorityCode) ?? Number.MAX_SAFE_INTEGER;
            const diff = weight(a) - weight(b);
            if (diff !== 0)
                return diff * factor;
            break;
        }
        case 'createdAt': {
            const diff = a.createdAt.localeCompare(b.createdAt);
            if (diff !== 0)
                return diff * factor;
            break;
        }
        case 'title': {
            const diff = a.title.localeCompare(b.title, 'zh-Hans-CN');
            if (diff !== 0)
                return diff * factor;
            break;
        }
    }
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
export function createTaskSorter(key, dir, priorityWeight) {
    return (a, b) => compareTasks(a, b, key, dir, priorityWeight);
}
export function buildTaskTree(tasks, orderOf, sortFn) {
    const byParent = new Map();
    for (const task of tasks) {
        const list = byParent.get(task.parentId) ?? [];
        list.push(task);
        byParent.set(task.parentId, list);
    }
    const unlisted = Number.MAX_SAFE_INTEGER;
    const walk = (id) => {
        const siblings = byParent.get(id) ?? [];
        if (sortFn !== undefined) {
            siblings.sort(sortFn);
        }
        else {
            siblings.sort((a, b) => (orderOf?.get(a.id) ?? unlisted) - (orderOf?.get(b.id) ?? unlisted) || a.createdAt.localeCompare(b.createdAt));
        }
        return siblings.map((task) => ({ task, children: walk(task.id) }));
    };
    return walk(null);
}
export function filterTaskTree(roots, keep) {
    const walk = (nodes) => {
        const out = [];
        for (const node of nodes) {
            const children = walk(node.children);
            if (keep(node.task) || children.length > 0)
                out.push({ task: node.task, children });
        }
        return out;
    };
    return walk(roots);
}
/** 统计树中满足 keep 的任务数量；父链上下文节点不会被计入。 */
export function countTaskTreeBy(roots, keep) {
    return roots.reduce((sum, node) => sum + (keep(node.task) ? 1 : 0) + countTaskTreeBy(node.children, keep), 0);
}
const sameDay = (a, b) => a.toDateString() === b.toDateString();
/** 判断任务是否在某一天有有效截止时间，且未取消。日历标记统一使用该条件。 */
export function isTaskDueOnDay(task, day) {
    return task.effectiveDueAt != null && sameDay(new Date(task.effectiveDueAt), day) && task.statusCode !== 'cancelled';
}
