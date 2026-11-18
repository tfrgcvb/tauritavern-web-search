import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';

const folder = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(folder, 'index.js'), 'utf8').replace(/^import \{[^\n]+\} from '[^\n]+';\n/gm, '');
const injected = [];
const requests = [];
let needSearch = false;
const settings = {};
const ctx = vm.createContext({
  console, URL, AbortController, setTimeout, clearTimeout, Date,
  extension_settings: settings,
  extension_prompt_types: { IN_PROMPT: 1 },
  setExtensionPrompt(...args){ injected.push(args); },
  saveSettingsDebounced(){},
  document: { getElementById(){ return null; } },
  fetch: async (url, opt)=>{
    requests.push({url,opt});
    if (url.endsWith('/chat/completions')) {
      const b=JSON.parse(opt.body);
      assert.equal(b.model,'deepseek-flash');
      assert.deepEqual(b.thinking,{ type:'disabled' });
      assert.equal(b.response_format.type,'json_object');
      assert.equal(b.messages.length,2);
      return {ok:true,status:200,json:async()=>({choices:[{message:{content:JSON.stringify({need_search:needSearch,query: needSearch ? 'Blue Archive original chapter 1' : ''})}}]})};
    }
    if (url.endsWith('/tools/search')) {
      return {ok:true,status:200,json:async()=>({results:[{title:'Original chapter transcript',url:'https://example.org/ba',summary:'Episode source text and timeline.'}]})};
    }
    throw new Error('Unexpected endpoint '+url);
  }
});
vm.runInContext(source,ctx);
vm.runInContext("credentials.directKey='unit-test-key'",ctx);
settings.ttDeepSeekSearch={enabled:true,triggerMode:'automatic',mode:'direct',count:5,timeoutSeconds:25};
const run=async text=>ctx.ttDeepSeekSearchInterceptor([{is_user:true,mes:text}],1800,()=>{},'normal');

await run('普通角色扮演，我们继续聊聊今天的天气。');
assert.equal(requests.length,1);
assert.equal(requests[0].url,'https://api.deepseek.com/chat/completions');
assert.equal(injected.at(-1)[1],'');

needSearch=true;
await run('请核实蔚蓝档案主线第1章第9话原文。');
assert.equal(requests.length,3);
assert.equal(requests[2].url,'https://api.deepseek.com/v1/tools/search');
assert.match(injected.at(-1)[1],/https:\/\/example.org\/ba/);

// A manual tag bypasses the router even when auto mode is active.
await run('[[搜:2026年AI新闻]] 请给我来源');
assert.equal(requests.length,4);
assert.equal(requests.at(-1).url,'https://api.deepseek.com/v1/tools/search');

// Same message is served from both caches.
await run('请核实蔚蓝档案主线第1章第9话原文。');
assert.equal(requests.length,4);

const workerText=fs.readFileSync(path.join(folder,'worker/worker.js'),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(workerText).toString('base64'))).default;
const env={DEEPSEEK_API_KEY:'fake-secret',TT_RELAY_TOKEN:'private-token'};
const nativeFetch=globalThis.fetch;
let upstreamCount=0;
globalThis.fetch=async (url,opts)=>{
 upstreamCount++;
 assert.equal(opts.headers.Authorization,'Bearer fake-secret');
 if(url.endsWith('/chat/completions')) return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({need_search:true,query:'relevant topic'})}}]}),{status:200});
 if(url.endsWith('/tools/search')) return new Response(JSON.stringify({results:[{title:'Result',url:'https://example.org',summary:'Summary'}]}),{status:200});
 throw new Error('Unexpected request');
};
try {
 const req=(endpoint,token,body)=>new Request('https://myworker.workers.dev'+endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const forbidden=await worker.fetch(req('/decide','invalid',{message:'latest news'}),env);
 assert.equal(forbidden.status,401);
 const decision=await worker.fetch(req('/decide','private-token',{message:'latest news'}),env);
 assert.deepEqual(await decision.json(),{need_search:true,query:'relevant topic'});
 const search=await worker.fetch(req('/search','private-token',{query:'relevant topic'}),env);
 assert.equal((await search.json()).results.length,1);
 assert.equal(upstreamCount,2);
} finally {globalThis.fetch=nativeFetch;}
console.log('PASS: auto routing no-search / search, manual override, caches, Worker decide and search, authentication.');
