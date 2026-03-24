# External Reference Stack to Align With

## Research / workflow

- Qlib: AI-oriented quant research platform with experiment and research workflow concepts
- vectorbt: fast portfolio modeling and backtesting for large parameter sweeps

## Market data / execution-facing APIs

- Alpaca: market data + trading APIs for stocks and crypto
- Binance: public market data, spot and derivatives docs for crypto integration

## How to use these references

Do NOT copy blindly.
Use them to sanity-check:

- data contracts,
- research workflows,
- backtest architecture,
- portfolio/event models,
- production release and monitoring ideas.

## Internal policy

Any external adapter must sit behind our own canonical interfaces so vendors can be swapped later.
