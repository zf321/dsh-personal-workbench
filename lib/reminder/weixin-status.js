const WEIXIN_RPC_PATH = '/api/dsh-im/weixin';
/** 返回所有微信机器人的 messagesReceived 之和；不可用时返回 null。 */
export async function readWeixinInboundCount(ctx) {
    const connection = ctx.get('connection');
    const route = connection?.fetchRoutes?.get(WEIXIN_RPC_PATH);
    if (route === undefined)
        return null;
    const body = JSON.stringify({
        type: 'client-request',
        rpcId: `workbench-${Date.now()}`,
        method: 'dsh-im/weixin',
        payload: { method: 'connection.status', payload: {} },
    });
    try {
        const response = await route.fetch(new Request(`http://127.0.0.1${WEIXIN_RPC_PATH}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', host: '127.0.0.1' },
            body,
        }));
        const parsed = await response.json();
        const bots = parsed.result?.value?.bots;
        if (!Array.isArray(bots))
            return null;
        return bots.reduce((sum, bot) => sum + (typeof bot.stats?.messagesReceived === 'number' ? bot.stats.messagesReceived : 0), 0);
    }
    catch {
        return null;
    }
}
