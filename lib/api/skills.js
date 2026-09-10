/** 从 DSH 上下文软探测技能注册表服务（唯一允许的探测方式）。 */
export function probeSkills(ctx) {
    const service = ctx.get('skills');
    if (service === undefined)
        return undefined;
    if (typeof service.list !== 'function')
        return undefined;
    return service;
}
function readString(value) {
    return typeof value === 'string' && value !== '' ? value : undefined;
}
/**
 * 把注册表返回的原始摘要归一化为前端可用的形状。
 *
 * 防御性设计：provider 是第三方代码，字段可能缺失或类型不符；这里逐字段兜底，
 * 坏条目直接丢弃而不是让整个列表 500。调用方若要保真，用 `raw: true` 走原生字段。
 */
export function normalizeSkillEntries(raw) {
    if (!Array.isArray(raw))
        return [];
    const entries = [];
    for (const item of raw) {
        if (typeof item !== 'object' || item === null)
            continue;
        const record = item;
        const name = readString(record.name);
        if (name === undefined)
            continue;
        const invocation = typeof record.invocation === 'object' && record.invocation !== null
            ? record.invocation
            : {};
        entries.push({
            name,
            description: readString(record.description) ?? '',
            ...(readString(record.whenToUse) !== undefined ? { whenToUse: readString(record.whenToUse) } : {}),
            provider: readString(record.provider) ?? 'unknown',
            source: readString(record.source) ?? '',
            userInvocable: invocation.userInvocable !== false,
            modelInvocable: invocation.modelInvocable !== false,
        });
    }
    return entries;
}
/** 只保留用户可直接调用的技能（模型专用技能不在提示词输入区暴露）。 */
export function selectUserInvocable(entries) {
    return entries.filter((entry) => entry.userInvocable);
}
