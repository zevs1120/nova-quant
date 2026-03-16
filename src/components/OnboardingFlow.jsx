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
      <section className="modal-card onboarding-card">
        <p className="ritual-kicker">Get set up</p>
        <h3 className="card-title">{t('onboarding.title')}</h3>
        <p className="muted onboarding-subtitle">
          {step === 1
            ? 'Pick the market you want help with first.'
            : step === 2
              ? 'Tell Nova how cautious you want it to be.'
              : 'Choose a few names so the app feels alive from day one.'}
        </p>
        <div className="onboarding-progress" aria-hidden="true">
          {[1, 2, 3].map((item) => (
            <span key={item} className={`onboarding-progress-dot ${item <= step ? 'active' : ''}`} />
          ))}
        </div>

        {step === 1 ? (
          <div className="stack-gap onboarding-choice-grid">
            <button type="button" className={`pill-btn onboarding-choice ${market === 'US' ? 'active' : ''}`} onClick={() => setMarket('US')}>
              {t('common.usStocks')}
              <span className="onboarding-choice-note">Follow familiar names and daily moves.</span>
            </button>
            <button
              type="button"
              className={`pill-btn onboarding-choice ${market === 'CRYPTO' ? 'active' : ''}`}
              onClick={() => {
                setMarket('CRYPTO');
                setWatchlist(['BTC-USDT', 'ETH-USDT']);
              }}
            >
              {t('common.crypto')}
              <span className="onboarding-choice-note">Higher noise, faster moves, tighter discipline.</span>
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="stack-gap onboarding-choice-grid">
            {['conservative', 'balanced', 'aggressive'].map((item) => (
              <button
                key={item}
                type="button"
                className={`pill-btn onboarding-choice ${riskProfile === item ? 'active' : ''}`}
                onClick={() => setRiskProfile(item)}
              >
                {t(`onboarding.profile.${item}`)}
                <span className="onboarding-choice-note">
                  {item === 'conservative'
                    ? 'More waiting. Less regret.'
                    : item === 'balanced'
                      ? 'A steady middle ground.'
                      : 'More ideas, with a firmer hand on the brakes.'}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="stack-gap">
            <p className="muted">{t('onboarding.pickWatchlist')}</p>
            <div className="filter-buttons onboarding-symbol-grid">
              {symbols.map((symbol) => (
                <button
                  key={symbol}
                  type="button"
                  className={`pill-btn onboarding-symbol-chip ${watchlist.includes(symbol) ? 'active' : ''}`}
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
