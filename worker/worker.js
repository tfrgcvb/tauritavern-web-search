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

const DECISION_INSTRUCTION = [
    '你是角色扮演聊天的联网检索路由器。只输出 JSON，不回答用户、不续写剧情。',
    'JSON 格式: {"need_search":false,"query":""} 或 {"need_search":true,"query":"简短搜索关键词"}。',
    '仅当用户明确请求联网、核验原著出处、查询最新时事，或问题需要更新的外部信息时联网。',
    '继续故事、普通角色互动、打招呼、创作写作、无外部事实需求时无需搜索。',
    '提取简短事实关键词，保护用户隐私，禁止上传私人角色卡全文或内部秘密。',
    'query 不超过 128 字，need_search 为 false 时 query 留空。',
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
        const error = new Error(String(data?.error?.message || `DeepSeek HTTP ${resp.status}`).slice(0, 250));
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
                        { role: 'system', content: DECISION_INSTRUCTION },
                        { role: 'user', content: message },
                    ],
                    thinking: { type: 'disabled' },
                    response_format: { type: 'json_object' },
                    max_tokens: 160,
                    stream: false,
                }, env.DEEPSEEK_API_KEY);
                let decision;
                try { decision = JSON.parse(String(modelOutput?.choices?.[0]?.message?.content || '').trim()); }
                catch { return reply({ error: { message: '判断模型未返回有效 JSON。' } }, 502); }
                if (decision?.need_search !== true) return reply({ need_search: false, query: '' });
                return reply({ need_search: true, query: normalizedQuery(decision.query) });
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
