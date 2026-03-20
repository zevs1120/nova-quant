import React from 'react';

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
    predictionGames: zh ? '预测游戏' : 'Prediction Games',
    rewards: zh ? '奖励 / 邀请好友' : 'Rewards / Invite Friends',
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
    if (!manualAvailable) return renderManualUnavailable();
    const isHistory = section === 'points-history';
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

      <div className="menu-identity-row">
        <div className="menu-identity-copy">
          <p className="menu-identity-kicker">{copy.username}</p>
          <p className="menu-identity-value">{username}</p>
        </div>
        <button type="button" className="points-pill" onClick={() => onSectionChange('points')}>
          <span className="points-pill-balance">{formatPoints(points.balance, locale)}</span>
          <span className="points-pill-hint">{pointsHint(points, locale)}</span>
        </button>
      </div>

      <div className="menu-group-list">
        {[
          { key: 'prediction-games', title: copy.predictionGames, desc: copy.predictionCopy },
          { key: 'rewards', title: copy.rewards, desc: copy.rewardsCopy },
          { key: 'group:review', title: copy.review, desc: copy.reviewDescription },
          { key: 'group:system', title: copy.system, desc: copy.systemDescription },
          { key: 'group:market', title: copy.marketNotes, desc: copy.marketDescription },
          { key: 'group:settings', title: copy.settings, desc: copy.settingsDescription },
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
          { key: 'about', title: copy.about, desc: locale?.startsWith('zh') ? '版本、支持与合规信息。' : 'Version, support, and compliance.' },
          { key: 'logout', title: copy.logout, desc: locale?.startsWith('zh') ? '退出当前本地会话。' : 'Leave the current local session.' }
        ].map((item) => {
          const onClick =
            item.key === 'about'
              ? onOpenAbout
              : item.key === 'logout'
                ? onLogout
                : item.key === 'demo'
                  ? onToggleDemo
                : () => onSectionChange(item.key);
          return (
            <button key={item.key} type="button" className="menu-list-row" onClick={onClick}>
              <span>
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-desc">{item.desc}</span>
              </span>
              <span className="menu-list-arrow">
                {item.key === 'logout' ? '⤴' : item.key === 'demo' ? (demoEnabled ? 'On' : 'Off') : '›'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
