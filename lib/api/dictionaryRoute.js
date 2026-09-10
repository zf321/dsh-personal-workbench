import { createDictionaryEntry, deleteDictionaryEntry, listDictionaries, updateDictionaryEntry } from '../db/repo.js';
import { authenticateWorkbenchRequest, enterWorkbenchAuthContext } from './routes/helpers.js';
const DICTIONARIES_PREFIX = '/api/workbench/dictionaries';
function writeJson(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'referrer-policy': 'no-referrer' });
    res.end(JSON.stringify(body));
}
async function readJsonBody(req, maxBytes = 256 * 1024) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > maxBytes)
            return undefined;
        chunks.push(buffer);
    }
    if (chunks.length === 0)
        return {};
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function pathSegments(url, prefix) {
    const rest = url.pathname.slice(prefix.length);
    return rest.split('/').filter((part) => part !== '');
}
export function makeDictionaryRoute(db) {
    return {
        kind: 'prefix',
        path: DICTIONARIES_PREFIX,
        handler: async (req, res) => {
            const auth = await authenticateWorkbenchRequest(req);
            if (auth === undefined)
                return writeJson(res, 401, { error: 'unauthorized: login required' });
            enterWorkbenchAuthContext(auth);
            const url = new URL(req.url ?? '/', 'http://localhost');
            const segments = pathSegments(url, DICTIONARIES_PREFIX);
            const method = req.method ?? 'GET';
            if (segments.length === 0) {
                if (method === 'GET') {
                    const kind = url.searchParams.get('kind') ?? undefined;
                    return writeJson(res, 200, { ok: true, dictionaries: listDictionaries(db, kind) });
                }
                if (method === 'POST') {
                    const body = await readJsonBody(req);
                    if (body === undefined)
                        return writeJson(res, 400, { error: 'invalid JSON body' });
                    try {
                        const entry = createDictionaryEntry(db, {
                            kind: typeof body.kind === 'string' ? body.kind : '',
                            code: typeof body.code === 'string' ? body.code : '',
                            name: typeof body.name === 'string' ? body.name : '',
                            config: typeof body.config === 'object' && body.config !== null ? body.config : {},
                            sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
                            active: typeof body.active === 'boolean' ? body.active : undefined,
                        });
                        return writeJson(res, 200, { ok: true, dictionary: entry });
                    }
                    catch (error) {
                        return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
                    }
                }
                return writeJson(res, 405, { error: 'method not allowed' });
            }
            if (segments.length >= 2) {
                const kind = decodeURIComponent(segments[0]);
                const code = decodeURIComponent(segments[1]);
                if (method === 'PATCH') {
                    const body = await readJsonBody(req);
                    if (body === undefined)
                        return writeJson(res, 400, { error: 'invalid JSON body' });
                    try {
                        const entry = updateDictionaryEntry(db, kind, code, {
                            name: typeof body.name === 'string' ? body.name : undefined,
                            config: typeof body.config === 'object' && body.config !== null ? body.config : undefined,
                            sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
                            active: typeof body.active === 'boolean' ? body.active : undefined,
                        });
                        return writeJson(res, 200, { ok: true, dictionary: entry });
                    }
                    catch (error) {
                        return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
                    }
                }
                if (method === 'DELETE') {
                    try {
                        deleteDictionaryEntry(db, kind, code);
                        return writeJson(res, 200, { ok: true });
                    }
                    catch (error) {
                        return writeJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
                    }
                }
                return writeJson(res, 405, { error: 'method not allowed' });
            }
            return writeJson(res, 400, { error: 'invalid path' });
        },
    };
}
