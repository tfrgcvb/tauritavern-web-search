# TT DeepSeek AutoSearch

TT DeepSeek AutoSearch 是 TauriTavern / SillyTavern 的联网搜索扩展。它通过 DeepSeek Search API 获取网页标题、摘要和来源链接，并将这些信息加入本轮提示词，由酒馆当前配置的聊天模型生成回复。

## 主要功能

- **自动模式**由 DeepSeek Flash 根据最近一条用户消息判断是否需要联网，并在需要时生成搜索关键词。
- **手动模式**支持在消息中输入 `[[搜:关键词]]` 来发起搜索。
- 支持直连 DeepSeek API，也支持通过 Cloudflare Worker 中继。
