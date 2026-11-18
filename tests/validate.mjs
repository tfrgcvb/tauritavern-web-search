import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';

const base = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(base,'manifest.json'), 'utf8'));
assert.equal(manifest.generate_interceptor,'ttDeepSeekSearchInterceptor');
const js = fs.readFileSync(path.join(base,'index.js'), 'utf8')
    .replace(/^import \{[^\n]+\} from '[^\n]+';\n/gm, '');
const captured = [];
const requests = [];
let responseResults = [{title:'检索测试', url:'https://example.org/story', summary:'来自网页的测试摘要', date:'2026-11-18'}];
let shouldThrow = false;
const ext = {};
const context = vm.createContext({
  console,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  Date,
  document: {getElementById(){return null;}},
  extension_settings: ext,
  extension_prompt_types: {IN_PROMPT: 1},
  saveSettingsDebounced(){},
  setExtensionPrompt(...args){captured.push(args);},
  fetch: async (url, opt) => {
    requests.push({url,opt});
    if (shouldThrow) throw new TypeError('Failed to fetch');
    return {ok:true, status:200, json:async () => ({results:responseResults})};
  },
});
vm.runInContext(js, context);
vm.runInContext("credentials.directKey = 'test-api-key'", context);
const invoke = async (text,type='normal')=>context.ttDeepSeekSearchInterceptor([{is_user:true,mes:text}],2000,()=>{},type);

// no explicit keyword = no search
await invoke('你好，今天怎么样？');
assert.equal(requests.length,0);
assert.equal(captured.at(-1)[1], '');

// explicit search = result injected without model tool calls
await invoke('[[搜:2026年 AI 最新新闻]] 请附来源');
assert.equal(requests.length,1);
assert.equal(requests.at(-1).url,'https://api.deepseek.com/v1/tools/search');
assert.equal(requests.at(-1).opt.method,'POST');
assert.equal(captured.at(-1)[1].includes('https://example.org/story'),true);
assert.equal(JSON.parse(requests[0].opt.body).need_content,false);
assert.equal(requests[0].opt.headers.Authorization.startsWith('Bearer '),true);

// results not reused as context when not requested
await invoke('说点别的吧');
assert.equal(requests.length,1);
assert.equal(captured.at(-1)[1], '');

// cache should prevent duplicate billable requests
await invoke('[[搜:2026年 AI 最新新闻]]');
assert.equal(requests.length,1);

// invalid query should not call upstream
await invoke('[[搜:'+'a'.repeat(129)+']]');
assert.equal(requests.length,1);
assert.equal(captured.at(-1)[1].includes('搜索词无效'),true);

// simulate errors in uncached query
shouldThrow = true;
await invoke('联网搜索：别的测试词');
assert.equal(requests.length,2);
assert.equal(captured.at(-1)[1].includes('搜索失败'),true);

// Worker handler: no real network; use mock upstream
let workerSource=fs.readFileSync(path.join(base,'worker/worker.js'),'utf8');
const moduleUrl='data:text/javascript;base64,'+Buffer.from(workerSource).toString('base64');
const worker = (await import(moduleUrl)).default;
const env={DEEPSEEK_API_KEY:'fake-api-secret',TT_RELAY_TOKEN:'test-private-token'};
const mkReq=(auth, body)=>new Request('https://demo.workers.dev/search',{
 method:'POST',headers:{'Content-Type':'application/json',Authorization:auth}, body:JSON.stringify(body)
});
const forbidden = await worker.fetch(mkReq('Bearer incorrect',{query:'test'}),env);
assert.equal(forbidden.status,401);
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,opt)=>{
 assert.equal(url,'https://api.deepseek.com/v1/tools/search');
 assert.equal(opt.headers.Authorization,'Bearer fake-api-secret');
 assert.equal(JSON.parse(opt.body).need_content,false);
 return new Response(JSON.stringify({results:responseResults}),{status:200});
};
try {
 const resp=await worker.fetch(mkReq('Bearer test-private-token',{query:'test',count:20,need_content:true}),env);
 assert.equal(resp.status,200);
 assert.equal(resp.headers.get('access-control-allow-origin'),'*');
 assert.equal((await resp.json()).results.length,1);
} finally{globalThis.fetch=originalFetch;}
console.log('PASS: manifest, explicit trigger, prompt injection, stale-prompt cleanup, caching, failed search, Worker authorization/relay.');
