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
          ? '每天只看最重要的判断，少一点噪音，快一点做决定。'
          : 'See only the most important call each day, with less noise and faster decisions.',
      },
      {
        title: zh ? '直接问 Nova' : 'Ask Nova directly',
        body: zh
          ? '直接问现在最重要的事，拿到能马上理解、马上使用的回答。'
          : 'Ask what matters now and get an answer you can understand and use right away.',
      },
      {
        title: zh ? '继续用你的券商' : 'Keep your broker',
        body: zh
          ? '继续用你熟悉的 app，NovaQuant 只负责把判断更快送到执行前。'
          : 'Stay with the app you already know, and let NovaQuant move your decisions closer to execution.',
      },
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
    brokerNote: zh
      ? '之后我们会用它帮你更快跳转到券商 app。'
      : 'We’ll use this later to help you jump into your broker app faster.',
    continue: zh ? '继续' : 'Continue',
    back: zh ? '返回' : 'Back',
    finish: zh ? '开始使用' : 'Start',
    forgotPassword: zh ? '忘记密码？' : 'Forgot password?',
    resetPassword: zh ? '重置密码' : 'Reset password',
    sendCode: zh ? '发送恢复邮件' : 'Send recovery email',
    resendVerification: zh ? '重发验证邮件' : 'Resend verification email',
    backToLogin: zh ? '回到登录' : 'Back to login',
    verifyEmailTitle: zh ? '先验证你的邮箱' : 'Verify your email first',
    verifyEmailBody: zh
      ? '我们已经把验证邮件发到这个邮箱。完成验证之前，账号不会进入系统。'
      : 'We sent a verification email to this address. Your account will not enter the app until that email is confirmed.',
    verifyEmailHint: zh
      ? '如果没看到邮件，请先检查垃圾邮件，再点下面重发。'
      : 'If you do not see the message, check spam first and then resend below.',
    newPasswordPlaceholder: zh
      ? '设置新密码（至少 8 位）'
      : 'Create a new password (8+ characters)',
    resetHelper: zh
      ? '我们会把恢复链接发到你的邮箱。点开邮件里的链接后，再回来设置新密码。'
      : 'We will send a recovery link to your email. Open that link, then come back here to set a new password.',
    recoveryHelper: zh
      ? '邮箱链接已经验证。现在直接设置一个新密码。'
      : 'Your recovery link is verified. Set a new password now.',
    resetInfoTemplate: zh
      ? () => '恢复邮件已发送，请从邮件里的链接继续。'
      : () => 'Recovery email sent. Continue from the link in your inbox.',
    resetSuccess: zh ? '密码已更新，现在可以直接登录。' : 'Password updated. You can log in now.',
    step: zh ? '步骤' : 'Step',
    modeCards: [
      {
        key: 'starter',
        title: zh ? '入门' : 'Starter',
        body: zh ? '更清楚、更简单的日常判断。' : 'Clear, simple daily guidance',
      },
      {
        key: 'active',
        title: zh ? '主动' : 'Active',
        body: zh ? '更快的信号，更快的决定。' : 'Faster signals, quicker decisions',
      },
      {
        key: 'deep',
        title: zh ? '深度' : 'Deep',
        body: zh ? '更多细节，更多上下文。' : 'More nuance, more context',
      },
    ],
  };
}

function Dots({ count, activeIndex }) {
  return (
    <div className="onboarding-page-dots" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className={`onboarding-page-dot ${index === activeIndex ? 'active' : ''}`}
        />
      ))}
    </div>
  );
}

function IntroPoster({ pageIndex, page, locale }) {
  const zh = locale?.startsWith('zh');
  const labels = zh
    ? ['认识 NovaQuant', '直接问 Nova', '继续用你的券商']
    : ['Meet NovaQuant', 'Ask Nova', 'Keep Your Broker'];
  const step = String(pageIndex + 1).padStart(2, '0');

  return (
    <div
      className={`onboarding-poster onboarding-poster-text onboarding-poster-text-${pageIndex + 1}`}
    >
      <div className="onboarding-poster-text-shell">
        <div className="onboarding-poster-text-meta" aria-hidden="true">
          <span className="onboarding-poster-text-step">{step}</span>
          <span className="onboarding-poster-text-divider" />
        </div>

        <span className="onboarding-poster-kicker onboarding-poster-kicker-text">
          {labels[pageIndex]}
        </span>

        <h1 className="onboarding-poster-title onboarding-poster-title-text">{page.title}</h1>
        {page.sub ? <p className="onboarding-poster-text-sub">{page.sub}</p> : null}
        <p className="onboarding-poster-note onboarding-poster-note-text">{page.body}</p>
      </div>
    </div>
  );
}

function SignalCityArt() {
  return (
    <svg viewBox="0 0 360 300" className="onboarding-artboard" aria-hidden="true">
      <rect x="30" y="34" width="300" height="220" rx="32" className="ob-editorial-panel" />
      <rect x="40" y="46" width="128" height="20" className="ob-flat ob-flat-pink" />
      <rect x="260" y="48" width="44" height="86" className="ob-flat ob-flat-blue" />
      <rect x="224" y="188" width="80" height="46" className="ob-flat ob-flat-yellow" />
      <rect x="66" y="206" width="138" height="20" className="ob-flat ob-flat-green" />

      <text x="52" y="61" className="ob-editorial-kicker">
        MEET NOVAQUANT
      </text>

      <text x="52" y="116" className="ob-editorial-title">
        MEET
      </text>
      <text x="52" y="160" className="ob-editorial-title">
        NOVA
      </text>
      <text x="52" y="210" className="ob-editorial-title ob-editorial-title-offset">
        QUANT
      </text>

      <rect
        x="224"
        y="152"
        width="74"
        height="16"
        rx="8"
        className="ob-card-pill ob-card-pill-outline"
      />
      <rect
        x="224"
        y="176"
        width="52"
        height="10"
        rx="5"
        className="ob-card-line ob-card-line-soft"
      />
      <rect x="224" y="192" width="68" height="12" rx="6" className="ob-card-line" />
    </svg>
  );
}

function ClimatePanelArt() {
  return (
    <svg viewBox="0 0 360 300" className="onboarding-artboard" aria-hidden="true">
      <rect x="34" y="48" width="292" height="204" rx="34" className="ob-panel" />

      <rect
        x="58"
        y="70"
        width="64"
        height="16"
        rx="8"
        className="ob-card-pill ob-card-pill-indigo"
      />
      <rect
        x="248"
        y="70"
        width="50"
        height="16"
        rx="8"
        className="ob-card-pill ob-card-pill-green"
      />

      <circle cx="106" cy="134" r="44" className="ob-ring-shell" />
      <circle cx="106" cy="134" r="28" className="ob-ring-core" />
      <path d="M106 116V134L124 144" className="ob-mini-line" />

      <rect x="166" y="98" width="118" height="44" rx="18" className="ob-card-stat" />
      <rect
        x="182"
        y="112"
        width="46"
        height="10"
        rx="5"
        className="ob-card-line ob-card-line-soft"
      />
      <rect x="182" y="128" width="74" height="12" rx="6" className="ob-card-line" />

      <rect x="166" y="152" width="52" height="46" rx="18" className="ob-card-stat" />
      <rect x="228" y="152" width="56" height="46" rx="18" className="ob-card-stat" />
      <rect
        x="180"
        y="168"
        width="22"
        height="10"
        rx="5"
        className="ob-card-line ob-card-line-soft"
      />
      <rect x="180" y="184" width="30" height="10" rx="5" className="ob-card-line" />
      <rect
        x="244"
        y="168"
        width="24"
        height="10"
        rx="5"
        className="ob-card-line ob-card-line-soft"
      />
      <rect x="244" y="184" width="32" height="10" rx="5" className="ob-card-line" />

      <rect x="58" y="214" width="244" height="18" rx="9" className="ob-meter-track" />
      <rect x="58" y="214" width="156" height="18" rx="9" className="ob-meter-fill" />
      <rect
        x="76"
        y="162"
        width="60"
        height="14"
        rx="7"
        className="ob-card-pill ob-card-pill-cyan"
      />
      <rect
        x="76"
        y="184"
        width="44"
        height="10"
        rx="5"
        className="ob-card-line ob-card-line-soft"
      />
    </svg>
  );
}

function AiPresenceArt() {
  return (
    <svg viewBox="0 0 360 300" className="onboarding-artboard" aria-hidden="true">
      <rect x="52" y="58" width="256" height="186" rx="34" className="ob-chat-window" />
      <rect
        x="72"
        y="78"
        width="84"
        height="16"
        rx="8"
        className="ob-card-pill ob-card-pill-indigo"
      />
      <rect
        x="242"
        y="78"
        width="40"
        height="16"
        rx="8"
        className="ob-card-pill ob-card-pill-outline"
      />

      <rect x="72" y="110" width="166" height="46" rx="20" className="ob-chat-bubble" />
      <rect
        x="88"
        y="126"
        width="58"
        height="10"
        rx="5"
        className="ob-chat-line ob-chat-line-soft"
      />
      <rect x="88" y="142" width="118" height="10" rx="5" className="ob-chat-line" />

      <rect
        x="122"
        y="168"
        width="166"
        height="52"
        rx="22"
        className="ob-chat-bubble ob-chat-bubble-dark"
      />
      <rect
        x="142"
        y="186"
        width="70"
        height="10"
        rx="5"
        className="ob-chat-line ob-chat-line-light"
      />
      <rect
        x="142"
        y="202"
        width="112"
        height="10"
        rx="5"
        className="ob-chat-line ob-chat-line-light-soft"
      />

      <circle cx="286" cy="126" r="18" className="ob-node ob-node-cyan" />
      <circle cx="88" cy="198" r="14" className="ob-node ob-node-pink" />
      <path d="M88 198H118" className="ob-link" />
      <path d="M238 132H268" className="ob-link" />
    </svg>
  );
}

function BrokerBridgeArt() {
  return (
    <svg viewBox="0 0 360 300" className="onboarding-artboard" aria-hidden="true">
      <rect x="42" y="60" width="122" height="178" rx="30" className="ob-device" />
      <rect x="196" y="88" width="122" height="150" rx="28" className="ob-device ob-device-alt" />

      <rect
        x="66"
        y="88"
        width="54"
        height="16"
        rx="8"
        className="ob-app-pill ob-app-pill-indigo"
      />
      <rect x="66" y="116" width="72" height="16" rx="8" className="ob-app-pill ob-app-pill-cyan" />
      <rect x="66" y="144" width="48" height="16" rx="8" className="ob-app-pill ob-app-pill-pink" />
      <rect
        x="66"
        y="186"
        width="74"
        height="22"
        rx="11"
        className="ob-card-button ob-card-button-dark"
      />

      <path d="M154 156H208" className="ob-link" />
      <circle cx="181" cy="156" r="20" className="ob-handoff-core" />
      <path d="M172 156H190" className="ob-glyph" />
      <path d="M184 148L192 156L184 164" className="ob-glyph" />

      <rect
        x="220"
        y="116"
        width="42"
        height="16"
        rx="8"
        className="ob-card-pill ob-card-pill-outline"
      />
      <rect
        x="220"
        y="144"
        width="74"
        height="18"
        rx="9"
        className="ob-broker-tile ob-broker-tile-active"
      />
      <rect x="220" y="170" width="74" height="18" rx="9" className="ob-broker-tile" />
      <rect x="220" y="196" width="74" height="18" rx="9" className="ob-broker-tile" />
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
  onComplete,
  onResendVerification,
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
  const [signupInfo, setSignupInfo] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resetEmail, setResetEmail] = useState(profile?.email || '');
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
    setSignupInfo('');
    setVerificationEmail('');
    setResetEmail(profile?.email || '');
    setResetPasswordValue('');
    setResetError('');
    setResetInfo('');
    setSubmitting(false);
    setName(profile?.name || '');
    setTradeMode(profile?.tradeMode || 'starter');
    setBroker(profile?.broker || 'Robinhood');
  }, [initialMode, open, profile]);

  if (!open) return null;

  const emailValid = /\S+@\S+\.\S+/.test(email);
  const passwordValid = String(password).trim().length >= 8;
  const normalizedLoginIdentifier = String(loginEmail || '')
    .trim()
    .toLowerCase();
  const testAccountLogin =
    normalizedLoginIdentifier === 'test' && String(loginPassword || '') === 'test';
  const loginReady =
    (/\S+@\S+\.\S+/.test(loginEmail) && String(loginPassword).trim().length >= 8) ||
    testAccountLogin;
  const resetRequestReady = /\S+@\S+\.\S+/.test(resetEmail);
  const recoveryReady = String(resetPasswordValue).trim().length >= 8;
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
          <IntroPoster pageIndex={pageIndex} page={copy.onboarding[pageIndex]} locale={locale} />

          <div className="onboarding-fixed-footer">
            <Dots count={copy.onboarding.length} activeIndex={pageIndex} />
            <div className="onboarding-actions">
              <button
                type="button"
                className="onboarding-btn onboarding-btn-secondary"
                onClick={() => {
                  setMode('login');
                  setLoginError('');
                  setSignupInfo('');
                  setVerificationEmail('');
                }}
              >
                {copy.login}
              </button>
              <button
                type="button"
                className="onboarding-btn onboarding-btn-primary"
                onClick={() => {
                  setMode('signup');
                  setVerificationEmail('');
                }}
              >
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
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder={locale?.startsWith('zh') ? '输入邮箱或 test' : 'Enter email or test'}
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
              {signupInfo ? <p className="signup-success">{signupInfo}</p> : null}
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
                    password: loginPassword,
                  });
                  if (result?.ok === false) {
                    setLoginError(
                      result.error ||
                        (locale?.startsWith('zh')
                          ? '账号或密码不正确。'
                          : 'The email or password is incorrect.'),
                    );
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
              {resetInfo ? <p className="signup-success">{resetInfo}</p> : null}
              {resetError ? <p className="signup-error">{resetError}</p> : null}
            </div>
          </div>

          <div className="signup-fixed-footer">
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary signup-continue"
              disabled={!resetRequestReady || submitting}
              onClick={async () => {
                if (!onRequestReset || submitting || !resetRequestReady) return;
                setSubmitting(true);
                setResetError('');
                setResetInfo('');
                try {
                  const result = await onRequestReset({ email: resetEmail });
                  if (result?.ok === false) {
                    setResetError(
                      result.error ||
                        (locale?.startsWith('zh')
                          ? '暂时没法发送恢复邮件。'
                          : 'Could not send a recovery email right now.'),
                    );
                    return;
                  }
                  setResetInfo(result?.info || copy.resetInfoTemplate({}));
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? (locale?.startsWith('zh') ? '正在发送…' : 'Sending…') : copy.sendCode}
            </button>
          </div>
        </section>
      ) : mode === 'recover' ? (
        <section className="signup-stage">
          <div className="signup-stage-head">
            <span className="signup-back" aria-hidden="true" />
            <Dots count={1} activeIndex={0} />
          </div>

          <div className="signup-stage-body">
            <div className="signup-field-wrap signup-field-wrap-wide">
              <h1 className="signup-title">{copy.resetPassword}</h1>
              <p className="signup-note">{copy.recoveryHelper}</p>
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
              disabled={!recoveryReady || submitting}
              onClick={async () => {
                if (!onResetPassword || submitting || !recoveryReady) return;
                setSubmitting(true);
                setResetError('');
                try {
                  const result = await onResetPassword({
                    newPassword: resetPasswordValue,
                  });
                  if (result?.ok === false) {
                    setResetError(
                      result.error ||
                        (locale?.startsWith('zh')
                          ? '重置没有成功，请重试。'
                          : 'Reset did not complete. Please try again.'),
                    );
                    return;
                  }
                  setResetInfo(copy.resetSuccess);
                  setResetPasswordValue('');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting
                ? locale?.startsWith('zh')
                  ? '正在重置…'
                  : 'Resetting…'
                : copy.resetPassword}
            </button>
          </div>
        </section>
      ) : mode === 'verify' ? (
        <section className="signup-stage">
          <div className="signup-stage-head">
            <button
              type="button"
              className="signup-back"
              onClick={() => {
                setMode('login');
                setLoginEmail(verificationEmail || email || profile?.email || '');
                setSignupError('');
              }}
            >
              {copy.back}
            </button>
            <Dots count={1} activeIndex={0} />
          </div>

          <div className="signup-stage-body">
            <div className="signup-field-wrap signup-field-wrap-wide">
              <h1 className="signup-title">{copy.verifyEmailTitle}</h1>
              <p className="signup-note">{copy.verifyEmailBody}</p>
              <div className="signup-input-shell">
                <input
                  className="signup-input"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={verificationEmail || email || profile?.email || ''}
                  readOnly
                />
              </div>
              <p className="signup-note">{copy.verifyEmailHint}</p>
              {signupInfo ? <p className="signup-success">{signupInfo}</p> : null}
              {signupError ? <p className="signup-error">{signupError}</p> : null}
            </div>
          </div>

          <div className="signup-fixed-footer">
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary signup-continue"
              disabled={submitting}
              onClick={async () => {
                if (!onResendVerification || submitting) return;
                setSubmitting(true);
                setSignupError('');
                try {
                  const result = await onResendVerification({
                    email: verificationEmail || email,
                  });
                  if (result?.ok === false) {
                    setSignupError(
                      result.error ||
                        (locale?.startsWith('zh')
                          ? '暂时没法重发验证邮件。'
                          : 'Could not resend the verification email right now.'),
                    );
                    return;
                  }
                  setSignupInfo(
                    result?.info ||
                      (locale?.startsWith('zh')
                        ? '验证邮件已重新发送，请检查收件箱。'
                        : 'Verification email resent. Please check your inbox.'),
                  );
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting
                ? locale?.startsWith('zh')
                  ? '正在发送…'
                  : 'Sending…'
                : copy.resendVerification}
            </button>
            <button
              type="button"
              className="onboarding-btn onboarding-btn-secondary"
              onClick={() => {
                setMode('login');
                setLoginEmail(verificationEmail || email || profile?.email || '');
                setSignupError('');
              }}
            >
              {copy.backToLogin}
            </button>
          </div>
        </section>
      ) : (
        <section className="signup-stage">
          <div className="signup-stage-head">
            {signupStep > 0 ? (
              <button
                type="button"
                className="signup-back"
                onClick={() => setSignupStep((value) => value - 1)}
              >
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
                    placeholder={
                      locale?.startsWith('zh')
                        ? '创建密码（至少 8 位）'
                        : 'Create a password (8+ characters)'
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
                {signupError && signupStep === 0 ? (
                  <p className="signup-error">{signupError}</p>
                ) : null}
                {signupInfo && signupStep === 0 ? (
                  <p className="signup-success">{signupInfo}</p>
                ) : null}
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
                  setSignupInfo('');
                  try {
                    const result = await onComplete({
                      email,
                      password,
                      name,
                      tradeMode,
                      broker,
                    });
                    if (result?.ok === false) {
                      setSignupError(
                        result.error ||
                          (locale?.startsWith('zh')
                            ? '注册没有成功，请稍后再试。'
                            : 'Sign up did not complete. Please try again.'),
                      );
                      setSignupStep(0);
                      return;
                    }
                    if (result?.pendingConfirmation) {
                      setVerificationEmail(email);
                      setSignupInfo(
                        result.info ||
                          (locale?.startsWith('zh')
                            ? '验证邮件已经发出。请先完成邮箱验证，再回来登录。'
                            : 'Check your inbox and confirm your email before logging in.'),
                      );
                      setSignupStep(0);
                      setPassword('');
                      setMode('verify');
                    }
                  } finally {
                    setSubmitting(false);
                  }
                })();
              }}
            >
              {submitting
                ? locale?.startsWith('zh')
                  ? '正在创建…'
                  : 'Creating…'
                : signupStep < 2
                  ? copy.continue
                  : copy.finish}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
