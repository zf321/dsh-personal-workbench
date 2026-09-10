import { authenticateWorkbenchRequest, enterWorkbenchAuthContext, writeJson } from './helpers.js';
import { normalizeSkillEntries, selectUserInvocable } from '../skills.js';
export const SKILLS_PATH = '/api/workbench/skills';
export function makeSkillRoutes(deps) {
    return [
        {
            kind: 'exact',
            path: SKILLS_PATH,
            handler: async (req, res) => {
                const auth = await authenticateWorkbenchRequest(req);
                if (auth === undefined)
                    return writeJson(res, 401, { error: 'unauthorized: login required' });
                enterWorkbenchAuthContext(auth);
                if ((req.method ?? 'GET') !== 'GET')
                    return writeJson(res, 405, { error: 'method not allowed' });
                const url = new URL(req.url ?? SKILLS_PATH, 'http://localhost');
                const service = deps.probe();
                if (service === undefined)
                    return writeJson(res, 200, { ok: true, available: false, skills: [] });
                try {
                    const raw = await service.list();
                    if (url.searchParams.get('raw') === '1')
                        return writeJson(res, 200, { ok: true, available: true, skills: raw });
                    return writeJson(res, 200, { ok: true, available: true, skills: selectUserInvocable(normalizeSkillEntries(raw)) });
                }
                catch (error) {
                    // 技能发现失败不阻断工作台：返回空列表并如实标注原因
                    return writeJson(res, 200, {
                        ok: true,
                        available: false,
                        skills: [],
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            },
        },
    ];
}
