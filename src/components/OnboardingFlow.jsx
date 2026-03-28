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
        title: zh ? '直接问 Nova' : 'Ask Nova directly',
        body: zh
          ? '直接问 setup、风险和现在该不该动，拿到真正能执行的回答。'
          : 'Ask about setups, risk, and what deserves action now, then get an answer you can use.',
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

function getCircularOffset(index, activeIndex, total) {
  const rawOffset = (index - activeIndex + total) % total;
  return rawOffset > total / 2 ? rawOffset - total : rawOffset;
}

function getMeetSlotClass(offset) {
  if (offset === -2) return 'onboarding-meet-carousel-slot-neg-2';
  if (offset === -1) return 'onboarding-meet-carousel-slot-neg-1';
  if (offset === 1) return 'onboarding-meet-carousel-slot-1';
  if (offset === 2) return 'onboarding-meet-carousel-slot-2';
  return 'onboarding-meet-carousel-slot-0';
}

function IntroPoster({ pageIndex, locale }) {
  const zh = locale?.startsWith('zh');
  const askBullets = zh
    ? ['问今天最重要的事', '拿到结论，不是信息过载', '像人一样说话的 AI']
    : ['Ask what matters now', 'Get answers, not overload', 'AI that speaks human'];
  const askFollowups = zh
    ? ['今天我该做什么？', '现在适合试单吗？', '什么会让这个 setup 失效？']
    : ['What should I do today?', 'Is it safe to try anything?', 'What breaks the setup?'];
  const askActionPoints = zh
    ? [
        '等关键位收复并站稳，再把它当成可动作的 setup。',
        '如果确认出现，先用更小仓位，不要一开始就满确信。',
        '如果价格重新跌回触发位下方，就继续空仓，等 setup 重置。',
      ]
    : [
        'Wait for a reclaim and hold before treating this as actionable.',
        'If it confirms, start with smaller size instead of full conviction size.',
        'If price slips back under the trigger, stay flat and let the setup reset.',
      ];
  const askEvidenceTags = zh
    ? ['先放观察', '先小仓位', '风控门开启']
    : ['Watchlist First', 'Starter Size', 'Risk Gate Active'];
  const meetActions = useMemo(
    () => [
      {
        key: 'nvda',
        symbol: 'NVDA',
        direction: zh ? '买入 setup' : 'Buy setup',
        meta: zh ? '模型生成 · 实时 · 龙头突破' : 'Model-derived · live · LEADERSHIP_BREAK',
        kicker: zh ? '今日卡片 01' : 'Today pick 01',
        tag: zh ? '可动作' : 'Actionable',
        tone: 'blue',
        layout: { x: '-34%', y: '8%', r: '-9deg', z: 1, delay: '0s' },
        summary: zh
          ? '今天最清楚的是领涨突破，能做，但仓位仍然必须受控。'
          : 'The cleanest leadership break on the board, with size still kept under control.',
        stats: [
          { label: zh ? '确信' : 'Conviction', value: '71%' },
          { label: zh ? '仓位' : 'Size', value: zh ? '仅 8%' : '8% only' },
          { label: zh ? '风险' : 'Risk', value: zh ? '中等风险' : 'Medium risk' },
        ],
        context: [
          { label: zh ? '来源' : 'Source', value: zh ? '模型生成' : 'Model-derived' },
          { label: zh ? '执行' : 'Execution', value: zh ? '可以执行' : 'Action allowed' },
          { label: zh ? '风控' : 'Risk gate', value: zh ? '仓位受控' : 'Size controlled' },
        ],
      },
      {
        key: 'tsla',
        symbol: 'TSLA',
        direction: zh ? '先降风险' : 'Reduce risk',
        meta: zh ? '模型生成 · 实时 · 波动转弱' : 'Model-derived · live · VOL_BREAKDOWN',
        kicker: zh ? '今日卡片 02' : 'Today pick 02',
        tag: zh ? '可动作' : 'Actionable',
        tone: 'pink',
        layout: { x: '-16%', y: '3.5%', r: '-5deg', z: 2, delay: '0.1s' },
        summary: zh
          ? '这不是继续加风险的时候，最好的动作是先把敞口降下来。'
          : 'This is not the moment to add more risk. De-risk first and keep the pace clean.',
        stats: [
          { label: zh ? '确信' : 'Conviction', value: '69%' },
          { label: zh ? '仓位' : 'Size', value: zh ? '仅 9%' : '9% only' },
          { label: zh ? '风险' : 'Risk', value: zh ? '高风险' : 'High risk' },
        ],
        context: [
          { label: zh ? '来源' : 'Source', value: zh ? '模型生成' : 'Model-derived' },
          { label: zh ? '执行' : 'Execution', value: zh ? '别再加仓' : 'Do not add risk' },
          { label: zh ? '风控' : 'Risk gate', value: zh ? '先收缩' : 'Stay defensive' },
        ],
      },
      {
        key: 'aapl',
        symbol: 'AAPL',
        direction: zh ? '先观察' : 'Watch first',
        meta: zh ? '模型生成 · 实时 · 区间尊重' : 'Model-derived · live · RANGE_RESPECT',
        kicker: zh ? '今日卡片 03' : 'Today pick 03',
        tag: zh ? '先观察' : 'Watch first',
        tone: 'mint',
        layout: { x: '0%', y: '0%', r: '-1deg', z: 3, delay: '0.2s' },
        summary: zh
          ? '这是今天最像“等一下再动”的主卡，先确认跟随，再决定是否执行。'
          : 'The lead card today is a wait-for-confirmation setup. Let follow-through earn the action.',
        stats: [
          { label: zh ? '确信' : 'Conviction', value: '64%' },
          { label: zh ? '仓位' : 'Size', value: zh ? '仅 7%' : '7% only' },
          { label: zh ? '风险' : 'Risk', value: zh ? '低风险' : 'Low risk' },
        ],
        context: [
          { label: zh ? '来源' : 'Source', value: zh ? '模型生成' : 'Model-derived' },
          { label: zh ? '执行' : 'Execution', value: zh ? '等跟随' : 'Wait for follow-through' },
          { label: zh ? '风控' : 'Risk gate', value: zh ? '保持耐心' : 'Stay patient' },
        ],
      },
      {
        key: 'btc',
        symbol: 'BTC',
        direction: zh ? '趋势仍在' : 'Momentum intact',
        meta: zh ? '模型生成 · 实时 · 趋势加速' : 'Model-derived · live · TREND_ACCELERATION',
        kicker: zh ? '今日卡片 04' : 'Today pick 04',
        tag: zh ? '可动作' : 'Actionable',
        tone: 'violet',
        layout: { x: '16%', y: '3.5%', r: '5deg', z: 4, delay: '0.3s' },
        summary: zh
          ? '趋势卡可以做，但一定要配合更紧的失效线和更快的决策节奏。'
          : 'The trend is still intact, but it only stays attractive with tighter invalidation.',
        stats: [
          { label: zh ? '确信' : 'Conviction', value: '76%' },
          { label: zh ? '仓位' : 'Size', value: zh ? '仅 10%' : '10% only' },
          { label: zh ? '风险' : 'Risk', value: zh ? '高风险' : 'High risk' },
        ],
        context: [
          { label: zh ? '来源' : 'Source', value: zh ? '模型生成' : 'Model-derived' },
          { label: zh ? '执行' : 'Execution', value: zh ? '趋势持续' : 'Crypto session live' },
          { label: zh ? '风控' : 'Risk gate', value: zh ? '止损更紧' : 'Tight invalidation' },
        ],
      },
      {
        key: 'eth',
        symbol: 'ETH',
        direction: zh ? '等重新站回' : 'Wait for reclaim',
        meta: zh ? '模型生成 · 实时 · 支撑重测' : 'Model-derived · live · SUPPORT_RETEST',
        kicker: zh ? '今日卡片 05' : 'Today pick 05',
        tag: zh ? '先观察' : 'Watch first',
        tone: 'yellow',
        layout: { x: '34%', y: '8%', r: '9deg', z: 5, delay: '0.4s' },
        summary: zh
          ? '不是所有强名字都该立刻追，收复关键位之前，先把它留在观察区。'
          : 'Do not force the trade before reclaim. The useful move is to keep it on watch.',
        stats: [
          { label: zh ? '确信' : 'Conviction', value: '61%' },
          { label: zh ? '仓位' : 'Size', value: zh ? '仅 6%' : '6% only' },
          { label: zh ? '风险' : 'Risk', value: zh ? '中等风险' : 'Medium risk' },
        ],
        context: [
          { label: zh ? '来源' : 'Source', value: zh ? '模型生成' : 'Model-derived' },
          { label: zh ? '执行' : 'Execution', value: zh ? '等站回' : 'Wait for reclaim' },
          { label: zh ? '风控' : 'Risk gate', value: zh ? '守线' : 'Hold the line' },
        ],
      },
    ],
    [zh],
  );
  const [activeMeetAction, setActiveMeetAction] = useState(2);
  const [askMotionVisible, setAskMotionVisible] = useState(false);

  useEffect(() => {
    if (pageIndex !== 0) return;
    setActiveMeetAction(2);
  }, [pageIndex]);

  useEffect(() => {
    if (pageIndex !== 0 || typeof window === 'undefined') return undefined;
    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motionQuery?.matches) return undefined;

    const intervalId = window.setInterval(() => {
      setActiveMeetAction((value) => (value + 1) % meetActions.length);
    }, 2600);

    return () => window.clearInterval(intervalId);
  }, [meetActions.length, pageIndex]);

  useEffect(() => {
    if (pageIndex !== 1) {
      setAskMotionVisible(false);
      return undefined;
    }

    if (typeof window === 'undefined') {
      setAskMotionVisible(true);
      return undefined;
    }

    const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motionQuery?.matches) {
      setAskMotionVisible(true);
      return undefined;
    }

    let timeoutId;
    const frameId = window.requestAnimationFrame(() => {
      timeoutId = window.setTimeout(() => setAskMotionVisible(true), 40);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [pageIndex]);

  if (pageIndex === 0) {
    return (
      <div className="onboarding-poster onboarding-poster-meet">
        <div className="onboarding-poster-block onboarding-poster-block-pink onboarding-poster-block-top" />
        <div className="onboarding-poster-block onboarding-poster-block-blue onboarding-poster-block-right" />
        <div className="onboarding-poster-block onboarding-poster-block-yellow onboarding-poster-block-bottom" />
        <div className="onboarding-poster-block onboarding-poster-block-green onboarding-poster-block-strip" />

        <div className="onboarding-meet-layout">
          <div className="onboarding-poster-copy onboarding-poster-copy-meet">
            <span className="onboarding-poster-kicker">MEET NOVAQUANT</span>
            <h1 className="onboarding-poster-title onboarding-poster-title-meet">
              <span>MEET</span>
              <span>NOVAQUANT</span>
            </h1>
            <p className="onboarding-poster-note onboarding-poster-note-meet">
              {zh
                ? '直接看今天最重要的行动卡。先看清楚，再决定该等、该问，还是该执行。'
                : 'Start with the action card that matters most today, then decide whether to wait, ask, or execute.'}
            </p>
          </div>

          <div
            className="onboarding-meet-carousel"
            aria-label={zh ? 'NovaQuant 行动卡堆栈' : 'NovaQuant action card stack'}
          >
            <div className="onboarding-meet-carousel-glow" aria-hidden="true" />
            <div className="onboarding-meet-carousel-track">
              {meetActions.map((item, index) => {
                const offset = getCircularOffset(index, activeMeetAction, meetActions.length);
                return (
                  <button
                    type="button"
                    key={item.key}
                    className={`onboarding-meet-carousel-slot onboarding-meet-stack-slot-${item.tone} ${getMeetSlotClass(offset)}${activeMeetAction === index ? ' is-selected' : ''}`}
                    style={{ zIndex: meetActions.length - Math.abs(offset) }}
                    aria-pressed={activeMeetAction === index}
                    onClick={() => setActiveMeetAction(index)}
                    onFocus={() => setActiveMeetAction(index)}
                  >
                    <article className="onboarding-meet-action-card onboarding-meet-action-card-stack">
                      <div className="onboarding-meet-action-card-head">
                        <span className="onboarding-meet-action-kicker">{item.kicker}</span>
                        <span className="onboarding-meet-action-tag">{item.tag}</span>
                      </div>

                      <div className="onboarding-meet-action-main">
                        <div className="onboarding-meet-action-symbol-block">
                          <h3 className="onboarding-meet-action-symbol">{item.symbol}</h3>
                          <p className="onboarding-meet-action-direction">{item.direction}</p>
                          <p className="onboarding-meet-action-meta">{item.meta}</p>
                        </div>
                        <span className="onboarding-meet-action-mark" aria-hidden="true" />
                      </div>

                      <div className="onboarding-meet-action-stats">
                        {item.stats.map((stat) => (
                          <div className="onboarding-meet-action-stat" key={stat.label}>
                            <span className="onboarding-meet-action-stat-label">{stat.label}</span>
                            <span className="onboarding-meet-action-stat-value">{stat.value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="onboarding-meet-action-context-row">
                        {item.context.map((context) => (
                          <span className="onboarding-meet-action-context-pill" key={context.label}>
                            <span className="onboarding-meet-action-context-label">
                              {context.label}
                            </span>
                            <span className="onboarding-meet-action-context-value">
                              {context.value}
                            </span>
                          </span>
                        ))}
                      </div>

                      <div className="onboarding-meet-action-links">
                        <span className="onboarding-meet-action-link onboarding-meet-action-link-primary">
                          {zh ? '打开 Robinhood' : 'Open Robinhood'}
                        </span>
                        <span className="onboarding-meet-action-link onboarding-meet-action-link-secondary">
                          {zh ? '问 Nova' : 'Ask Nova'}
                        </span>
                      </div>
                    </article>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (pageIndex === 1) {
    return (
      <div className="onboarding-poster onboarding-poster-ask" aria-hidden="true">
        <div className="onboarding-poster-block onboarding-poster-block-pink onboarding-poster-block-top" />
        <div className="onboarding-poster-block onboarding-poster-block-cyan onboarding-poster-block-side" />

        <div className={`onboarding-ask-layout${askMotionVisible ? ' is-visible' : ''}`}>
          <div className="onboarding-poster-copy onboarding-poster-copy-ask onboarding-ask-copy-block">
            <span className="onboarding-poster-kicker">ASK NOVA</span>
            <h1 className="onboarding-poster-title onboarding-poster-title-ask">
              <span>ASK</span>
              <span>NOVA</span>
            </h1>
            <p className="onboarding-poster-note onboarding-poster-note-ask">
              {zh
                ? '问 setup、情绪、风险，或者现在最该关注什么。Nova 会直接把噪音压下去，把你真正能用的判断留下来。'
                : 'Ask about setups, momentum, sentiment, or what matters most right now, and Nova turns noise into something you can actually use.'}
            </p>

            <ul
              className="onboarding-ask-bullets"
              aria-label={zh ? 'Ask Nova 亮点' : 'Ask Nova highlights'}
            >
              {askBullets.map((bullet, index) => (
                <li key={bullet} style={{ '--onboarding-ask-enter-delay': `${index * 70}ms` }}>
                  {bullet}
                </li>
              ))}
            </ul>
          </div>

          <div className="onboarding-ask-object">
            <div className="onboarding-ask-object-halo" aria-hidden="true" />

            <div className="onboarding-ask-phone-stage" aria-hidden="true">
              <div className="onboarding-ask-phone-flat onboarding-ask-phone-flat-pink" />
              <div className="onboarding-ask-phone-flat onboarding-ask-phone-flat-blue" />
              <div className="onboarding-ask-phone-flat onboarding-ask-phone-flat-mint" />

              <div className="onboarding-ask-phone-shell">
                <div className="onboarding-ask-phone-frame">
                  <div className="onboarding-ask-phone-island" />

                  <div className="onboarding-ask-phone-screen">
                    <div className="onboarding-ask-phone-ui">
                      <div className="onboarding-ask-phone-statusbar">
                        <span>9:41</span>
                        <span>NovaQuant Live</span>
                      </div>

                      <div className="onboarding-ask-phone-header">
                        <div className="onboarding-ask-phone-header-copy">
                          <span className="onboarding-ask-phone-header-kicker">Ask Nova</span>
                          <strong>{zh ? '信号简报' : 'Signal Brief'}</strong>
                        </div>
                        <span className="onboarding-ask-phone-header-pill">
                          {zh ? '实时' : 'Live'}
                        </span>
                      </div>

                      <div className="onboarding-ask-phone-thread">
                        <div className="onboarding-ask-phone-thread-scroll">
                          <span className="onboarding-ask-phone-thread-scroll-thumb" />
                        </div>

                        <div className="onboarding-ask-phone-thread-track">
                          <div className="onboarding-ask-phone-message onboarding-ask-phone-message-user">
                            <div className="onboarding-ask-phone-bubble onboarding-ask-phone-bubble-user">
                              {zh
                                ? '现在帮我读一下 AAPL 的信号。'
                                : 'Read the signal on AAPL right now.'}
                            </div>
                          </div>

                          <div className="onboarding-ask-phone-thinking">
                            <div className="onboarding-ask-phone-thinking-dots">
                              <span />
                              <span />
                              <span />
                            </div>
                            <span>
                              {zh
                                ? '正在检查 setup、节奏和风险门...'
                                : 'Checking setup, regime, and risk gate...'}
                            </span>
                          </div>

                          <article className="onboarding-ask-phone-reply">
                            <span className="onboarding-ask-phone-reply-kicker">
                              {zh ? '信号解读' : 'Signal Read'}
                            </span>
                            <h3>
                              {zh
                                ? 'AAPL 在转好，但最干净的做多仍然要等确认。'
                                : 'AAPL is improving, but the clean long still needs confirmation.'}
                            </h3>
                            <p className="onboarding-ask-phone-reply-lead">
                              {zh
                                ? '动能在回升，但价格还没有给出完整的收复并站稳，所以现在更像是优先观察，而不是立刻执行。'
                                : 'Momentum is rebuilding, but price has not given a full reclaim-and-hold yet, so this still belongs in watchlist-first territory.'}
                            </p>

                            <div className="onboarding-ask-phone-reply-block">
                              <span>{zh ? '现在最重要的' : 'What matters'}</span>
                              <p>
                                {zh
                                  ? '龙头属性还在，市场也更安静了，但确信度还没到 Nova 会直接推送满仓行动卡的程度。'
                                  : 'Leadership is intact and the tape is calmer, but conviction is still below the level where Nova would push a full-size action card.'}
                              </p>
                            </div>

                            <div className="onboarding-ask-phone-reply-block">
                              <span>{zh ? '现在怎么做' : 'What to do'}</span>
                              <ul>
                                {askActionPoints.map((point) => (
                                  <li key={point}>{point}</li>
                                ))}
                              </ul>
                            </div>

                            <div className="onboarding-ask-phone-reply-block">
                              <span>{zh ? '结论' : 'Bottom line'}</span>
                              <p>
                                {zh
                                  ? '这是一个很干净的观察名单候选，不是已经完全绿灯的进场。让市场先证明自己，再考虑逐步加大仓位。'
                                  : 'This is a clean watchlist candidate, not a full green-light entry. Let the market prove it first, then size up only if the reclaim sticks.'}
                              </p>
                            </div>

                            <div className="onboarding-ask-phone-reply-tags">
                              {askEvidenceTags.map((tag) => (
                                <span key={tag}>{tag}</span>
                              ))}
                            </div>
                          </article>

                          <div className="onboarding-ask-phone-followups">
                            {askFollowups.map((item) => (
                              <span key={item}>{item}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="onboarding-ask-phone-composer">
                        <div className="onboarding-ask-phone-input">
                          <span className="onboarding-ask-phone-input-placeholder">
                            {zh ? '用人话直接问 Nova' : 'Ask in plain words'}
                          </span>
                          <span className="onboarding-ask-phone-input-text">
                            <span className="onboarding-ask-phone-input-typed">
                              {zh
                                ? '现在帮我读一下 AAPL 的信号。'
                                : 'Read the signal on AAPL right now.'}
                            </span>
                            <span className="onboarding-ask-phone-input-caret" />
                          </span>
                        </div>

                        <div className="onboarding-ask-phone-send">
                          <span className="onboarding-ask-phone-send-icon">↑</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
