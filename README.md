# TT DeepSeek AutoSearch

TT DeepSeek AutoSearch 是 TauriTavern / SillyTavern 的辅助对话和联网研究扩展。酒馆输入框上方有独立的 DeepSeek 输入框。填写后，发送按钮会先等待 DeepSeek 整理回复，再把回复和出处连同酒馆消息交给 Gemini 等主模型。留空时按酒馆的常规流程直接发送。

## 主要功能

- **DeepSeek 对话**使用 Messages API，支持流式回复、多轮追问、智能搜索、阅读链接和引用。深度思考开启时使用最高强度。DeepSeek 对话在本次打开酒馆期间按会话保留。
- **独立 Search/Fetch**支持使用 `[[搜:关键词]]` 和 `[[读:网址]]`。可为搜索设置语言，调整网页分析字数，或在设置里选择独立网页研究。
- 可开启手动确认，审阅后可继续问 DeepSeek、同意生成或结束本轮。还可选择让 DeepSeek 参考最多六条此前的酒馆发言，默认关闭。
- 支持直连和 Cloudflare Worker 中继。直连可记住当前设备上的 API Key。使用中继对话时请部署本版本的 Worker。
