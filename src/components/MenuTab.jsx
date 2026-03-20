import React, { useMemo, useState } from 'react';

const MENU_GROUPS = [
  {
    key: 'group:review',
    items: ['weekly', 'discipline']
  },
  {
    key: 'group:system',
    items: ['signals', 'performance', 'safety', 'data']
  },
  {
    key: 'group:market',
    items: ['insights']
  },
  {
    key: 'group:settings',
    items: ['settings', 'advanced']
  }
];

function localeCopy(locale) {
  const zh = locale?.startsWith('zh');
  return {
    menu: zh ? '菜单' : 'Menu',
    support: zh ? '支持' : 'Support',
    supportRootTitle: zh ? 'NovaQuant Support' : 'NovaQuant Support',
    supportRootCopy: zh ? '帮助中心、联系支持、查看你的支持会话。' : 'Help Center, contact us 24/7, and check your support chats.',
    predictionGames: zh ? '预测游戏' : 'Prediction Games',
    rewards: zh ? '奖励 / 邀请好友' : 'Rewards / Invite Friends',
    rewardsRootCopy: zh ? '邀请朋友，赚取 1000 积分奖励。' : 'Invite friends and earn 1,000-point rewards.',
    securityPrivacy: zh ? '安全与隐私' : 'Security & privacy',
    securityPrivacyCopy: zh ? '密码、设备安全、隐私与数据控制。' : 'Password, device security, privacy, and data controls.',
    review: zh ? '复盘' : 'Review',
    system: zh ? '系统' : 'System',
    marketNotes: zh ? '市场笔记' : 'Market Notes',
    settings: zh ? '设置' : 'Settings',
    about: zh ? '关于' : 'About',
    logout: zh ? '退出登录' : 'Log out',
    points: zh ? '积分' : 'Points',
    predictionCopy: zh ? '每天用一点判断力，换一点额外乐趣。' : 'Turn judgment into a small daily edge.',
    rewardsCopy: zh ? '邀请、兑换、VIP 都从这里进。' : 'Invite, redeem, and unlock VIP from here.',
    pointsHub: zh ? '积分中心' : 'Points Hub',
    expiring: zh ? '即将过期' : 'Expiring soon',
    vipDays: zh ? '本月已兑换 VIP 天数' : 'VIP days used this month',
    games: zh ? '预测游戏' : 'Prediction Games',
    invite: zh ? '奖励 / 邀请好友' : 'Rewards / Invite Friends',
    vipRedeem: zh ? 'VIP 兑换' : 'Redeem VIP',
    history: zh ? '积分明细 / 规则 / 历史' : 'History / rules / activity',
    recentActivity: zh ? '最近积分动态' : 'Recent Activity',
    rulesFaq: zh ? '规则 / 常见问题' : 'Rules / FAQ',
    pointsRate: zh ? '1000 积分 = 1 天 VIP' : '1000 pts = 1 day VIP',
    pointsUse: zh ? '你现在最值得做的是继续拿判断换积分。' : 'The best next move is to trade judgment for points.',
    reviewDescription: zh ? '本周总结和纪律记录。' : 'Weekly recap and discipline rhythm.',
    systemDescription: zh ? '系统状态、信号、安全和数据。' : 'Signals, safety, performance, and data.',
    marketDescription: zh ? '更宽的市场背景和观察。' : 'Broader context and market notes.',
    settingsDescription: zh ? '语言、偏好和模式设置。' : 'Language, preferences, and modes.',
    username: zh ? '用户名' : 'Username'
  };
}

function buildVersionLabel(appMeta) {
  const version = appMeta?.app_version || '--';
  const build = appMeta?.build_number || appMeta?.build || '--';
  return `Version v${version} (${build})`;
}

function firstNameFromUsername(username) {
  const raw = String(username || '').replace(/^@/, '').trim();
  if (!raw) return 'there';
  const head = raw.split(/[\s._-]+/).find(Boolean) || raw;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

function buildInviteLink(referrals, username) {
  const fallback = String(username || '')
    .replace(/^@/, '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 12)
    .toUpperCase();
  const code = String(referrals?.inviteCode || fallback || 'NQSTART').trim();
  return `https://novaquant.cloud/invite?code=${encodeURIComponent(code)}`;
}

function itemCatalog(locale) {
  const zh = locale?.startsWith('zh');
  return {
    weekly: {
      title: zh ? '周复盘' : 'Weekly Review',
      description: zh ? '一周总结和下周重点。' : 'A calm weekly recap and next focus.'
    },
    discipline: {
      title: zh ? '纪律进度' : 'Discipline Progress',
      description: zh ? '查看节奏、边界与连续性。' : 'See your rhythm, boundaries, and streaks.'
    },
    signals: {
      title: zh ? '信号总览' : 'Signals',
      description: zh ? '全部信号和被过滤的原因。' : 'All signals and what got filtered.'
    },
    performance: {
      title: zh ? '表现证明' : 'Performance',
      description: zh ? '纸面、回放和证明摘要。' : 'Paper, replay, and proof summaries.'
    },
    safety: {
      title: zh ? '安全边界' : 'Safety',
      description: zh ? '今天的风险边界和限额。' : 'Today’s guardrails and risk limits.'
    },
    data: {
      title: zh ? '数据状态' : 'Data Status',
      description: zh ? '新鲜度、覆盖率和缺口。' : 'Freshness, coverage, and missing data.'
    },
    insights: {
      title: zh ? '市场洞察' : 'Insights',
      description: zh ? '今天观点背后的大背景。' : 'The background behind today’s view.'
    },
    settings: {
      title: zh ? '设置' : 'Settings',
      description: zh ? '语言、模式和个人偏好。' : 'Language, mode, and personal preferences.'
    },
    advanced: {
      title: zh ? '高级' : 'Advanced',
      description: zh ? '更深的研究与系统细节。' : 'Deeper research and system detail.'
    }
  };
}

function formatPoints(value, locale) {
  const next = Number(value || 0).toLocaleString(locale);
  return locale?.startsWith('zh') ? `${next} 积分` : `${next} pts`;
}

function pointsHint(points, locale) {
  if (points?.status === 'gain') return '+200';
  if (points?.status === 'vip') return locale?.startsWith('zh') ? `VIP ${points.vipDays || 1}天` : `VIP ${points.vipDays || 1}d`;
  return locale?.startsWith('zh') ? '即将过期' : 'Expiring soon';
}

function pointsActivity(points, locale) {
  const zh = locale?.startsWith('zh');
  return [
    {
      title: points?.status === 'gain' ? '+200' : zh ? '今天 +120' : '+120 today',
      desc: zh ? 'Morning Check + 一次 AI 提问。' : 'Morning Check plus one AI question.'
    },
    {
      title: zh ? `即将过期 ${Number(points?.expiringSoon || 0).toLocaleString(locale)} 积分` : `${Number(points?.expiringSoon || 0).toLocaleString(locale)} pts expiring`,
      desc: zh ? '先换 VIP，别让它白白过期。' : 'Redeem VIP before those points expire.'
    },
    {
      title: zh ? `本月 VIP ${points?.vipDays || 0} 天` : `VIP ${points?.vipDays || 0}d this month`,
      desc: zh ? '已经换到的高级天数会继续累计。' : 'Your redeemed VIP days keep stacking up.'
    }
  ];
}

function openMailto(subject, body = '') {
  if (typeof window === 'undefined') return;
  const href = `mailto:support@novaquant.cloud?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = href;
}

export default function MenuTab({
  section,
  locale,
  username,
  manualState,
  onSectionChange,
  showDemoEntry = false,
  demoEnabled = false,
  onToggleDemo,
  onRedeemVip,
  onOpenAbout,
  onLogout,
  appMeta
}) {
  const copy = localeCopy(locale);
  const catalog = itemCatalog(locale);
  const group = MENU_GROUPS.find((item) => item.key === section);
  const manualAvailable = Boolean(manualState?.available || demoEnabled);
  const points = manualState?.summary || { balance: 0, expiringSoon: 0, vipDays: 0, vipDaysRedeemed: 0 };
  const ledger = Array.isArray(manualState?.ledger) ? manualState.ledger : [];
  const predictions = Array.isArray(manualState?.predictions) ? manualState.predictions : [];
  const rewards = Array.isArray(manualState?.rewards) ? manualState.rewards : [];
  const referrals = manualState?.referrals || { inviteCode: null, referredByCode: null, total: 0, rewarded: 0 };
  const [shareFeedback, setShareFeedback] = useState('');
  const isZh = locale?.startsWith('zh');
  const inviteLink = useMemo(() => buildInviteLink(referrals, username), [referrals, username]);
  const firstName = useMemo(() => firstNameFromUsername(username), [username]);

  async function shareInvite(mode = 'share') {
    const title = isZh ? '邀请朋友加入 NovaQuant' : 'Invite friends to NovaQuant';
    const text = isZh
      ? `使用我的链接加入 NovaQuant，完成注册后我们都能获得 1000 积分。`
      : `Join NovaQuant with my link and we will both get 1,000 points after signup.`;
    try {
      if (mode === 'contacts' && navigator.share) {
        await navigator.share({ title, text, url: inviteLink });
        setShareFeedback(isZh ? '已打开分享面板。' : 'Share sheet opened.');
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteLink);
        setShareFeedback(isZh ? '邀请链接已复制。' : 'Invite link copied.');
        return;
      }
      if (navigator.share) {
        await navigator.share({ title, text, url: inviteLink });
        setShareFeedback(isZh ? '已打开分享面板。' : 'Share sheet opened.');
        return;
      }
    } catch {
      // Keep a quiet fallback below.
    }
    openMailto(title, `${text}\n\n${inviteLink}`);
    setShareFeedback(isZh ? '已切换到邮件分享。' : 'Opened email sharing.');
  }

  const renderManualUnavailable = () => (
    <section className="stack-gap menu-screen">
      <div className="menu-page-head">
        <h1>{copy.pointsHub}</h1>
        <p>
          {manualState?.reason === 'AUTH_REQUIRED'
            ? locale?.startsWith('zh')
              ? '真实模式下，积分、邀请和预测记录只对已登录账户开放。'
              : 'In real mode, points, referrals, and prediction history are only available for signed-in accounts.'
            : locale?.startsWith('zh')
              ? '这部分当前不可用。'
              : 'This surface is currently unavailable.'}
        </p>
      </div>
    </section>
  );

  if (section === 'points') {
    if (!manualAvailable) return renderManualUnavailable();
    const activity = pointsActivity(points, locale);
    return (
      <section className="stack-gap menu-screen">
        <div className="points-hub-hero">
          <div className="points-hub-hero-copy">
            <p className="menu-hero-kicker">{copy.pointsHub}</p>
            <h1 className="menu-points-balance">{formatPoints(points.balance, locale)}</h1>
            <p className="points-hub-hero-note">{copy.pointsUse}</p>
          </div>
          <div className="points-hub-meta-grid">
            <div className="points-hub-meta-box">
              <span className="points-hub-meta-label">{copy.expiring}</span>
              <strong>{formatPoints(points.expiringSoon, locale)}</strong>
            </div>
            <div className="points-hub-meta-box">
              <span className="points-hub-meta-label">{copy.vipDays}</span>
              <strong>{points.vipDays}</strong>
            </div>
            <div className="points-hub-meta-box points-hub-meta-box-wide">
              <span className="points-hub-meta-label">{copy.pointsRate}</span>
              <strong>{copy.vipRedeem}</strong>
            </div>
          </div>
        </div>

        <div className="points-hub-primary-grid">
          <button type="button" className="points-hub-primary-card" onClick={() => onSectionChange('prediction-games')}>
            <span className="menu-primary-title">{copy.games}</span>
            <span className="menu-primary-copy">{copy.predictionCopy}</span>
          </button>
          <button type="button" className="points-hub-primary-card points-hub-primary-card-accent" onClick={() => onSectionChange('rewards')}>
            <span className="menu-primary-title">{copy.invite}</span>
            <span className="menu-primary-copy">{copy.rewardsCopy}</span>
          </button>
        </div>

        <div className="points-hub-surface">
          <div className="points-hub-section-head">
            <h2>{copy.vipRedeem}</h2>
            <span className="points-hub-inline-rate">{copy.pointsRate}</span>
          </div>
          {(rewards.length
            ? rewards
            : [
                {
                  id: 'vip-1d',
                  kind: 'vip_day',
                  title: copy.vipRedeem,
                  description: locale?.startsWith('zh') ? '先把快过期的积分换成 VIP。' : 'Turn expiring points into VIP first.',
                  costPoints: 1000,
                  enabled: false
                }
              ]).map((item) => (
            <button
              key={item.id}
              type="button"
              className="menu-list-row"
              onClick={() => {
                if (item.kind === 'vip_day' && item.enabled) {
                  onRedeemVip?.(1);
                  return;
                }
                onSectionChange('rewards');
              }}
            >
              <span>
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-desc">{item.description}</span>
              </span>
              <span className="menu-list-arrow">{item.kind === 'vip_day' ? `${item.costPoints}` : '›'}</span>
            </button>
          ))}
        </div>

        <div className="points-hub-surface">
          <div className="points-hub-section-head">
            <h2>{copy.recentActivity}</h2>
          </div>
          <div className="menu-group-list">
            {(ledger.length
              ? ledger.map((item) => ({
                  title: `${item.pointsDelta > 0 ? '+' : ''}${item.pointsDelta}`,
                  desc: item.description || item.title
                }))
              : activity
            ).map((item) => (
              <div key={item.title} className="menu-list-row static">
                <span>
                  <span className="menu-list-title">{item.title}</span>
                  <span className="menu-list-desc">{item.desc}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="points-hub-surface">
          <div className="points-hub-section-head">
            <h2>{copy.rulesFaq}</h2>
          </div>
          <div className="menu-group-list">
            <button type="button" className="menu-list-row" onClick={() => onSectionChange('points-history')}>
              <span>
                <span className="menu-list-title">{copy.history}</span>
                <span className="menu-list-desc">
                  {locale?.startsWith('zh')
                    ? '查看积分明细、规则和 VIP 兑换历史。'
                    : 'See point rules, activity, and VIP history.'}
                </span>
              </span>
              <span className="menu-list-arrow">›</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (section === 'prediction-games') {
    if (!manualAvailable) return renderManualUnavailable();
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{copy.predictionGames}</h1>
          <p>{copy.predictionCopy}</p>
        </div>
        <div className="menu-points-actions">
          {(predictions.length
            ? predictions.map((item) => ({
                title: item.prompt,
                copy: item.entry
                  ? locale?.startsWith('zh')
                    ? `已选择 ${item.entry.selectedOption} · ${item.entry.pointsStaked} 积分`
                    : `${item.entry.selectedOption} selected · ${item.entry.pointsStaked} pts`
                  : locale?.startsWith('zh')
                    ? '等待题目开放或结算。'
                    : 'Waiting for entry or settlement.'
              }))
            : [
                locale?.startsWith('zh')
                  ? { title: '当前没有正在进行的真实题目', copy: '新题目上线后会直接出现在这里。' }
                  : { title: 'No live rounds right now', copy: 'New prediction markets will appear here as soon as they are published.' }
              ]).map((item) => (
            <article key={item.title} className="menu-primary-tile">
              <span className="menu-primary-title">{item.title}</span>
              <span className="menu-primary-copy">{item.copy}</span>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (section === 'rewards' || section === 'points-history') {
    const isHistory = section === 'points-history';
    if (isHistory && !manualAvailable) return renderManualUnavailable();
    if (!isHistory) {
      return (
        <section className="stack-gap menu-screen">
          <div className="menu-invite-shell">
            <div className="menu-invite-hero-art" aria-hidden="true">
              <span className="menu-invite-cube menu-invite-cube-green">GOOG</span>
              <span className="menu-invite-cube menu-invite-cube-gold">MSFT</span>
              <span className="menu-invite-cube menu-invite-cube-lime">TSLA</span>
              <span className="menu-invite-cube menu-invite-cube-pink">NQ</span>
              <span className="menu-invite-cube menu-invite-cube-apple">AAPL</span>
              <span className="menu-invite-coin menu-invite-coin-blue" />
              <span className="menu-invite-coin menu-invite-coin-chart" />
            </div>

            <div className="menu-page-head menu-page-head-tight">
              <h1>{isZh ? '邀请朋友，拿 1000 积分' : 'Invite a friend, get 1,000 points'}</h1>
              <p>
                {isZh
                  ? '每当朋友通过你的链接注册并完成账户连接，你们双方都能获得 1000 积分奖励。奖励会直接计入积分中心，可继续兑换 VIP。'
                  : 'Each time a friend signs up from your link and completes account setup, you both get 1,000 points. Rewards land directly in your points balance and can be redeemed for VIP.'}
              </p>
            </div>

            <div className="menu-invite-how">
              <button type="button" className="menu-link-button">
                {isZh ? '如何运作' : 'How it works'}
              </button>
              <div className="menu-invite-steps">
                <div className="menu-invite-step">
                  <strong>{isZh ? '1. 分享链接' : '1. Share your link'}</strong>
                  <span>{isZh ? '把邀请链接发给朋友。' : 'Send your invite link to a friend.'}</span>
                </div>
                <div className="menu-invite-step">
                  <strong>{isZh ? '2. 完成注册' : '2. Complete signup'}</strong>
                  <span>{isZh ? '朋友完成注册并连接账户。' : 'Your friend signs up and finishes setup.'}</span>
                </div>
                <div className="menu-invite-step">
                  <strong>{isZh ? '3. 双方得分' : '3. Both earn points'}</strong>
                  <span>{isZh ? '你和朋友都能得到 1000 积分。' : 'You both receive 1,000 points.'}</span>
                </div>
              </div>
            </div>

            <div className="menu-invite-meta">
              <span>{isZh ? `邀请码 ${referrals.inviteCode || 'NQSTART'}` : `Code ${referrals.inviteCode || 'NQSTART'}`}</span>
              <span>{isZh ? `已邀请 ${referrals.total || 0} 人` : `${referrals.total || 0} invited`}</span>
            </div>

            {shareFeedback ? <p className="menu-inline-feedback">{shareFeedback}</p> : null}

            <div className="menu-invite-actions">
              <button type="button" className="menu-solid-cta" onClick={() => shareInvite('contacts')}>
                {isZh ? '邀请联系人' : 'Invite contacts'}
              </button>
              <button type="button" className="menu-outline-cta" onClick={() => shareInvite('link')}>
                {isZh ? '分享链接' : 'Share link'}
              </button>
            </div>

            <p className="menu-invite-footnote">
              {isZh ? '大多数邀请奖励为 1000 积分。条款适用。' : 'Most invite rewards are 1,000 points. Terms apply.'}
            </p>
          </div>
        </section>
      );
    }
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isHistory ? copy.history : copy.rewards}</h1>
          <p>
            {isHistory
              ? locale?.startsWith('zh')
                ? '查看积分规则、历史与 VIP 兑换记录。'
                : 'Track rules, history, and VIP redemption.'
              : copy.rewardsCopy}
          </p>
        </div>
        <div className="menu-group-list">
          {(isHistory
            ? (ledger.length
                ? ledger.map((item) => ({
                    title: `${item.pointsDelta > 0 ? '+' : ''}${item.pointsDelta}`,
                    desc: item.description || item.title
                  }))
                : [
                    {
                      title: locale?.startsWith('zh') ? '暂无积分流水' : 'No point activity yet',
                      desc: locale?.startsWith('zh') ? '真实事件发生后会记在这里。' : 'Real point activity will appear here once it happens.'
                    }
                  ])
            : [
                {
                  title: locale?.startsWith('zh') ? '邀请好友' : 'Invite friends',
                  desc: referrals.inviteCode
                    ? locale?.startsWith('zh')
                      ? `邀请码 ${referrals.inviteCode} · 已邀请 ${referrals.total} 人`
                      : `Code ${referrals.inviteCode} · ${referrals.total} referrals`
                    : locale?.startsWith('zh')
                      ? '登录后生成邀请码。'
                      : 'Sign in to generate your invite code.'
                },
                {
                  title: locale?.startsWith('zh') ? '兑换 VIP' : 'Redeem VIP',
                  desc: locale?.startsWith('zh')
                    ? `已兑换 ${points.vipDaysRedeemed || 0} 天，当前余额 ${points.vipDays || 0} 天。`
                    : `${points.vipDaysRedeemed || 0} days redeemed, ${points.vipDays || 0} days available.`
                }
              ]
          ).map((item) => (
            <div key={item.title} className="menu-list-row static">
              <span>
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-desc">{item.desc}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section === 'support') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head menu-page-head-support">
          <h1>{isZh ? `${firstName}，我们可以怎么帮你？` : `Hi ${firstName}, how can we help?`}</h1>
        </div>

        <div className="menu-support-callout">
          <span className="menu-support-callout-icon" aria-hidden="true">
            i
          </span>
          <p>
            {isZh
              ? '需要帮助处理账户、邀请奖励、数据导出或交易问题？先看帮助中心，或者直接联系 NovaQuant Support。'
              : 'Need help with your account, invite rewards, data exports, or trading questions? Start in the Help Center or contact NovaQuant Support directly.'}
          </p>
        </div>

        <div className="menu-support-section">
          <h2>{isZh ? '支持工具' : 'Support tools'}</h2>
          <div className="menu-group-list">
            <button type="button" className="menu-list-row" onClick={() => onSectionChange('help-center')}>
              <span>
                <span className="menu-list-title">{isZh ? '帮助中心' : 'Help center'}</span>
                <span className="menu-list-desc">{isZh ? '账户、邀请、交易与数据常见问题。' : 'Account, invite, trading, and data FAQs.'}</span>
              </span>
              <span className="menu-list-arrow">›</span>
            </button>
            <button type="button" className="menu-list-row" onClick={() => onSectionChange('support-chats')}>
              <span>
                <span className="menu-list-title">{isZh ? '你的支持会话' : 'Your support chats'}</span>
                <span className="menu-list-desc">{isZh ? '查看当前处理中的支持请求。' : 'See the support requests that are currently open.'}</span>
              </span>
              <span className="menu-list-arrow">›</span>
            </button>
            <button type="button" className="menu-list-row" onClick={() => onSectionChange('disclosures')}>
              <span>
                <span className="menu-list-title">{isZh ? '披露与说明' : 'Disclosures'}</span>
                <span className="menu-list-desc">{isZh ? '版本、数据口径、演示说明与限制。' : 'Version notes, data scope, demo disclosures, and limitations.'}</span>
              </span>
              <span className="menu-list-arrow">›</span>
            </button>
          </div>
        </div>

        <p className="menu-version-line">{buildVersionLabel(appMeta)}</p>

        <button
          type="button"
          className="menu-solid-cta menu-solid-cta-full"
          onClick={() =>
            openMailto(
              isZh ? 'NovaQuant 支持请求' : 'NovaQuant support request',
              isZh ? '请描述你遇到的问题，我们会尽快回复。' : 'Please describe what happened and we will get back to you shortly.'
            )
          }
        >
          {isZh ? '联系支持' : 'Contact Support'}
        </button>
      </section>
    );
  }

  if (section === 'help-center') {
    const topics = isZh
      ? [
          { title: '账户与登录', desc: '登录失败、设备切换、账号绑定与身份信息问题。' },
          { title: '邀请与积分', desc: '邀请奖励、邀请码、积分到账与 VIP 兑换。' },
          { title: 'Browse / Nova', desc: '搜索不到标的、新闻加载慢、Nova 回答不准。' },
          { title: '数据与回测', desc: '行情延迟、回测口径、演示数据与真实数据差异。' }
        ]
      : [
          { title: 'Account & login', desc: 'Sign-in issues, device changes, account linking, and identity questions.' },
          { title: 'Invites & points', desc: 'Invite rewards, codes, points credits, and VIP redemption.' },
          { title: 'Browse / Nova', desc: 'Missing symbols, slow news loading, or low-quality Nova answers.' },
          { title: 'Data & backtests', desc: 'Market data delays, backtest methodology, and demo-vs-live differences.' }
        ];
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '帮助中心' : 'Help center'}</h1>
          <p>{isZh ? '从最常见的问题开始，遇到卡点再联系支持。' : 'Start with the most common questions, then contact support if you are still blocked.'}</p>
        </div>
        <div className="menu-group-list">
          {topics.map((item) => (
            <div key={item.title} className="menu-list-row static">
              <span>
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-desc">{item.desc}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section === 'support-chats') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '你的支持会话' : 'Your support chats'}</h1>
          <p>{isZh ? '当前没有未完成的支持会话。新请求会通过邮件与你同步。' : 'There are no open support chats right now. New requests will sync to your email.'}</p>
        </div>
        <div className="menu-empty-surface">
          <p>{isZh ? '需要帮助时，直接使用页面底部的 Contact Support。' : 'If you need help, use the Contact Support button on the main support page.'}</p>
        </div>
      </section>
    );
  }

  if (section === 'disclosures') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '披露与说明' : 'Disclosures'}</h1>
          <p>{isZh ? '关于数据、演示、执行与系统边界的关键说明。' : 'Key notes about data, demo behavior, execution, and system boundaries.'}</p>
        </div>
        <div className="menu-group-list">
          {[
            isZh
              ? { title: '市场数据', desc: '页面会优先展示公开行情与缓存快照，极少数时刻可能存在秒级延迟。' }
              : { title: 'Market data', desc: 'The app prioritizes public market feeds and cached snapshots; in rare moments a seconds-level delay can occur.' },
            isZh
              ? { title: '演示模式', desc: '部分页面会使用 demo 样例数据来保证流程完整，这不代表真实成交记录。' }
              : { title: 'Demo mode', desc: 'Some surfaces use demo data to keep flows complete. This does not represent real execution history.' },
            isZh
              ? { title: '执行与券商', desc: '交易票据、纸面执行和券商跳转已经支持，但并非所有券商都开放 API 直连下单。' }
              : { title: 'Execution & brokers', desc: 'Trade tickets, paper execution, and broker handoff are supported, but not every broker has direct order API connectivity.' }
          ].map((item) => (
            <div key={item.title} className="menu-list-row static">
              <span>
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-desc">{item.desc}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section === 'security-privacy') {
    const securityRows = [
      { title: isZh ? '创建通行密钥' : 'Create passkey' },
      { title: isZh ? '修改密码' : 'Change password' },
      { title: isZh ? '设备安全' : 'Device security', note: 'Face ID' },
      { title: isZh ? '设备管理' : 'Devices' }
    ];
    const privacyRows = [
      { title: isZh ? '管理资料可见性' : 'Manage profile visibility' },
      { title: isZh ? '屏蔽名单' : 'Blocking' },
      { title: isZh ? '管理你的数据' : 'Manage your data' },
      { title: isZh ? '隐私政策' : 'Privacy Policy' }
    ];
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-security-hero" aria-hidden="true">
          <div className="menu-security-orbit">
            <span className="menu-security-dot menu-security-dot-a" />
            <span className="menu-security-dot menu-security-dot-b" />
            <span className="menu-security-dot menu-security-dot-c" />
          </div>
        </div>

        <div className="menu-security-section">
          <div className="menu-page-head">
            <h1>{isZh ? '安全' : 'Security'}</h1>
            <p>{isZh ? '为你的 NovaQuant 账户增加额外的安全保护。' : 'Protect your NovaQuant account with additional layers of security.'}</p>
          </div>
          <div className="menu-group-list">
            {securityRows.map((item) => (
              <div key={item.title} className="menu-list-row static">
                <span>
                  <span className="menu-list-title">{item.title}</span>
                  {item.note ? <span className="menu-list-desc menu-list-desc-accent">{item.note}</span> : null}
                </span>
                <span className="menu-list-arrow">›</span>
              </div>
            ))}
          </div>
        </div>

        <div className="menu-security-section">
          <div className="menu-page-head">
            <h1>{isZh ? '隐私' : 'Privacy'}</h1>
            <p>{isZh ? '管理你的资料、数据使用与隐私边界。' : 'Manage how your profile and data are used.'}</p>
          </div>
          <div className="menu-group-list">
            {privacyRows.map((item) => (
              <div key={item.title} className="menu-list-row static">
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-arrow">›</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (group) {
    const title =
      group.key === 'group:review'
        ? copy.review
        : group.key === 'group:system'
          ? copy.system
          : group.key === 'group:market'
            ? copy.marketNotes
            : copy.settings;
    const description =
      group.key === 'group:review'
        ? copy.reviewDescription
        : group.key === 'group:system'
          ? copy.systemDescription
          : group.key === 'group:market'
            ? copy.marketDescription
            : copy.settingsDescription;
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="menu-group-list">
          {group.items.map((key) => {
            const item = catalog[key];
            if (!item) return null;
            return (
              <button key={key} type="button" className="menu-list-row" onClick={() => onSectionChange(key)}>
                <span>
                  <span className="menu-list-title">{item.title}</span>
                  <span className="menu-list-desc">{item.description}</span>
                </span>
                <span className="menu-list-arrow">›</span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="stack-gap menu-screen">
      <div className="menu-page-head">
        <h1>{copy.menu}</h1>
      </div>

      <div className="menu-group-list">
        {[
          { key: 'support', title: copy.supportRootTitle, desc: copy.supportRootCopy },
          { key: 'rewards', title: copy.rewards, desc: copy.rewardsRootCopy },
          { key: 'security-privacy', title: copy.securityPrivacy, desc: copy.securityPrivacyCopy },
          { key: 'settings', title: copy.settings, desc: locale?.startsWith('zh') ? '通知、偏好、账户与模式。' : 'Notifications, preferences, account, and mode.' }
        ].map((item) => (
          <button key={item.key} type="button" className="menu-list-row" onClick={() => onSectionChange(item.key)}>
            <span>
              <span className="menu-list-title">{item.title}</span>
              <span className="menu-list-desc">{item.desc}</span>
            </span>
            <span className="menu-list-arrow">›</span>
          </button>
        ))}
      </div>

      <div className="menu-identity-row menu-identity-row-plain">
        <div className="menu-identity-copy">
          <p className="menu-identity-kicker">{copy.username}</p>
          <p className="menu-identity-value">{username}</p>
        </div>
      </div>

      <button type="button" className="menu-outline-cta menu-outline-cta-logout" onClick={onLogout}>
        {copy.logout}
      </button>

      <div className="menu-utility-section">
        <p className="menu-utility-kicker">{isZh ? 'NovaQuant 工具' : 'NovaQuant tools'}</p>
        <div className="menu-group-list">
          {[
            { key: 'points', title: copy.pointsHub, desc: locale?.startsWith('zh') ? '积分、VIP 与活动记录。' : 'Points, VIP, and activity history.' },
            { key: 'group:review', title: copy.review, desc: copy.reviewDescription },
            { key: 'group:system', title: copy.system, desc: copy.systemDescription },
            { key: 'group:market', title: copy.marketNotes, desc: copy.marketDescription },
            ...(showDemoEntry
              ? [
                  {
                    key: 'demo',
                    title: locale?.startsWith('zh') ? '演示模式' : 'Demo Mode',
                    desc: locale?.startsWith('zh')
                      ? '用样例数据走完整个平台，不影响真实账户路径。'
                      : 'Run a sample-data walkthrough without touching the real account path.'
                  }
                ]
              : []),
            { key: 'about', title: copy.about, desc: locale?.startsWith('zh') ? '版本、支持与合规信息。' : 'Version, support, and compliance.' }
          ].map((item) => {
            const onClick = item.key === 'about' ? onOpenAbout : item.key === 'demo' ? onToggleDemo : () => onSectionChange(item.key);
            return (
              <button key={item.key} type="button" className="menu-list-row" onClick={onClick}>
                <span>
                  <span className="menu-list-title">{item.title}</span>
                  <span className="menu-list-desc">{item.desc}</span>
                </span>
                <span className="menu-list-arrow">{item.key === 'demo' ? (demoEnabled ? 'On' : 'Off') : '›'}</span>
              </button>
            );
          })}
        </div>
      </div>

    </section>
  );
}
