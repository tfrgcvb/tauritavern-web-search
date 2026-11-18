# TT DeepSeek AutoSearch

TT DeepSeek AutoSearch 是 TauriTavern / SillyTavern 的联网研究扩展。它通过 DeepSeek Search 寻找网页、通过 DeepSeek Fetch 读取正文，再由 DeepSeek Flash 以最高思考强度多轮核查并整理带出处的资料，供酒馆当前配置的聊天模型生成回复。

## 主要功能

- **自动模式**由 DeepSeek Flash 思考最近一条用户消息，判断是否需要联网，并围绕待核实的事实制定搜索词。
- **手动模式**支持在消息中用 `[[搜:关键词]]` 指定首轮搜索词。
- 支持直连 DeepSeek API，也支持通过 Cloudflare Worker 中继。
- 每次研究最多搜索三次，每次读取最多两篇网页。可在聊天输入框上方查看搜索记录、研究结论、待核实事项和引用。
- 可开启生成前手动确认。审阅资料后，可以同意生成、输入意见重搜或结束本轮。
- 直连模式可选择把 API Key 保存在当前设备，重新打开后继续使用。
