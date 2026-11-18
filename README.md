# TT DeepSeek AutoSearch v0.2.0

**TauriTavern / SillyTavern 前端扩展**：让 DeepSeek Flash 决定是否需要联网；必要时调用 DeepSeek 官方独立 Search API；最后把网页摘要和来源临时注入**原来的 Gemini 中转**生成请求。无需 Agent、MCP、Gemini Function Calling。

> 这是经过静态检查和模拟测试的实验版本。尚未在你的安卓 TauriTavern、真实 DeepSeek 账户、Cloudflare Worker 环境中联调。不要把下载的 ZIP 误当作角色卡或 API 预设直接导入。

## 架构与费用

```text
你的最新用户消息
   |
   +-- 自动模式: DeepSeek Flash chat/completions (廉价 JSON 判断)
   |       | 不需要搜索: 跳过搜索
   |       ` 需要搜索: 得到 1~128 字的关键词
   |
   +-- 手动模式: 只识别 [[搜:关键词]]，不付路由模型费用
   |
   +-- 需要搜索时: DeepSeek Search (POST /v1/tools/search)
   |
   `-- 将标题/摘要/URL 一次性注入本轮提示词
                    |
                    `-- Gemini 中转正常生成 (每轮只请求一次)
```

- 自动模式：每次普通用户消息都会产生一次 DeepSeek Flash 的 token 费用；搜索只有必要时才发生。生成同一回复的重新刷卡可能命中内存缓存。
- 手动模式：不调用判断模型，只有用户输入标记才会产生搜索请求。
- 独立 Search API：DeepSeek 官方定价每 1,000 次成功搜索 5 元人民币。判断模型价格另算。
- 默认最多 5 条搜索结果，`need_content:false`，不抓取整页。10 分钟搜索/判断缓存。搜索结果不会保留在聊天历史和后续回复的提示词中。
- 自动路由**只发送最近一条用户消息的前 950 个字符**给 DeepSeek，不发送整个聊天记录。这有助于保护隐私、控制 token，但对高度依赖上下文的模糊问题可能误判。

## 如何安装到安卓 TauriTavern

1. 将本扩展的 `manifest.json`、`index.js`、`style.css` 放到 GitHub 仓库根目录（**不要上传 API 密钥或个人隐私**）。
2. 在 TauriTavern 的扩展安装菜单粘贴 Git 仓库 URL 安装；`worker/` 只用于选择中继时部署，不是酒馆插件。
3. 打开设置里的「DeepSeek 联网搜索（无 MCP）」面板，将触发方式改为 **自动：DeepSeek Flash 判断是否联网**。
4. 选择直连模式，填入**DeepSeek 官方 API Key**，先点「测试自动判断」，再点「测试搜索」。刷新页面后需要重新填写密钥（仅当前内存保存）。
5. 如果安卓 WebView 提示 CORS / Failed to fetch，按下面的 Worker 中继步骤配置。
6. 保持你现在的 **Gemini 中转**设置原样；暂停 Exa MCP、关闭普通聊天里不需要的 Function Calling。测试时最好先关闭《我即浪潮》的工具抗截断，排除互相改写的干扰。

## Cloudflare Worker 中继（安卓推荐）

1. 在 Cloudflare Workers 创建 Worker，粘贴 `worker/worker.js` 全部代码并部署。
2. 在 Worker 的 **Settings -> Variables and Secrets** 添加两个 `Secret`：
   - `DEEPSEEK_API_KEY`：你的 DeepSeek 官方 API Key。
   - `TT_RELAY_TOKEN`：你自己随机生成的 32 位以上私密口令。
3. 扩展选择 **Cloudflare Worker 中继**，URL 填 `https://your-worker.workers.dev/search`，Token 填 `TT_RELAY_TOKEN`。
4. v0.2 的 Worker 同时实现 `/search` 和 `/decide`。**不能复用 v0.1 的旧 Worker，否则自动模式会因 `/decide` 不存在而报 404。**
5. 点击「测试自动判断」和「测试搜索」，两项通过后再测试真实聊天。

Worker 内保存正式 DeepSeek 密钥，网页仅持有中继口令；口令仍然是敏感凭据，丢失时必须更换。示例 `Access-Control-Allow-Origin: *` 为了跨安卓 WebView 提供兼容，**不能将中继作为公开服务**，建议另加 Cloudflare 速率限制/验证，避免被刷额度。

## 测试样例

自动模式：

- `老师，我们继续在夏莱办公室聊天。` 预期 DeepSeek 判定不联网。
- `查询蔚蓝档案 Vol.1 第1章第9话的原文对话与出处。` 预期联网。
- `现在最新 Gemini API 价格是多少？` 预期联网。

手动或自动模式均可强制检索（绕过 DeepSeek 判断费用）：

```text
[[搜:蔚蓝档案 Vol1 第一章第9话 便利屋68 阿拜多斯]]
请严格参考原著资料继续。
```

为了避免从非官方或同人站点混淆原作，人物对话仍建议优先用原始主线剧情文本，搜索结果只是外部参考，不能当作指令或角色无所不知的理由。

## 注意事项和验证范围

- 只保证每次**普通聊天生成**向原来的 Gemini 发送一次请求；若你主动使用继续生成、多重生成、重新刷卡或客户端本身会自动重试，实际调用次数仍由酒馆和中转决定。
- 由于分类模型只接收最新用户消息，它可能误判（例如「那第二个呢？」）。可以用 `[[搜:关键词]]` 手动覆盖。
- API、模型和搜索 API 必须在 DeepSeek 官方账户开通且余额正常；Gemini 中转 Key 不可以拿来填 DeepSeek。
- DeepSeek 本次判断失败时，会在扩展状态显示错误，但**不阻止原来的 Gemini 聊天**。
- 本扩展没有让 DeepSeek 生成剧情、没有调用 MCP，也没有使用 DeepSeek 原生 `deepseek_web_search`，因此 TauriTavern 不需要解析第二模型的工具调用格式。
- 模拟测试覆盖模型决定不搜/要搜、联网注入、显式绕过判断、缓存、历史清理、Worker 鉴权和错误处理；真实设备及 Google/DeepSeek 网络联通仍需你安装后验证。

官方文档：
- https://api-docs.deepseek.com/zh-cn/guides/search/
- https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/
- https://docs.sillytavern.app/for-contributors/writing-extensions/
