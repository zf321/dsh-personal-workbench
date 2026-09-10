/**
 * 任务列表页筛选/排序纯函数。
 * 与 React 解耦，便于单元测试；浏览器端由 client bundle 引入。
 */
export type TaskSortKey = 'dueAt' | 'priority' | 'createdAt' | 'title';
export type TaskSortDir = 'asc' | 'desc';
export interface TaskFilterState {
    keyword: string;
    statusCodes: string[];
    priorityCodes: string[];
    typeCodes: string[];
}
export declare const EMPTY_TASK_FILTER: TaskFilterState;
export declare function isTaskFilterEmpty(filter: TaskFilterState): boolean;
export interface TaskLike {
    id: string;
    parentId: string | null;
    title: string;
    description: string;
    statusCode: string;
    priorityCode: string;
    typeCode: string;
    dueAt: string | null;
    /** 动态有效截止时间：未设置 own dueAt 时由后端继承最近祖先的 dueAt。 */
    effectiveDueAt?: string | null;
    completedAt: string | null;
    createdAt: string;
}
export interface TaskTreeNode<T> {
    task: T;
    children: TaskTreeNode<T>[];
}
export declare function matchesTaskFilter(task: TaskLike, filter: TaskFilterState): boolean;
export declare function compareTasks<T extends TaskLike>(a: T, b: T, key: TaskSortKey, dir: TaskSortDir, priorityWeight?: Map<string, number>): number;
export declare function createTaskSorter<T extends TaskLike>(key: TaskSortKey, dir: TaskSortDir, priorityWeight?: Map<string, number>): (a: T, b: T) => number;
export declare function buildTaskTree<T extends TaskLike>(tasks: T[], orderOf?: Map<string, number>, sortFn?: (a: T, b: T) => number): TaskTreeNode<T>[];
export declare function filterTaskTree<T>(roots: TaskTreeNode<T>[], keep: (task: T) => boolean): TaskTreeNode<T>[];
/** 统计树中满足 keep 的任务数量；父链上下文节点不会被计入。 */
export declare function countTaskTreeBy<T>(roots: TaskTreeNode<T>[], keep: (task: T) => boolean): number;
/** 判断任务是否在某一天有有效截止时间，且未取消。日历标记统一使用该条件。 */
export declare function isTaskDueOnDay<T extends TaskLike>(task: T, day: Date): boolean;
