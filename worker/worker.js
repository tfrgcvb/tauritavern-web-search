/**
 * Optional Cloudflare Worker for TT DeepSeek AutoSearch.
 * Secrets: DEEPSEEK_API_KEY, TT_RELAY_TOKEN
 * Routes: POST /decide (DeepSeek Flash), POST /search (DeepSeek Search API)
 */
const SEARCH_API = 'https://api.deepseek.com/v1/tools/search';
const CHAT_API = 'https://api.deepseek.com/chat/completions';
const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
};

const PLAN_INSTRUCTION = [
    '你为聊天规划联网检索。先分析用户想核实的事实、对应的实体和时效，再判断是否需要外部资料。只输出一个 JSON 对象。',
    'JSON 示例：{"need_search":true,"query":"项目名称 版本号 官方更新日志","reason":"需要核实该版本的官方变更"}。',
    '用户明确要求查找、核实出处，或问题涉及最新事实和具体外部资料时才搜索。继续剧情、角色互动、闲聊和创作通常无需搜索。',
    '需要联网时，选用原文名称、专有名词、必要的版本或日期，组合成一条能命中关键事实的搜索词。优先使用权威来源常用的措辞。',
    '去掉闲聊、无关词和敏感个人信息。不能确定的实体或版本保持宽泛。query 最多 128 个字符，无需搜索时留空。reason 用一句话说明判断依据。',
].join('\n');

function reply(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: CORS });
}
function normalizedQuery(raw) {
    const query = String(raw || '').trim();
    if (Array.from(query).length < 1 || Array.from(query).length > 128) {
        throw new Error('搜索关键词必须为 1～128 字。');
    }
    return query;
}
async function upstreamJson(url, body, token) {
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    let data;
    try { data = await resp.json(); }
    catch { throw new Error(`DeepSeek 返回非 JSON 响应，HTTP ${resp.status}`); }
    if (!resp.ok || data?.error) {
        const message = String(data?.error?.message || `DeepSeek HTTP ${resp.status}`).replaceAll(token, '[已隐藏]');
        const error = new Error(message.slice(0, 250));
        error.status = resp.ok ? 502 : resp.status;
        throw error;
    }
    return data;
}
export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
        const path = new URL(request.url).pathname;
        if (path !== '/search' && path !== '/decide') return reply({ error: { message: '只接受 /search 和 /decide' } }, 404);
        if (request.method !== 'POST') return reply({ error: { message: '只允许 POST' } }, 405);
        if (!env?.DEEPSEEK_API_KEY || !env?.TT_RELAY_TOKEN) return reply({ error: { message: '缺少 Worker Secret 配置。' } }, 503);
        if (request.headers.get('Authorization') !== `Bearer ${env.TT_RELAY_TOKEN}`) return reply({ error: { message: '访问口令无效。' } }, 401);
        try {
            const bodyText = await request.text();
            if (bodyText.length > 3000) return reply({ error: { message: '请求体过大。' } }, 413);
            const data = JSON.parse(bodyText);
            if (path === '/decide') {
                const message = String(data?.message || '').trim().slice(0, 950);
                if (!message) return reply({ need_search: false, query: '' });
                const modelOutput = await upstreamJson(CHAT_API, {
                    model: 'deepseek-flash',
                    messages: [
                        { role: 'system', content: PLAN_INSTRUCTION },
                        { role: 'user', content: message },
                    ],
                    thinking: { type: 'enabled' },
                    reasoning_effort: 'low',
                    response_format: { type: 'json_object' },
                    max_tokens: 2048,
                    stream: false,
                }, env.DEEPSEEK_API_KEY);
                const choice = modelOutput?.choices?.[0];
                if (choice?.finish_reason === 'length') return reply({ error: { message: 'DeepSeek 达到思考输出上限，未能完成搜索计划。' } }, 502);
                let decision;
                try { decision = JSON.parse(choice?.message?.content); }
                catch { return reply({ error: { message: '判断模型未返回有效 JSON。' } }, 502); }
                if (typeof decision?.need_search !== 'boolean') return reply({ error: { message: '判断模型缺少有效的 need_search 字段。' } }, 502);
                if (decision.need_search && typeof decision.query !== 'string') return reply({ error: { message: '判断模型未提供有效的搜索词。' } }, 502);
                return reply({
                    need_search: decision.need_search,
                    query: decision.need_search ? normalizedQuery(decision.query) : '',
                    reason: typeof decision.reason === 'string' ? decision.reason.trim().slice(0, 120) : '',
                    thinking: true,
                });
            }
            const query = normalizedQuery(data?.query);
            const count = Math.min(10, Math.max(1, Number.parseInt(data?.count, 10) || 5));
            const search = await upstreamJson(SEARCH_API, { query, count, need_content: false }, env.DEEPSEEK_API_KEY);
            if (!Array.isArray(search.results)) return reply({ error: { message: '搜索服务未提供 results。' } }, 502);
            return reply({ results: search.results.map(item => ({
                title: String(item.title || '').slice(0, 180),
                url: String(item.url || '').slice(0, 800),
                summary: String(item.summary || item.snippet || '').slice(0, 800),
                snippet: String(item.snippet || '').slice(0, 240),
                date: String(item.date || '').slice(0, 60),
            })) });
        } catch (err) {
            return reply({ error: { message: String(err?.message || err).slice(0, 250) } }, err.status || 502);
        }
    },
};
