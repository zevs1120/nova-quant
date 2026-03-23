# NovaQuant Model

Last updated: 2026-03-23

`model/` 表示部署在 AWS EC2 的模型服务边界。与本仓库后端的 HTTP 契约草案见同目录 [`signal.schema.json`](signal.schema.json)（若与 `POST /api/model/signals/ingest` 的实现不一致，以 **`src/server/api/modelHandlers.ts`** 与运行中校验为准）。

职责：

- 抓取行情、新闻、因子
- 计算策略和标准化交易信号
- 只通过后端 API 推送信号

禁止事项：

- 不读用户数据
- 不读持仓
- 不直连数据库

## 信号推送

目标地址：

- `POST https://api.novaquant.cloud/api/model/signals/ingest`

鉴权：

- `Authorization: Bearer $NOVA_MODEL_INGEST_TOKEN`

标准信号格式：

```json
{
  "market": "US",
  "symbol": "AAPL",
  "side": "LONG",
  "entry": 212.4,
  "stop": 206.8,
  "take1": 218.0,
  "take2": 223.5,
  "risk": 0.02,
  "strategy": "trend_pullback_v3",
  "time": "2026-03-22T09:30:00Z"
}
```

批量推送：

```json
{
  "signals": [
    {
      "market": "US",
      "symbol": "AAPL",
      "side": "LONG",
      "entry": 212.4,
      "stop": 206.8,
      "take1": 218.0,
      "take2": 223.5,
      "risk": 0.02,
      "strategy": "trend_pullback_v3",
      "time": "2026-03-22T09:30:00Z"
    }
  ]
}
```
