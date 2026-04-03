import '../styles/onboarding.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mapEntryIntent } from '../utils/firstRunRouting.js';

const MARKET_OPTIONS = {
  US: ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'SPY', 'QQQ'],
  CRYPTO: ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB'],
};

function buildCopy(locale) {
  const zh = locale?.startsWith('zh');
  return {
    eyebrow: zh ? '首次设置' : 'First setup',
    skip: zh ? '稍后再说' : 'Skip for now',
    next: zh ? '继续' : 'Next',
    back: zh ? '返回' : 'Back',
    finish: zh ? '进入系统' : 'Enter Nova',
    steps: [
      {
        key: 'entry',
        stepLabel: zh ? '步骤 1' : 'Step 1',
        title: zh ? '你现在最想先做什么？' : 'What do you want to do first?',
        body: zh
          ? '只选一个最接近你的入口，我们会把你直接送过去。'
          : 'Pick the closest path and we will drop you straight into it.',
      },
      {
        key: 'setup',
        stepLabel: zh ? '步骤 2' : 'Step 2',
        title: zh ? '把默认节奏定一下' : 'Set your default rhythm',
        body: zh
          ? '市场、风险和你关心的名字，先用最少的选择定清楚。'
          : 'Set market, risk, and a few names with the fewest possible choices.',
      },
    ],
    entryOptions: [
      {
        key: 'ready_to_trade',
        label: zh ? '我准备开始交易' : 'I am ready to trade',
        body: zh ? '先看今天最值得动作的一张卡。' : 'Take me to the clearest action card first.',
      },
      {
        key: 'have_holdings',
        label: zh ? '我已经有持仓' : 'I already have positions',
        body: zh
          ? '先从仓位、风险和组合上下文开始。'
          : 'Start from positions, risk, and portfolio context.',
      },
      {
        key: 'just_exploring',
        label: zh ? '我先看看' : 'I am just exploring',
        body: zh
          ? '先从更轻松的观察和理解入口开始。'
          : 'Start from a lower-pressure context-first mode.',
      },
    ],
    riskOptions: [
      {
        key: 'conservative',
        label: zh ? '保守' : 'Conservative',
        body: zh ? '控制波动，先保住节奏。' : 'Tighter risk, calmer pacing.',
      },
      {
        key: 'balanced',
        label: zh ? '平衡' : 'Balanced',
        body: zh ? '机会和约束都保持中性。' : 'A middle line between opportunity and control.',
      },
      {
        key: 'aggressive',
        label: zh ? '主动' : 'Aggressive',
        body: zh ? '更接受波动，追求更强动作。' : 'More willing to move when the setup is there.',
      },
    ],
    marketOptions: [
      {
        key: 'US',
        label: zh ? '美股' : 'US stocks',
        body: zh ? '股票、ETF、指数节奏' : 'Stocks, ETFs, and index rhythm',
      },
      {
        key: 'CRYPTO',
        label: zh ? 'Crypto' : 'Crypto',
        body: zh ? '全天候、更快的波动' : '24/7 and structurally faster',
      },
    ],
    marketStageTitle: zh ? '先看哪个市场？' : 'Which market first?',
    riskStageTitle: zh ? '你的风险节奏' : 'Your risk pace',
    riskStageBody: zh
      ? '这会影响仓位和提醒语气。'
      : 'This affects sizing and how Nova frames risk.',
    pickNames: zh ? '选择 1 到 5 个你最关心的名字' : 'Pick 1 to 5 names you care about',
    namesHint: zh
      ? '不选也可以，我们会先帮你放入一组默认关注。'
      : 'You can skip this and we will seed a default starter set.',
    summaryLabels: {
      entry: zh ? '入口' : 'Start',
      risk: zh ? '风险' : 'Risk',
      market: zh ? '市场' : 'Market',
      names: zh ? '关注' : 'Watchlist',
    },
  };
}

function labelFor(options, key) {
  return options.find((item) => item.key === key)?.label || '';
}

export default function FirstRunSetupFlow({
  locale,
  profile,
  riskProfileKey,
  assetClass,
  watchlist,
  onComplete,
  onSkip,
}) {
  const copy = useMemo(() => buildCopy(locale), [locale]);
  const initialMarket = assetClass === 'CRYPTO' ? 'CRYPTO' : 'US';
  const flowRef = useRef(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [entryIntent, setEntryIntent] = useState('');
  const [risk, setRisk] = useState(riskProfileKey || 'balanced');
  const [marketFocus, setMarketFocus] = useState(initialMarket);
  const [selectedSymbols, setSelectedSymbols] = useState(() =>
    Array.isArray(watchlist)
      ? watchlist
          .filter((symbol) => (MARKET_OPTIONS[initialMarket] || []).includes(symbol))
          .slice(0, 5)
      : [],
  );

  const currentStep = copy.steps[stepIndex];
  const symbolOptions = MARKET_OPTIONS[marketFocus] || MARKET_OPTIONS.US;
  const canContinue = stepIndex === 0 ? Boolean(entryIntent) : Boolean(risk && marketFocus);

  useEffect(() => {
    flowRef.current?.scrollTo({ top: 0, left: 0 });
  }, [stepIndex]);

  const summaryItems = [
    entryIntent
      ? {
          label: copy.summaryLabels.entry,
          value: labelFor(copy.entryOptions, entryIntent),
        }
      : null,
    risk
      ? {
          label: copy.summaryLabels.risk,
          value: labelFor(copy.riskOptions, risk),
        }
      : null,
    marketFocus
      ? {
          label: copy.summaryLabels.market,
          value: labelFor(copy.marketOptions, marketFocus),
        }
      : null,
    selectedSymbols.length
      ? {
          label: copy.summaryLabels.names,
          value: selectedSymbols.join(' · '),
        }
      : null,
  ].filter(Boolean);

  const toggleSymbol = (symbol) => {
    setSelectedSymbols((current) => {
      if (current.includes(symbol)) {
        return current.filter((item) => item !== symbol);
      }
      if (current.length >= 5) {
        return [...current.slice(1), symbol];
      }
      return [...current, symbol];
    });
  };

  const handleFinish = () => {
    const { goal, currentState } = mapEntryIntent(entryIntent);
    const fallbackSymbols =
      selectedSymbols.length > 0
        ? selectedSymbols
        : Array.isArray(watchlist) && watchlist.length > 0
          ? watchlist.slice(0, 5)
          : symbolOptions.slice(0, 3);
    onComplete?.({
      goal,
      currentState,
      riskProfileKey: risk || 'balanced',
      marketFocus,
      assetClass: marketFocus === 'CRYPTO' ? 'CRYPTO' : 'US_STOCK',
      market: marketFocus === 'CRYPTO' ? 'CRYPTO' : 'US',
      watchlist: fallbackSymbols,
    });
  };

  return (
    <div ref={flowRef} className="first-run-flow">
      <div className="first-run-shell">
        <header className="first-run-header">
          <div className="first-run-header-copy">
            <span className="first-run-eyebrow">{copy.eyebrow}</span>
            <h1 className="first-run-heading">
              {locale?.startsWith('zh')
                ? `${profile?.name || '你'}，先让 Nova 更懂你`
                : `Let Nova understand ${profile?.name || 'you'} first`}
            </h1>
          </div>
          <button type="button" className="first-run-skip" onClick={() => onSkip?.()}>
            {copy.skip}
          </button>
        </header>

        <div
          className="first-run-progress"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${copy.steps.length}, minmax(0, 1fr))` }}
        >
          {copy.steps.map((item, index) => (
            <span
              key={item.key}
              className={`first-run-progress-segment ${
                index <= stepIndex ? 'first-run-progress-segment-active' : ''
              }`}
            />
          ))}
        </div>

        <section className="first-run-panel">
          <p className="first-run-step-label">{currentStep.stepLabel}</p>
          <h2 className="first-run-title">{currentStep.title}</h2>
          <p className="first-run-body">{currentStep.body}</p>

          {stepIndex === 0 ? (
            <div className="first-run-option-grid">
              {copy.entryOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`first-run-option ${entryIntent === item.key ? 'is-active' : ''}`}
                  onClick={() => setEntryIntent(item.key)}
                >
                  <span className="first-run-option-title">{item.label}</span>
                  <span className="first-run-option-body">{item.body}</span>
                </button>
              ))}
            </div>
          ) : null}

          {stepIndex === 1 ? (
            <div className="first-run-market-stage">
              <div className="first-run-stage-copy">
                <h3 className="first-run-symbol-title">{copy.marketStageTitle}</h3>
              </div>
              <div className="first-run-market-grid">
                {copy.marketOptions.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`first-run-option ${marketFocus === item.key ? 'is-active' : ''}`}
                    onClick={() => {
                      setMarketFocus(item.key);
                      setSelectedSymbols((current) =>
                        current.filter((symbol) =>
                          (MARKET_OPTIONS[item.key] || []).includes(symbol),
                        ),
                      );
                    }}
                  >
                    <span className="first-run-option-title">{item.label}</span>
                    <span className="first-run-option-body">{item.body}</span>
                  </button>
                ))}
              </div>

              <div className="first-run-risk-stage">
                <div className="first-run-stage-copy">
                  <h3 className="first-run-symbol-title">{copy.riskStageTitle}</h3>
                  <p className="first-run-symbol-note">{copy.riskStageBody}</p>
                </div>
                <div className="first-run-option-grid first-run-option-grid-tight">
                  {copy.riskOptions.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`first-run-option ${risk === item.key ? 'is-active' : ''}`}
                      onClick={() => setRisk(item.key)}
                    >
                      <span className="first-run-option-title">{item.label}</span>
                      <span className="first-run-option-body">{item.body}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="first-run-symbol-stage">
                <div className="first-run-symbol-copy">
                  <h3 className="first-run-symbol-title">{copy.pickNames}</h3>
                  <p className="first-run-symbol-note">{copy.namesHint}</p>
                </div>
                <div className="first-run-symbol-list">
                  {symbolOptions.map((symbol) => (
                    <button
                      key={symbol}
                      type="button"
                      className={`first-run-symbol-chip ${
                        selectedSymbols.includes(symbol) ? 'is-active' : ''
                      }`}
                      onClick={() => toggleSymbol(symbol)}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {summaryItems.length ? (
            <div className="first-run-summary">
              {summaryItems.map((item) => (
                <div key={item.label} className="first-run-summary-item">
                  <span className="first-run-summary-label">{item.label}</span>
                  <span className="first-run-summary-value">{item.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <footer className={`first-run-footer ${stepIndex === 0 ? 'first-run-footer-single' : ''}`}>
          {stepIndex > 0 ? (
            <button
              type="button"
              className="first-run-button first-run-button-secondary"
              onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
            >
              {copy.back}
            </button>
          ) : (
            <div />
          )}
          <button
            type="button"
            className="first-run-button first-run-button-primary"
            disabled={!canContinue}
            onClick={() => {
              if (stepIndex < copy.steps.length - 1) {
                setStepIndex((value) => value + 1);
                return;
              }
              handleFinish();
            }}
          >
            {stepIndex < copy.steps.length - 1 ? copy.next : copy.finish}
          </button>
        </footer>
      </div>
    </div>
  );
}
