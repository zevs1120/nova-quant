import { useEffect, useMemo, useState } from 'react';

const BROKER_OPTIONS = ['Robinhood', 'Webull', 'Fidelity', 'Schwab', 'IBKR', 'E*TRADE', 'Other'];

function buildCopy(locale) {
  const zh = locale?.startsWith('zh');
  return {
    onboarding: [
      {
        title: zh ? '欢迎来到 NovaQuant' : 'Welcome to NovaQuant',
        sub: zh ? '清楚地交易。' : 'Trade with clarity.',
        body: zh
          ? '给想要更清楚日常信号、更简单决策的人，一套原生 AI 的判断界面。'
          : 'AI-native guidance for people who want clearer daily signals and simpler decisions.'
      },
      {
        title: zh ? '先看今天的气候' : 'Know today’s climate',
        body: zh
          ? '几秒内判断：今天该行动、该等待，还是应该更轻一点。'
          : 'See whether today calls for action, patience, or a lighter touch — in seconds.'
      },
      {
        title: zh ? '先问，不必自己解码' : 'Ask. Don’t decode.',
        body: zh
          ? '直接用人话问 Nova，不必独自翻噪音、拆信号。'
          : 'Talk to Nova in plain language instead of digging through noise and signals alone.'
      },
      {
        title: zh ? '接上你常用的券商' : 'Move with your broker',
        body: zh
          ? '继续用你已经习惯的券商 app，NovaQuant 只负责把判断更快送到执行前。'
          : 'Choose the app you already use, and let NovaQuant guide you closer to execution.'
      }
    ],
    swipe: zh ? '左滑继续' : 'Swipe to continue',
    login: zh ? '登录' : 'Log in',
    signUp: zh ? '注册' : 'Sign up',
    enterEmail: zh ? '输入你的邮箱' : 'Enter your email',
    emailPlaceholder: zh ? 'name@email.com' : 'name@email.com',
    callName: zh ? '我们怎么称呼你？' : 'What should we call you?',
    namePlaceholder: zh ? '你的名字' : 'Your name',
    chooseTrade: zh ? '选择你的交易方式' : 'Choose how you trade',
    chooseBroker: zh ? '你用哪个券商？' : 'Which broker do you use?',
    brokerNote: zh ? '之后我们会用它帮你更快跳转到券商 app。' : 'We’ll use this later to help you jump into your broker app faster.',
    continue: zh ? '继续' : 'Continue',
    back: zh ? '返回' : 'Back',
    finish: zh ? '开始使用' : 'Start',
    forgotPassword: zh ? '忘记密码？' : 'Forgot password?',
    resetPassword: zh ? '重置密码' : 'Reset password',
    sendCode: zh ? '发送重置码' : 'Send code',
    resetCodeLabel: zh ? '重置码' : 'Reset code',
    resetCodePlaceholder: zh ? '输入 6 位重置码' : 'Enter the 6-digit code',
    newPasswordPlaceholder: zh ? '设置新密码（至少 8 位）' : 'Create a new password (8+ characters)',
    resetHelper: zh ? '先发送重置码，再输入新密码完成重置。' : 'Send a reset code first, then choose a new password.',
    resetInfoTemplate: zh
      ? ({ minutes, code }) => `重置码 ${code ? `已发送：${code}` : '已发送'}，${minutes} 分钟内有效。`
      : ({ minutes, code }) => `Reset code ${code ? `${code}` : 'sent'} — valid for ${minutes} minutes.`,
    resetSuccess: zh ? '密码已更新，现在可以直接登录。' : 'Password updated. You can log in now.',
    step: zh ? '步骤' : 'Step',
    modeCards: [
      {
        key: 'starter',
        title: zh ? '入门' : 'Starter',
        body: zh ? '更清楚、更简单的日常判断。' : 'Clear, simple daily guidance'
      },
      {
        key: 'active',
        title: zh ? '主动' : 'Active',
        body: zh ? '更快的信号，更快的决定。' : 'Faster signals, quicker decisions'
      },
      {
        key: 'deep',
        title: zh ? '深度' : 'Deep',
        body: zh ? '更多细节，更多上下文。' : 'More nuance, more context'
      }
    ]
  };
}

function Dots({ count, activeIndex }) {
  return (
    <div className="onboarding-page-dots" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={`onboarding-page-dot ${index === activeIndex ? 'active' : ''}`} />
      ))}
    </div>
  );
}

function SignalCityArt() {
  return (
    <svg viewBox="0 0 360 300" className="onboarding-artboard" aria-hidden="true">
      <rect x="0" y="186" width="360" height="114" rx="18" className="ob-ground" />
      <path d="M22 220C78 202 118 202 170 220C214 236 266 238 338 210" className="ob-route" />
      <rect x="32" y="118" width="62" height="102" rx="18" className="ob-block ob-block-indigo" />
      <rect x="112" y="96" width="44" height="124" rx="16" className="ob-block ob-block-cyan" />
      <rect x="172" y="76" width="56" height="144" rx="20" className="ob-block ob-block-pink" />
      <rect x="246" y="110" width="70" height="110" rx="18" className="ob-block ob-block-neutral" />
      <circle cx="62" cy="100" r="16" className="ob-node ob-node-cyan" />
      <circle cx="142" cy="70" r="14" className="ob-node ob-node-pink" />
      <circle cx="204" cy="46" r="18" className="ob-node ob-node-indigo" />
      <circle cx="294" cy="82" r="14" className="ob-node ob-node-cyan" />
      <path d="M60 100L140 70L204 46L294 82" className="ob-link" />
      <rect x="138" y="204" width="84" height="58" rx="29" className="ob-ring-shell" />
      <circle cx="180" cy="233" r="24" className="ob-ring-core" />
      <path d="M171 233L178 240L192 225" className="ob-glyph" />
    </svg>
  );
}

function ClimatePanelArt() {
  return (
    <svg viewBox="0 0 360 300" className="onboarding-artboard" aria-hidden="true">
      <rect x="34" y="48" width="292" height="204" rx="34" className="ob-panel" />
      <circle cx="116" cy="126" r="46" className="ob-ring-shell" />
      <circle cx="116" cy="126" r="29" className="ob-ring-core" />
      <circle cx="202" cy="126" r="46" className="ob-ring-shell ob-ring-shell-cyan" />
      <circle cx="202" cy="126" r="29" className="ob-ring-core ob-ring-core-cyan" />
      <circle cx="288" cy="126" r="46" className="ob-ring-shell ob-ring-shell-pink" />
      <circle cx="288" cy="126" r="29" className="ob-ring-core ob-ring-core-pink" />
      <rect x="74" y="204" width="212" height="18" rx="9" className="ob-pill-track" />
      <rect x="74" y="204" width="128" height="18" rx="9" className="ob-pill-fill" />
      <path d="M98 154H134" className="ob-mini-line" />
      <path d="M184 154H220" className="ob-mini-line" />
      <path d="M270 154H306" className="ob-mini-line" />
    </svg>
  );
}

function AiPresenceArt() {
  return (
    <svg viewBox="0 0 360 300" className="onboarding-artboard" aria-hidden="true">
      <path d="M40 214C88 160 112 122 180 92C252 60 290 70 320 120" className="ob-wave" />
      <path d="M48 236C118 192 156 176 196 164C258 146 286 148 324 176" className="ob-wave ob-wave-cyan" />
      <path d="M70 76L146 126L112 186" className="ob-link" />
      <path d="M290 74L218 126L246 188" className="ob-link" />
      <circle cx="180" cy="154" r="66" className="ob-presence" />
      <circle cx="180" cy="154" r="34" className="ob-presence-core" />
      <circle cx="92" cy="70" r="14" className="ob-node ob-node-indigo" />
      <circle cx="268" cy="76" r="14" className="ob-node ob-node-pink" />
      <circle cx="88" cy="222" r="12" className="ob-node ob-node-cyan" />
      <circle cx="276" cy="226" r="12" className="ob-node ob-node-indigo" />
      <path d="M166 154H194" className="ob-glyph" />
      <path d="M180 140V168" className="ob-glyph" />
    </svg>
  );
}

function BrokerBridgeArt() {
  return (
    <svg viewBox="0 0 360 300" className="onboarding-artboard" aria-hidden="true">
      <rect x="44" y="64" width="124" height="172" rx="32" className="ob-device" />
      <rect x="192" y="96" width="124" height="140" rx="28" className="ob-device ob-device-alt" />
      <rect x="78" y="102" width="58" height="18" rx="9" className="ob-app-pill ob-app-pill-indigo" />
      <rect x="78" y="132" width="74" height="18" rx="9" className="ob-app-pill ob-app-pill-cyan" />
      <rect x="78" y="162" width="46" height="18" rx="9" className="ob-app-pill ob-app-pill-pink" />
      <rect x="220" y="132" width="70" height="48" rx="20" className="ob-handoff-core" />
      <path d="M154 150H206" className="ob-link" />
      <path d="M198 140L214 150L198 160" className="ob-glyph" />
      <circle cx="118" cy="208" r="18" className="ob-node ob-node-indigo" />
      <circle cx="250" cy="208" r="18" className="ob-node ob-node-cyan" />
    </svg>
  );
}

const ILLUSTRATIONS = [SignalCityArt, ClimatePanelArt, AiPresenceArt, BrokerBridgeArt];

export default function OnboardingFlow({
  open,
  locale,
  profile,
  initialMode = 'intro',
  onLogin,
  onRequestReset,
  onResetPassword,
  onComplete
}) {
  const copy = useMemo(() => buildCopy(locale), [locale]);
  const [mode, setMode] = useState('intro');
  const [pageIndex, setPageIndex] = useState(0);
  const [signupStep, setSignupStep] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [email, setEmail] = useState(profile?.email || '');
  const [password, setPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState(profile?.email || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginInfo, setLoginInfo] = useState('');
  const [signupError, setSignupError] = useState('');
  const [resetEmail, setResetEmail] = useState(profile?.email || '');
  const [resetCode, setResetCode] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetInfo, setResetInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(profile?.name || '');
  const [tradeMode, setTradeMode] = useState(profile?.tradeMode || 'starter');
  const [broker, setBroker] = useState(profile?.broker || 'Robinhood');

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setPageIndex(0);
    setSignupStep(0);
    setEmail(profile?.email || '');
    setPassword('');
    setLoginEmail(profile?.email || '');
    setLoginPassword('');
    setLoginError('');
    setLoginInfo('');
    setSignupError('');
    setResetEmail(profile?.email || '');
    setResetCode('');
    setResetPasswordValue('');
    setResetError('');
    setResetInfo('');
    setSubmitting(false);
    setName(profile?.name || '');
    setTradeMode(profile?.tradeMode || 'starter');
    setBroker(profile?.broker || 'Robinhood');
  }, [initialMode, open, profile]);

  if (!open) return null;

  const currentPage = copy.onboarding[pageIndex];
  const Illustration = ILLUSTRATIONS[pageIndex];

  const emailValid = /\S+@\S+\.\S+/.test(email);
  const passwordValid = String(password).trim().length >= 8;
  const loginReady = /\S+@\S+\.\S+/.test(loginEmail) && String(loginPassword).trim().length >= 8;
  const resetCodeReady = /\S+@\S+\.\S+/.test(resetEmail) && String(resetCode).trim().length >= 6 && String(resetPasswordValue).trim().length >= 8;
  const canContinue =
    signupStep === 0
      ? emailValid && passwordValid
      : signupStep === 1
        ? String(name).trim().length >= 2
        : Boolean(tradeMode && broker);

  const backgroundClass = `onboarding-stage-${pageIndex + 1}`;

  const handleSwipeStart = (event) => {
    if (mode !== 'intro') return;
    setTouchStartX(event.touches[0]?.clientX ?? null);
  };

  const handleSwipeEnd = (event) => {
    if (mode !== 'intro' || touchStartX == null) return;
    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX;
    if (delta < -40 && pageIndex < copy.onboarding.length - 1) {
      setPageIndex((value) => value + 1);
    } else if (delta > 40 && pageIndex > 0) {
      setPageIndex((value) => value - 1);
    }
    setTouchStartX(null);
  };

  return (
    <div className="onboarding-flow">
      {mode === 'intro' ? (
        <section
          className={`onboarding-stage ${backgroundClass}`}
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          <div className="onboarding-copy-wrap">
            <p className="onboarding-subhead">{currentPage.sub || copy.swipe}</p>
            <h1 className="onboarding-title">{currentPage.title}</h1>
            <p className="onboarding-body">{currentPage.body}</p>
          </div>

          <div className="onboarding-art-wrap">
            <Illustration />
          </div>

          <div className="onboarding-fixed-footer">
            <Dots count={copy.onboarding.length} activeIndex={pageIndex} />
            <div className="onboarding-actions">
              <button
                type="button"
                className="onboarding-btn onboarding-btn-secondary"
                onClick={() => {
                  setMode('login');
                  setLoginError('');
                }}
              >
                {copy.login}
              </button>
              <button type="button" className="onboarding-btn onboarding-btn-primary" onClick={() => setMode('signup')}>
                {copy.signUp}
              </button>
            </div>
          </div>
        </section>
      ) : mode === 'login' ? (
        <section className="signup-stage">
          <div className="signup-stage-head">
            <button type="button" className="signup-back" onClick={() => setMode('intro')}>
              {copy.back}
            </button>
            <Dots count={1} activeIndex={0} />
          </div>

          <div className="signup-stage-body">
            <div className="signup-field-wrap signup-field-wrap-wide">
              <h1 className="signup-title">{copy.login}</h1>
              <div className="signup-input-shell">
                <input
                  className="signup-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={copy.emailPlaceholder}
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                />
              </div>
              <div className="signup-input-shell">
                <input
                  className="signup-input"
                  type="password"
                  autoComplete="current-password"
                  placeholder={locale?.startsWith('zh') ? '输入密码' : 'Enter your password'}
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="signup-inline-action"
                onClick={() => {
                  setMode('reset');
                  setResetEmail(loginEmail || profile?.email || '');
                  setResetError('');
                  setResetInfo('');
                }}
              >
                {copy.forgotPassword}
              </button>
              {loginInfo ? <p className="signup-success">{loginInfo}</p> : null}
              {loginError ? <p className="signup-error">{loginError}</p> : null}
            </div>
          </div>

          <div className="signup-fixed-footer">
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary signup-continue"
              disabled={!loginReady || submitting}
              onClick={async () => {
                if (!onLogin || submitting || !loginReady) return;
                setSubmitting(true);
                setLoginError('');
                setLoginInfo('');
                try {
                  const result = await onLogin({
                    email: loginEmail,
                    password: loginPassword
                  });
                  if (result?.ok === false) {
                    setLoginError(result.error || (locale?.startsWith('zh') ? '账号或密码不正确。' : 'The email or password is incorrect.'));
                  }
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? (locale?.startsWith('zh') ? '正在登录…' : 'Logging in…') : copy.login}
            </button>
          </div>
        </section>
      ) : mode === 'reset' ? (
        <section className="signup-stage">
          <div className="signup-stage-head">
            <button
              type="button"
              className="signup-back"
              onClick={() => {
                setMode('login');
                setResetError('');
                setResetInfo('');
              }}
            >
              {copy.back}
            </button>
            <Dots count={1} activeIndex={0} />
          </div>

          <div className="signup-stage-body">
            <div className="signup-field-wrap signup-field-wrap-wide">
              <h1 className="signup-title">{copy.resetPassword}</h1>
              <p className="signup-note">{copy.resetHelper}</p>
              <div className="signup-input-shell">
                <input
                  className="signup-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={copy.emailPlaceholder}
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                />
              </div>
              <div className="signup-inline-row">
                <div className="signup-input-shell signup-input-shell-flex">
                  <input
                    className="signup-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={copy.resetCodePlaceholder}
                    value={resetCode}
                    onChange={(event) => setResetCode(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="signup-inline-cta"
                  disabled={submitting || !/\S+@\S+\.\S+/.test(resetEmail)}
                  onClick={async () => {
                    if (!onRequestReset || submitting || !/\S+@\S+\.\S+/.test(resetEmail)) return;
                    setSubmitting(true);
                    setResetError('');
                    setResetInfo('');
                    try {
                      const result = await onRequestReset({ email: resetEmail });
                  if (result?.ok === false) {
                        setResetError(result.error || (locale?.startsWith('zh') ? '暂时没法发送重置码。' : 'Could not send a reset code right now.'));
                        return;
                      }
                      setResetInfo(
                        copy.resetInfoTemplate({
                          minutes: result?.expiresInMinutes || 15,
                          code: result?.codeHint || ''
                        })
                      );
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                >
                  {copy.sendCode}
                </button>
              </div>
              <div className="signup-input-shell">
                <input
                  className="signup-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder={copy.newPasswordPlaceholder}
                  value={resetPasswordValue}
                  onChange={(event) => setResetPasswordValue(event.target.value)}
                />
              </div>
              {resetInfo ? <p className="signup-success">{resetInfo}</p> : null}
              {resetError ? <p className="signup-error">{resetError}</p> : null}
            </div>
          </div>

          <div className="signup-fixed-footer">
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary signup-continue"
              disabled={!resetCodeReady || submitting}
              onClick={async () => {
                if (!onResetPassword || submitting || !resetCodeReady) return;
                setSubmitting(true);
                setResetError('');
                try {
                  const result = await onResetPassword({
                    email: resetEmail,
                    code: resetCode,
                    newPassword: resetPasswordValue
                  });
                  if (result?.ok === false) {
                    setResetError(result.error || (locale?.startsWith('zh') ? '重置没有成功，请重试。' : 'Reset did not complete. Please try again.'));
                    return;
                  }
                  setLoginInfo(copy.resetSuccess);
                  setLoginEmail(resetEmail);
                  setLoginPassword('');
                  setResetCode('');
                  setResetPasswordValue('');
                  setResetInfo('');
                  setMode('login');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? (locale?.startsWith('zh') ? '正在重置…' : 'Resetting…') : copy.resetPassword}
            </button>
          </div>
        </section>
      ) : (
        <section className="signup-stage">
          <div className="signup-stage-head">
            {signupStep > 0 ? (
              <button type="button" className="signup-back" onClick={() => setSignupStep((value) => value - 1)}>
                {copy.back}
              </button>
            ) : (
              <button type="button" className="signup-back" onClick={() => setMode('intro')}>
                {copy.back}
              </button>
            )}
            <Dots count={3} activeIndex={signupStep} />
          </div>

          <div className="signup-stage-body">
            {signupStep === 0 ? (
              <div className="signup-field-wrap">
                <h1 className="signup-title">{copy.enterEmail}</h1>
                <div className="signup-input-shell">
                  <input
                    className="signup-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder={copy.emailPlaceholder}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="signup-input-shell">
                  <input
                    className="signup-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder={locale?.startsWith('zh') ? '创建密码（至少 8 位）' : 'Create a password (8+ characters)'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                {signupError && signupStep === 0 ? <p className="signup-error">{signupError}</p> : null}
              </div>
            ) : null}

            {signupStep === 1 ? (
              <div className="signup-field-wrap">
                <h1 className="signup-title">{copy.callName}</h1>
                <div className="signup-input-shell">
                  <input
                    className="signup-input"
                    type="text"
                    autoComplete="name"
                    placeholder={copy.namePlaceholder}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {signupStep === 2 ? (
              <div className="signup-field-wrap signup-field-wrap-wide">
                <div className="signup-section">
                  <h1 className="signup-title">{copy.chooseTrade}</h1>
                  <div className="signup-mode-grid">
                    {copy.modeCards.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={`signup-mode-card ${tradeMode === item.key ? 'active' : ''}`}
                        onClick={() => setTradeMode(item.key)}
                      >
                        <span className="signup-mode-title">{item.title}</span>
                        <span className="signup-mode-copy">{item.body}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="signup-section">
                  <h2 className="signup-section-title">{copy.chooseBroker}</h2>
                  <div className="signup-broker-grid">
                    {BROKER_OPTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`signup-broker-tile ${broker === item ? 'active' : ''}`}
                        onClick={() => setBroker(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <p className="signup-note">{copy.brokerNote}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="signup-fixed-footer">
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary signup-continue"
              disabled={!canContinue}
              onClick={() => {
                if (signupStep < 2) {
                  setSignupError('');
                  setSignupStep((value) => value + 1);
                  return;
                }
                void (async () => {
                  if (submitting) return;
                  setSubmitting(true);
                  setSignupError('');
                  try {
                    const result = await onComplete({
                      email,
                      password,
                      name,
                      tradeMode,
                      broker
                    });
                    if (result?.ok === false) {
                      setSignupError(result.error || (locale?.startsWith('zh') ? '注册没有成功，请稍后再试。' : 'Sign up did not complete. Please try again.'));
                      setSignupStep(0);
                    }
                  } finally {
                    setSubmitting(false);
                  }
                })();
              }}
            >
              {submitting ? (locale?.startsWith('zh') ? '正在创建…' : 'Creating…') : signupStep < 2 ? copy.continue : copy.finish}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
