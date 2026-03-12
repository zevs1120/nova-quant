import { useMemo, useState } from 'react';

const DEFAULT_SYMBOLS = {
  US: ['SPY', 'QQQ', 'AAPL', 'NVDA', 'MSFT', 'TSLA'],
  CRYPTO: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'BNB-USDT']
};

export default function OnboardingFlow({ open, t, onComplete }) {
  const [step, setStep] = useState(1);
  const [market, setMarket] = useState('US');
  const [riskProfile, setRiskProfile] = useState('balanced');
  const [watchlist, setWatchlist] = useState(['SPY', 'QQQ', 'AAPL']);

  const symbols = useMemo(() => DEFAULT_SYMBOLS[market] || [], [market]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal-card">
        <h3 className="card-title">{t('onboarding.title')}</h3>
        <p className="muted">{t('onboarding.step', { n: step })}</p>

        {step === 1 ? (
          <div className="stack-gap">
            <button type="button" className={`pill-btn ${market === 'US' ? 'active' : ''}`} onClick={() => setMarket('US')}>
              {t('common.usStocks')}
            </button>
            <button
              type="button"
              className={`pill-btn ${market === 'CRYPTO' ? 'active' : ''}`}
              onClick={() => {
                setMarket('CRYPTO');
                setWatchlist(['BTC-USDT', 'ETH-USDT']);
              }}
            >
              {t('common.crypto')}
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="stack-gap">
            {['conservative', 'balanced', 'aggressive'].map((item) => (
              <button
                key={item}
                type="button"
                className={`pill-btn ${riskProfile === item ? 'active' : ''}`}
                onClick={() => setRiskProfile(item)}
              >
                {t(`onboarding.profile.${item}`)}
              </button>
            ))}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="stack-gap">
            <p className="muted">{t('onboarding.pickWatchlist')}</p>
            <div className="filter-buttons">
              {symbols.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  className={`pill-btn ${watchlist.includes(symbol) ? 'active' : ''}`}
                  onClick={() =>
                    setWatchlist((current) =>
                      current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]
                    )
                  }
                >
                  {symbol}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="action-row">
          {step > 1 ? (
            <button type="button" className="secondary-btn" onClick={() => setStep((x) => x - 1)}>
              {t('onboarding.back')}
            </button>
          ) : null}
          {step < 3 ? (
            <button type="button" className="primary-btn" onClick={() => setStep((x) => x + 1)}>
              {t('onboarding.next')}
            </button>
          ) : (
            <button
              type="button"
              className="primary-btn"
              onClick={() =>
                onComplete({
                  market,
                  riskProfile,
                  watchlist
                })
              }
            >
              {t('onboarding.finish')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

