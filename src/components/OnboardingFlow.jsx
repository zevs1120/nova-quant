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
          : 'AI-native guidance for people who want clearer daily signals and simpler decisions.',
      },
      {
        title: zh ? '先看今天的气候' : 'Know today’s climate',
        body: zh
          ? '几秒内判断：今天该行动、该等待，还是应该更轻一点。'
          : 'See whether today calls for action, patience, or a lighter touch — in seconds.',
      },
      {
        title: zh ? '先问，不必自己解码' : 'Ask. Don’t decode.',
        body: zh
          ? '直接用人话问 Nova，不必独自翻噪音、拆信号。'
          : 'Talk to Nova in plain language instead of digging through noise and signals alone.',
      },
      {
        title: zh ? '接上你常用的券商' : 'Move with your broker',
        body: zh
          ? '继续用你已经习惯的券商 app，NovaQuant 只负责把判断更快送到执行前。'
          : 'Choose the app you already use, and let NovaQuant guide you closer to execution.',
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
    sendCode: zh ? '发送重置码' : 'Send code',
    resetCodeLabel: zh ? '重置码' : 'Reset code',
    resetCodePlaceholder: zh ? '输入 6 位重置码' : 'Enter the 6-digit code',
    newPasswordPlaceholder: zh
      ? '设置新密码（至少 8 位）'
      : 'Create a new password (8+ characters)',
    resetHelper: zh
      ? '先发送重置码，再输入新密码完成重置。'
      : 'Send a reset code first, then choose a new password.',
    resetInfoTemplate: zh
      ? ({ minutes, code }) =>
          `重置码 ${code ? `已发送：${code}` : '已发送'}，${minutes} 分钟内有效。`
      : ({ minutes, code }) =>
          `Reset code ${code ? `${code}` : 'sent'} — valid for ${minutes} minutes.`,
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

function IntroPoster({ pageIndex, locale }) {
  const zh = locale?.startsWith('zh');

  if (pageIndex === 0) {
    return (
      <div className="onboarding-poster onboarding-poster-meet" aria-hidden="true">
        <div className="onboarding-poster-block onboarding-poster-block-pink onboarding-poster-block-top" />
        <div className="onboarding-poster-block onboarding-poster-block-blue onboarding-poster-block-right" />
        <div className="onboarding-poster-block onboarding-poster-block-yellow onboarding-poster-block-bottom" />
        <div className="onboarding-poster-block onboarding-poster-block-green onboarding-poster-block-strip" />

        <div className="onboarding-poster-copy onboarding-poster-copy-meet">
          <span className="onboarding-poster-kicker">MEET NOVAQUANT</span>
          <h1 className="onboarding-poster-title onboarding-poster-title-meet">
            <span>MEET</span>
            <span>NOVA</span>
            <span>QUANT</span>
          </h1>
        </div>

        <div className="onboarding-meet-stack">
          <article className="onboarding-meet-card onboarding-meet-card-back">
            <span className="onboarding-meet-card-kicker">TODAY PICK 01</span>
            <strong className="onboarding-meet-symbol">NVDA</strong>
            <p className="onboarding-meet-caption">{zh ? 'Buy setup' : 'Buy setup'}</p>
            <div className="onboarding-meet-card-actions">
              <span className="onboarding-meet-card-button onboarding-meet-card-button-primary">
                Open
              </span>
            </div>
          </article>

          <article className="onboarding-meet-card onboarding-meet-card-mid">
            <span className="onboarding-meet-card-kicker">TODAY PICK 02</span>
            <strong className="onboarding-meet-symbol">TSLA</strong>
            <p className="onboarding-meet-caption">{zh ? 'Reduce risk' : 'Reduce risk'}</p>
            <div className="onboarding-meet-card-metrics">
              <span>69%</span>
              <span>Low beta</span>
            </div>
          </article>

          <article className="onboarding-meet-card onboarding-meet-card-front">
            <div className="onboarding-meet-card-head">
              <span className="onboarding-meet-card-kicker">TODAY PICK 03</span>
              <span className="onboarding-meet-card-kicker onboarding-meet-card-kicker-accent">
                WATCH FIRST
              </span>
            </div>
            <strong className="onboarding-meet-symbol">AAPL</strong>
            <p className="onboarding-meet-caption">
              {zh ? '清楚一点，再行动。' : 'Watch first. Move with clarity.'}
            </p>
            <div className="onboarding-meet-card-metrics onboarding-meet-card-metrics-front">
              <span>64% conviction</span>
              <span>7% only</span>
              <span>Low risk</span>
            </div>
            <div className="onboarding-meet-card-actions onboarding-meet-card-actions-front">
              <span className="onboarding-meet-card-button onboarding-meet-card-button-primary">
                Open broker
              </span>
              <span className="onboarding-meet-card-button">Ask Nova</span>
            </div>
          </article>
        </div>
      </div>
    );
  }

  if (pageIndex === 1) {
    return (
      <div className="onboarding-poster onboarding-poster-climate" aria-hidden="true">
        <div className="onboarding-poster-block onboarding-poster-block-indigo onboarding-poster-block-top" />
        <div className="onboarding-poster-block onboarding-poster-block-cyan onboarding-poster-block-corner" />

        <div className="onboarding-poster-copy onboarding-poster-copy-climate">
          <span className="onboarding-poster-kicker">READ THE DAY FIRST</span>
          <h1 className="onboarding-poster-title onboarding-poster-title-tight onboarding-poster-title-climate">
            <span>READ</span>
            <span>THE DAY</span>
            <span>FIRST</span>
          </h1>
        </div>

        <div className="onboarding-climate-stage">
          <article className="onboarding-climate-panel onboarding-climate-panel-main">
            <div className="onboarding-climate-panel-head">
              <span className="onboarding-poster-chip">TODAY MODE</span>
              <span className="onboarding-poster-chip onboarding-poster-chip-light">
                READ FIRST
              </span>
            </div>

            <div className="onboarding-climate-hero">
              <div className="onboarding-climate-wheel">
                <span className="onboarding-climate-wheel-label">WAIT</span>
                <strong>68%</strong>
                <p>{zh ? '好 setup 才继续看' : 'Only the clearest setups survive.'}</p>
              </div>

              <div className="onboarding-climate-stats">
                <div className="onboarding-climate-stat-card onboarding-climate-stat-card-indigo">
                  <span>Act</span>
                  <strong>42%</strong>
                </div>
                <div className="onboarding-climate-stat-card onboarding-climate-stat-card-cyan">
                  <span>Risk</span>
                  <strong>Low</strong>
                </div>
              </div>
            </div>

            <div className="onboarding-climate-meter-group">
              <div className="onboarding-meter onboarding-meter-climate">
                <span />
              </div>
              <div className="onboarding-climate-tags">
                <span>Trade lighter</span>
                <span>Wait for confirmation</span>
                <span>Size down first</span>
              </div>
            </div>
          </article>

          <article className="onboarding-climate-panel onboarding-climate-panel-note">
            <strong>{zh ? '今天先读气候' : 'Read the day first'}</strong>
            <p>{zh ? '先定节奏，再决定是否加风险。' : 'Set the pace before you add risk.'}</p>
          </article>
        </div>
      </div>
    );
  }

  if (pageIndex === 2) {
    return (
      <div className="onboarding-poster onboarding-poster-ask" aria-hidden="true">
        <div className="onboarding-poster-block onboarding-poster-block-pink onboarding-poster-block-top" />
        <div className="onboarding-poster-block onboarding-poster-block-cyan onboarding-poster-block-side" />

        <div className="onboarding-poster-copy onboarding-poster-copy-ask">
          <span className="onboarding-poster-kicker">ASK NOVA DIRECTLY</span>
          <h1 className="onboarding-poster-title onboarding-poster-title-tight onboarding-poster-title-ask">
            <span>ASK</span>
            <span>NOVA</span>
            <span>NOW</span>
          </h1>
        </div>

        <div className="onboarding-ask-stage">
          <article className="onboarding-ask-shell">
            <div className="onboarding-ask-shell-head">
              <span className="onboarding-poster-chip">ASK NOVA</span>
              <span className="onboarding-poster-chip onboarding-poster-chip-light">
                LIVE CONTEXT
              </span>
            </div>

            <div className="onboarding-ask-thread">
              <div className="onboarding-chat-bubble onboarding-chat-bubble-light">
                {zh ? '现在最重要的是什么？' : 'What matters most right now?'}
              </div>

              <div className="onboarding-chat-response">
                <span className="onboarding-chat-response-kicker">NOVA BRIEF</span>
                <strong>{zh ? '先盯最清楚的 setup。' : 'Focus on the clearest setup.'}</strong>
                <p>
                  {zh
                    ? '减一点仓位，再等确认，不要被噪音带着走。'
                    : 'Size down first, wait for confirmation, and ignore the noisy names.'}
                </p>
                <div className="onboarding-chat-response-tags">
                  <span>AAPL</span>
                  <span>Wait</span>
                  <span>Low risk</span>
                </div>
              </div>
            </div>

            <div className="onboarding-ask-suggestions">
              <span>{zh ? '为什么是 AAPL？' : 'Why AAPL?'}</span>
              <span>{zh ? '现在要不要买？' : 'Should I buy now?'}</span>
            </div>

            <div className="onboarding-ask-input">
              <span className="onboarding-ask-input-field">
                {zh ? '用人话问 Nova…' : 'Ask Nova in plain English...'}
              </span>
              <span className="onboarding-ask-input-send">{zh ? '发送' : 'Send'}</span>
            </div>
          </article>

          <div className="onboarding-ask-float">
            {zh ? '少一点噪音，多一点判断。' : 'Less noise. More clarity.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-poster onboarding-poster-broker" aria-hidden="true">
      <div className="onboarding-poster-block onboarding-poster-block-yellow onboarding-poster-block-top" />
      <div className="onboarding-poster-block onboarding-poster-block-pink onboarding-poster-block-corner" />

      <div className="onboarding-poster-copy onboarding-poster-copy-broker">
        <span className="onboarding-poster-kicker">STAY CLOSE TO EXECUTION</span>
        <h1 className="onboarding-poster-title onboarding-poster-title-broker">
          <span>MOVE</span>
          <span>WITH YOUR</span>
          <span>BROKER</span>
        </h1>
      </div>

      <div className="onboarding-broker-stage">
        <article className="onboarding-broker-shell onboarding-broker-shell-nova">
          <div className="onboarding-broker-shell-head">
            <span className="onboarding-poster-chip">NOVA</span>
            <span className="onboarding-poster-chip onboarding-poster-chip-light">READY</span>
          </div>
          <strong className="onboarding-broker-symbol">AAPL</strong>
          <p className="onboarding-broker-copy">
            {zh
              ? 'Watch first. 等确认后再打开券商。'
              : 'Watch first. Open your broker when confirmation arrives.'}
          </p>
          <div className="onboarding-broker-pills">
            <span>Today</span>
            <span>Signals</span>
            <span>Ask Nova</span>
          </div>
        </article>

        <div className="onboarding-broker-transfer">
          <span className="onboarding-broker-transfer-line" />
          <span className="onboarding-broker-transfer-chip">{zh ? '执行' : 'EXECUTE'}</span>
        </div>

        <article className="onboarding-broker-shell onboarding-broker-shell-app">
          <div className="onboarding-broker-shell-head">
            <span className="onboarding-poster-chip onboarding-poster-chip-light">BROKER</span>
            <span className="onboarding-broker-dot" />
          </div>
          <div className="onboarding-broker-list">
            <span className="is-active">Robinhood</span>
            <span>Webull</span>
            <span>Fidelity</span>
            <span>Schwab</span>
          </div>
          <div className="onboarding-broker-open-row">
            <span className="onboarding-meet-card-button onboarding-meet-card-button-primary">
              {zh ? '打开券商' : 'Open broker'}
            </span>
          </div>
        </article>
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
  const resetCodeReady =
    /\S+@\S+\.\S+/.test(resetEmail) &&
    String(resetCode).trim().length >= 6 &&
    String(resetPasswordValue).trim().length >= 8;
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
          <IntroPoster pageIndex={pageIndex} locale={locale} />

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
              <button
                type="button"
                className="onboarding-btn onboarding-btn-primary"
                onClick={() => setMode('signup')}
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
                        setResetError(
                          result.error ||
                            (locale?.startsWith('zh')
                              ? '暂时没法发送重置码。'
                              : 'Could not send a reset code right now.'),
                        );
                        return;
                      }
                      setResetInfo(
                        copy.resetInfoTemplate({
                          minutes: result?.expiresInMinutes || 15,
                          code: result?.codeHint || '',
                        }),
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
              {submitting
                ? locale?.startsWith('zh')
                  ? '正在重置…'
                  : 'Resetting…'
                : copy.resetPassword}
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
