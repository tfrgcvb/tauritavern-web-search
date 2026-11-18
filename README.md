# TT DeepSeek AutoSearch

TT DeepSeek AutoSearch 是 TauriTavern / SillyTavern 的辅助对话和联网研究扩展。酒馆输入框上方有独立的 DeepSeek 输入框。填写后，发送按钮会先等待 DeepSeek 整理回复，再把回复和出处连同酒馆消息交给 Gemini 等主模型。留空时按酒馆的常规流程直接发送。

## 主要功能

- **DeepSeek 对话**使用 Messages API，支持流式回复、多轮追问、智能搜索、阅读链接和引用。深度思考开启时使用最高强度。DeepSeek 对话在本次打开酒馆期间按会话保留。
- **独立 Search/Fetch**支持使用 `[[搜:关键词]]` 和 `[[读:网址]]`。可为搜索设置语言，调整网页分析字数，或在设置里选择独立网页研究。
- 可开启手动确认，审阅后可继续问 DeepSeek、用资料生成、丢弃资料后直接生成或结束本轮。
- **清除联网历史**会将联网回合及使用这些资料的追问从 DeepSeek 后续请求中移出。面板仍可查看这些回合，普通对话可继续作为上文。
- 可选让 DeepSeek 参考最多六条此前的酒馆发言。支持直连和 Cloudflare Worker 中继，直连可记住当前设备上的 API Key。使用中继对话需部署支持 `/chat` 的 Worker。
