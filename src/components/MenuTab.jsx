import React, { useMemo, useState } from 'react';

const MENU_GROUPS = [
  {
    key: 'group:review',
    items: ['weekly', 'discipline'],
  },
  {
    key: 'group:system',
    items: ['signals', 'performance', 'safety', 'data', 'learning'],
  },
  {
    key: 'group:market',
    items: ['insights'],
  },
  {
    key: 'group:settings',
    items: ['settings', 'advanced'],
  },
];

function localeCopy(locale) {
  const zh = locale?.startsWith('zh');
  return {
    menu: zh ? '菜单' : 'Menu',
    support: zh ? '支持' : 'Support',
    supportRootTitle: zh ? 'NovaQuant Support' : 'NovaQuant Support',
    supportRootCopy: zh
      ? '帮助中心、联系支持、查看你的支持会话。'
      : 'Help Center, contact us 24/7, and check your support chats.',
    predictionGames: zh ? '预测游戏' : 'Prediction Games',
    rewards: zh ? '奖励 / 邀请好友' : 'Rewards / Invite Friends',
    rewardsRootCopy: zh
      ? '邀请朋友，赚取 1000 积分奖励。'
      : 'Invite friends and earn 1,000-point rewards.',
    securityPrivacy: zh ? '安全与隐私' : 'Security & privacy',
    securityPrivacyCopy: zh
      ? '密码、设备安全、隐私与数据控制。'
      : 'Password, device security, privacy, and data controls.',
    review: zh ? '复盘' : 'Review',
    system: zh ? '系统' : 'System',
    marketNotes: zh ? '市场笔记' : 'Market Notes',
    settings: zh ? '设置' : 'Settings',
    about: zh ? '关于' : 'About',
    logout: zh ? '退出登录' : 'Log out',
    points: zh ? '积分' : 'Points',
    predictionCopy: zh
      ? '每天用一点判断力，换一点额外乐趣。'
      : 'Turn judgment into a small daily edge.',
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
    pointsUse: zh
      ? '你现在最值得做的是继续拿判断换积分。'
      : 'The best next move is to trade judgment for points.',
    reviewDescription: zh ? '本周总结和纪律记录。' : 'Weekly recap and discipline rhythm.',
    systemDescription: zh
      ? '系统状态、信号、安全、数据和学习飞轮。'
      : 'Signals, safety, performance, data, and the learning loop.',
    marketDescription: zh ? '更宽的市场背景和观察。' : 'Broader context and market notes.',
    settingsDescription: zh ? '语言、偏好和模式设置。' : 'Language, preferences, and modes.',
    username: zh ? '用户名' : 'Username',
  };
}

function buildVersionLabel(appMeta) {
  const version = appMeta?.app_version || '--';
  const build = appMeta?.build_number || appMeta?.build || '--';
  return `Version v${version} (${build})`;
}

function firstNameFromUsername(username) {
  const raw = String(username || '')
    .replace(/^@/, '')
    .trim();
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
  return `https://app.novaquant.cloud/invite?code=${encodeURIComponent(code)}`;
}

function itemCatalog(locale) {
  const zh = locale?.startsWith('zh');
  return {
    weekly: {
      title: zh ? '周复盘' : 'Weekly Review',
      description: zh ? '一周总结和下周重点。' : 'A calm weekly recap and next focus.',
    },
    discipline: {
      title: zh ? '纪律进度' : 'Discipline Progress',
      description: zh ? '查看节奏、边界与连续性。' : 'See your rhythm, boundaries, and streaks.',
    },
    signals: {
      title: zh ? '信号总览' : 'Signals',
      description: zh ? '全部信号和被过滤的原因。' : 'All signals and what got filtered.',
    },
    performance: {
      title: zh ? '表现证明' : 'Performance',
      description: zh ? '纸面、回放和证明摘要。' : 'Paper, replay, and proof summaries.',
    },
    safety: {
      title: zh ? '安全边界' : 'Safety',
      description: zh ? '今天的风险边界和限额。' : 'Today’s guardrails and risk limits.',
    },
    data: {
      title: zh ? '数据状态' : 'Data Status',
      description: zh ? '新鲜度、覆盖率和缺口。' : 'Freshness, coverage, and missing data.',
    },
    learning: {
      title: zh ? '学习飞轮' : 'Learning Loop',
      description: zh
        ? '最近抓取、演化和训练样本。'
        : 'Recent ingestion, evolution, and training samples.',
    },
    insights: {
      title: zh ? '市场洞察' : 'Insights',
      description: zh ? '今天观点背后的大背景。' : 'The background behind today’s view.',
    },
    settings: {
      title: zh ? '设置' : 'Settings',
      description: zh ? '语言、模式和个人偏好。' : 'Language, mode, and personal preferences.',
    },
    advanced: {
      title: zh ? '高级' : 'Advanced',
      description: zh ? '更深的研究与系统细节。' : 'Deeper research and system detail.',
    },
  };
}

function formatPoints(value, locale) {
  const next = Number(value || 0).toLocaleString(locale);
  return locale?.startsWith('zh') ? `${next} 积分` : `${next} pts`;
}

function pointsHint(points, locale) {
  if (points?.status === 'gain') return '+200';
  if (points?.status === 'vip')
    return locale?.startsWith('zh')
      ? `VIP ${points.vipDays || 1}天`
      : `VIP ${points.vipDays || 1}d`;
  return locale?.startsWith('zh') ? '即将过期' : 'Expiring soon';
}

function pointsActivity(points, locale) {
  const zh = locale?.startsWith('zh');
  return [
    {
      title: points?.status === 'gain' ? '+200' : zh ? '今天 +120' : '+120 today',
      desc: zh ? 'Morning Check + 一次 AI 提问。' : 'Morning Check plus one AI question.',
    },
    {
      title: zh
        ? `即将过期 ${Number(points?.expiringSoon || 0).toLocaleString(locale)} 积分`
        : `${Number(points?.expiringSoon || 0).toLocaleString(locale)} pts expiring`,
      desc: zh ? '先换 VIP，别让它白白过期。' : 'Redeem VIP before those points expire.',
    },
    {
      title: zh ? `本月 VIP ${points?.vipDays || 0} 天` : `VIP ${points?.vipDays || 0}d this month`,
      desc: zh ? '已经换到的高级天数会继续累计。' : 'Your redeemed VIP days keep stacking up.',
    },
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
  appMeta,
}) {
  const copy = localeCopy(locale);
  const catalog = itemCatalog(locale);
  const group = MENU_GROUPS.find((item) => item.key === section);
  const manualAvailable = Boolean(manualState?.available || demoEnabled);
  const points = manualState?.summary || {
    balance: 0,
    expiringSoon: 0,
    vipDays: 0,
    vipDaysRedeemed: 0,
  };
  const ledger = Array.isArray(manualState?.ledger) ? manualState.ledger : [];
  const predictions = Array.isArray(manualState?.predictions) ? manualState.predictions : [];
  const rewards = Array.isArray(manualState?.rewards) ? manualState.rewards : [];
  const referrals = manualState?.referrals || {
    inviteCode: null,
    referredByCode: null,
    total: 0,
    rewarded: 0,
  };
  const [shareFeedback, setShareFeedback] = useState('');
  const [profileVisibility, setProfileVisibility] = useState('none');
  const [deviceSecurityMode, setDeviceSecurityMode] = useState('face-id');
  const [privacyPersonalization, setPrivacyPersonalization] = useState(true);
  const [privacyProductUpdates, setPrivacyProductUpdates] = useState(false);
  const [privacyResearchSharing, setPrivacyResearchSharing] = useState(false);
  const isZh = locale?.startsWith('zh');
  const inviteLink = useMemo(() => buildInviteLink(referrals, username), [referrals, username]);
  const firstName = useMemo(() => firstNameFromUsername(username), [username]);
  const securityRows = [
    { key: 'create-passkey', title: isZh ? '创建通行密钥' : 'Create passkey' },
    { key: 'change-password', title: isZh ? '修改密码' : 'Change password' },
    { key: 'device-security', title: isZh ? '设备安全' : 'Device security', note: 'Face ID' },
    { key: 'devices', title: isZh ? '设备管理' : 'Devices' },
  ];
  const privacyRows = [
    { key: 'profile-visibility', title: isZh ? '管理资料可见性' : 'Manage profile visibility' },
    { key: 'blocking', title: isZh ? '屏蔽名单' : 'Blocking' },
    { key: 'manage-data', title: isZh ? '管理你的数据' : 'Manage your data' },
    { key: 'privacy-policy', title: isZh ? '隐私政策' : 'Privacy Policy' },
  ];
  const deviceSessions = [
    {
      key: 'iphone-primary',
      title: isZh ? '这台 iPhone' : 'This iPhone',
      desc: isZh ? '主设备 · 最近活动：刚刚' : 'Primary device · Last active just now',
    },
    {
      key: 'web-session',
      title: isZh ? 'Web session' : 'Web session',
      desc: isZh ? 'Safari · 上海 · 最近活动：2 小时前' : 'Safari · Shanghai · Last active 2h ago',
    },
  ];
  const privacyPolicySections = useMemo(
    () => [
      {
        title: isZh ? '1. 适用范围' : '1. Scope',
        paragraphs: [
          isZh
            ? '本隐私政策适用于 NovaQuant 的网站、移动应用、研究工具、客户支持渠道以及与你的账户、候选信号、行动卡、奖励和数据请求相关的在线服务。只要你注册、浏览、登录、提问、连接账户、提交表单或与我们的支持团队互动，本政策就适用。'
            : 'This Privacy Policy applies to NovaQuant’s websites, mobile apps, research tools, customer support channels, and online services connected to your account, action cards, rewards, and data requests. It applies whenever you register, browse, sign in, ask Nova questions, connect an account, submit a form, or interact with our support team.',
        ],
      },
      {
        title: isZh ? '2. 我们收集哪些信息' : '2. Information We Collect',
        paragraphs: [
          isZh
            ? '我们会收集你主动提供的信息，例如姓名、邮箱、手机号、用户名、登录凭证、偏好设置、邀请信息、支持请求、反馈内容以及你上传的任何资料。'
            : 'We collect information you provide directly, such as your name, email, phone number, username, sign-in credentials, preferences, invite details, support requests, feedback, and any materials you upload.',
          isZh
            ? '我们也会收集账户和产品使用信息，例如观察列表、持仓、交易票据、纸面执行记录、浏览行为、Nova 对话、奖励活动、设备信息、IP 地址、浏览器类型、崩溃日志、性能指标以及 cookie 和类似技术生成的数据。'
            : 'We also collect account and usage information such as watchlists, holdings, trade tickets, paper execution history, browsing behavior, Nova conversations, rewards activity, device information, IP address, browser type, crash logs, performance metrics, and data generated through cookies and similar technologies.',
          isZh
            ? '在你授权的情况下，我们还可能从券商、市场数据供应商、身份验证服务商、分析平台或推荐渠道接收补充信息，以帮助我们提供产品功能、验证身份、检测风险并改善服务。'
            : 'With your authorization, we may also receive supplemental information from brokers, market-data providers, identity-verification vendors, analytics platforms, or referral channels to deliver features, verify identity, detect risk, and improve the service.',
        ],
      },
      {
        title: isZh ? '3. 我们如何使用这些信息' : '3. How We Use Information',
        paragraphs: [
          isZh
            ? '我们使用这些信息来创建和维护你的账户、生成个性化研究与行动卡、提供 Nova 对话、处理邀请奖励、导出数据、排查问题、回应支持请求并持续优化产品体验。'
            : 'We use this information to create and maintain your account, generate personalized research and action cards, power Nova conversations, process invite rewards, export data, troubleshoot issues, respond to support requests, and improve the product experience.',
          isZh
            ? '我们还会将信息用于安全与合规目的，例如识别欺诈、保护系统、执行平台规则、履行法律义务、保存审计记录以及在必要时调查异常活动。'
            : 'We also use information for security and compliance purposes, such as detecting fraud, protecting systems, enforcing platform rules, meeting legal obligations, keeping audit records, and investigating unusual activity when needed.',
        ],
      },
      {
        title: isZh ? '4. 信息披露与共享' : '4. Disclosures and Sharing',
        paragraphs: [
          isZh
            ? '我们不会出售你的个人信息。我们会在有限且合理的场景下共享信息，包括与代表我们提供托管、分析、身份验证、客户支持、消息发送、支付、奖励发放和基础设施服务的供应商共享。'
            : 'We do not sell your personal information. We share information only in limited and appropriate situations, including with vendors that provide hosting, analytics, identity verification, customer support, messaging, payments, rewards fulfillment, and infrastructure services on our behalf.',
          isZh
            ? '当你主动连接券商、使用第三方登录、导出数据、发起分享或授权特定功能时，我们会按照你的指示共享必要信息。若法律、监管、诉讼、审计或公司重组需要，我们也可能依法披露相关信息。'
            : 'When you connect a broker, use third-party sign-in, export data, share content, or authorize a specific feature, we may share the information needed to follow your instructions. We may also disclose information when required by law, regulation, litigation, audit, or corporate reorganization.',
        ],
      },
      {
        title: isZh
          ? '5. Cookie、追踪技术与设备权限'
          : '5. Cookies, Tracking Technologies, and Device Permissions',
        paragraphs: [
          isZh
            ? 'NovaQuant 使用 cookie、本地存储、像素和类似技术来保持登录状态、记住偏好、衡量性能、分析功能使用情况并改进产品。你可以通过浏览器或设备设置管理这些权限，但部分功能可能因此不可用。'
            : 'NovaQuant uses cookies, local storage, pixels, and similar technologies to keep you signed in, remember preferences, measure performance, analyze feature usage, and improve the product. You can manage these permissions through your browser or device settings, but some features may stop working properly.',
          isZh
            ? '如果你在设备层面关闭联系人、通知、相册、生物识别或位置权限，我们会尊重这些选择，但相关体验可能会受到影响。'
            : 'If you disable contacts, notifications, photo access, biometrics, or location permissions at the device level, we will honor that choice, but related experiences may be reduced.',
        ],
      },
      {
        title: isZh ? '6. 你的控制权与选择' : '6. Your Controls and Choices',
        paragraphs: [
          isZh
            ? '你可以在 NovaQuant 内管理资料可见性、营销偏好、设备安全、屏蔽名单、数据导出和删除申请。某些法律辖区还可能赋予你访问、更正、删除、限制处理或撤回授权的权利。'
            : 'You can manage profile visibility, marketing preferences, device security, blocked users, data exports, and deletion requests inside NovaQuant. Depending on where you live, you may also have rights to access, correct, delete, restrict certain processing, or withdraw consent.',
          isZh
            ? '我们会在适用法律允许的范围内处理这些请求；在某些情况下，我们可能需要先验证身份，或者因安全、合规、反欺诈、审计和记录保存要求而保留部分信息。'
            : 'We will process these requests to the extent required by applicable law; in some cases we may need to verify your identity first, or keep certain information for security, compliance, anti-fraud, audit, and record-retention reasons.',
        ],
      },
      {
        title: isZh ? '7. 信息保留' : '7. Retention of Information',
        paragraphs: [
          isZh
            ? '我们会在实现最初收集目的所需的期限内保留信息，并在必要时为了遵守法律、监管、税务、会计、争议处理、风控或审计义务而延长保留时间。'
            : 'We retain information for as long as needed to fulfill the original purpose for which it was collected and, when necessary, for longer periods to comply with legal, regulatory, tax, accounting, dispute-resolution, risk, or audit obligations.',
        ],
      },
      {
        title: isZh ? '8. 信息安全' : '8. Security',
        paragraphs: [
          isZh
            ? '我们使用访问控制、传输加密、日志审计、供应商审查、异常检测和账号保护措施来保护你的信息，但任何系统都无法承诺绝对安全。请使用强密码、设备锁和双重验证，并及时保护你的登录凭证。'
            : 'We use access controls, encryption in transit, audit logging, vendor reviews, anomaly detection, and account-protection measures to help protect your information, but no system can promise absolute security. Please use a strong password, device lock, and multifactor protections, and keep your credentials secure.',
        ],
      },
      {
        title: isZh ? '9. 儿童隐私' : '9. Children’s Privacy',
        paragraphs: [
          isZh
            ? 'NovaQuant 并非面向 13 岁以下儿童设计，我们不会明知收集这类用户的个人信息。如果你认为未成年人在不适当的情况下向我们提交了信息，请联系我们，我们会采取合理措施处理。'
            : 'NovaQuant is not designed for children under 13, and we do not knowingly collect personal information from them. If you believe a minor has provided information inappropriately, please contact us and we will take reasonable steps to address it.',
        ],
      },
      {
        title: isZh ? '10. 国际传输' : '10. International Transfers',
        paragraphs: [
          isZh
            ? '为了运营全球化产品，我们的服务提供商、云基础设施或支持团队可能会在不同国家处理信息。发生跨境传输时，我们会采取合同、技术和组织措施来保护相关数据。'
            : 'To operate a global product, our service providers, cloud infrastructure, or support teams may process information in different countries. When cross-border transfers occur, we use contractual, technical, and organizational measures to help protect that data.',
        ],
      },
      {
        title: isZh ? '11. 政策更新' : '11. Changes to This Policy',
        paragraphs: [
          isZh
            ? '本政策会随着产品、法律要求和业务实践变化而更新。我们更新时会修改生效日期，并在必要时通过产品内通知、邮件或页面提示向你说明。'
            : 'This policy may change as our product, legal requirements, and business practices evolve. When we update it, we will revise the effective date and, when appropriate, provide notice through the product, by email, or on this page.',
        ],
      },
      {
        title: isZh ? '12. 联系我们' : '12. Contact Us',
        paragraphs: [
          isZh
            ? '如果你对本隐私政策或你的隐私选择有任何问题，请联系 support@novaquant.cloud，并在主题中注明 Privacy Request。'
            : 'If you have any questions about this Privacy Policy or your privacy choices, contact support@novaquant.cloud and include “Privacy Request” in the subject line.',
        ],
      },
    ],
    [isZh],
  );

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
          <button
            type="button"
            className="points-hub-primary-card"
            onClick={() => onSectionChange('prediction-games')}
          >
            <span className="menu-primary-title">{copy.games}</span>
            <span className="menu-primary-copy">{copy.predictionCopy}</span>
          </button>
          <button
            type="button"
            className="points-hub-primary-card points-hub-primary-card-accent"
            onClick={() => onSectionChange('rewards')}
          >
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
                  description: locale?.startsWith('zh')
                    ? '先把快过期的积分换成 VIP。'
                    : 'Turn expiring points into VIP first.',
                  costPoints: 1000,
                  enabled: false,
                },
              ]
          ).map((item) => (
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
              <span className="menu-list-arrow">
                {item.kind === 'vip_day' ? `${item.costPoints}` : '›'}
              </span>
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
                  desc: item.description || item.title,
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
            <button
              type="button"
              className="menu-list-row"
              onClick={() => onSectionChange('points-history')}
            >
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
                    : 'Waiting for entry or settlement.',
              }))
            : [
                locale?.startsWith('zh')
                  ? { title: '当前没有正在进行的真实题目', copy: '新题目上线后会直接出现在这里。' }
                  : {
                      title: 'No live rounds right now',
                      copy: 'New prediction markets will appear here as soon as they are published.',
                    },
              ]
          ).map((item) => (
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
                  <span>
                    {isZh ? '把邀请链接发给朋友。' : 'Send your invite link to a friend.'}
                  </span>
                </div>
                <div className="menu-invite-step">
                  <strong>{isZh ? '2. 完成注册' : '2. Complete signup'}</strong>
                  <span>
                    {isZh ? '朋友完成注册并连接账户。' : 'Your friend signs up and finishes setup.'}
                  </span>
                </div>
                <div className="menu-invite-step">
                  <strong>{isZh ? '3. 双方得分' : '3. Both earn points'}</strong>
                  <span>
                    {isZh ? '你和朋友都能得到 1000 积分。' : 'You both receive 1,000 points.'}
                  </span>
                </div>
              </div>
            </div>

            <div className="menu-invite-meta">
              <span>
                {isZh
                  ? `邀请码 ${referrals.inviteCode || 'NQSTART'}`
                  : `Code ${referrals.inviteCode || 'NQSTART'}`}
              </span>
              <span>
                {isZh ? `已邀请 ${referrals.total || 0} 人` : `${referrals.total || 0} invited`}
              </span>
            </div>

            {shareFeedback ? <p className="menu-inline-feedback">{shareFeedback}</p> : null}

            <div className="menu-invite-actions">
              <button
                type="button"
                className="menu-solid-cta"
                onClick={() => shareInvite('contacts')}
              >
                {isZh ? '邀请联系人' : 'Invite contacts'}
              </button>
              <button
                type="button"
                className="menu-outline-cta"
                onClick={() => shareInvite('link')}
              >
                {isZh ? '分享链接' : 'Share link'}
              </button>
            </div>

            <p className="menu-invite-footnote">
              {isZh
                ? '大多数邀请奖励为 1000 积分。条款适用。'
                : 'Most invite rewards are 1,000 points. Terms apply.'}
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
            ? ledger.length
              ? ledger.map((item) => ({
                  title: `${item.pointsDelta > 0 ? '+' : ''}${item.pointsDelta}`,
                  desc: item.description || item.title,
                }))
              : [
                  {
                    title: locale?.startsWith('zh') ? '暂无积分流水' : 'No point activity yet',
                    desc: locale?.startsWith('zh')
                      ? '真实事件发生后会记在这里。'
                      : 'Real point activity will appear here once it happens.',
                  },
                ]
            : [
                {
                  title: locale?.startsWith('zh') ? '邀请好友' : 'Invite friends',
                  desc: referrals.inviteCode
                    ? locale?.startsWith('zh')
                      ? `邀请码 ${referrals.inviteCode} · 已邀请 ${referrals.total} 人`
                      : `Code ${referrals.inviteCode} · ${referrals.total} referrals`
                    : locale?.startsWith('zh')
                      ? '登录后生成邀请码。'
                      : 'Sign in to generate your invite code.',
                },
                {
                  title: locale?.startsWith('zh') ? '兑换 VIP' : 'Redeem VIP',
                  desc: locale?.startsWith('zh')
                    ? `已兑换 ${points.vipDaysRedeemed || 0} 天，当前余额 ${points.vipDays || 0} 天。`
                    : `${points.vipDaysRedeemed || 0} days redeemed, ${points.vipDays || 0} days available.`,
                },
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
            <button
              type="button"
              className="menu-list-row"
              onClick={() => onSectionChange('help-center')}
            >
              <span>
                <span className="menu-list-title">{isZh ? '帮助中心' : 'Help center'}</span>
                <span className="menu-list-desc">
                  {isZh
                    ? '账户、邀请、交易与数据常见问题。'
                    : 'Account, invite, trading, and data FAQs.'}
                </span>
              </span>
              <span className="menu-list-arrow">›</span>
            </button>
            <button
              type="button"
              className="menu-list-row"
              onClick={() => onSectionChange('support-chats')}
            >
              <span>
                <span className="menu-list-title">
                  {isZh ? '你的支持会话' : 'Your support chats'}
                </span>
                <span className="menu-list-desc">
                  {isZh
                    ? '查看当前处理中的支持请求。'
                    : 'See the support requests that are currently open.'}
                </span>
              </span>
              <span className="menu-list-arrow">›</span>
            </button>
            <button
              type="button"
              className="menu-list-row"
              onClick={() => onSectionChange('disclosures')}
            >
              <span>
                <span className="menu-list-title">{isZh ? '披露与说明' : 'Disclosures'}</span>
                <span className="menu-list-desc">
                  {isZh
                    ? '版本、数据口径、演示说明与限制。'
                    : 'Version notes, data scope, demo disclosures, and limitations.'}
                </span>
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
              isZh
                ? '请描述你遇到的问题，我们会尽快回复。'
                : 'Please describe what happened and we will get back to you shortly.',
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
          { title: '数据与回测', desc: '行情延迟、回测口径、演示数据与真实数据差异。' },
        ]
      : [
          {
            title: 'Account & login',
            desc: 'Sign-in issues, device changes, account linking, and identity questions.',
          },
          {
            title: 'Invites & points',
            desc: 'Invite rewards, codes, points credits, and VIP redemption.',
          },
          {
            title: 'Browse / Nova',
            desc: 'Missing symbols, slow news loading, or low-quality Nova answers.',
          },
          {
            title: 'Data & backtests',
            desc: 'Market data delays, backtest methodology, and demo-vs-live differences.',
          },
        ];
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '帮助中心' : 'Help center'}</h1>
          <p>
            {isZh
              ? '从最常见的问题开始，遇到卡点再联系支持。'
              : 'Start with the most common questions, then contact support if you are still blocked.'}
          </p>
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
          <p>
            {isZh
              ? '当前没有未完成的支持会话。新请求会通过邮件与你同步。'
              : 'There are no open support chats right now. New requests will sync to your email.'}
          </p>
        </div>
        <div className="menu-empty-surface">
          <p>
            {isZh
              ? '需要帮助时，直接使用页面底部的 Contact Support。'
              : 'If you need help, use the Contact Support button on the main support page.'}
          </p>
        </div>
      </section>
    );
  }

  if (section === 'disclosures') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '披露与说明' : 'Disclosures'}</h1>
          <p>
            {isZh
              ? '关于数据、演示、执行与系统边界的关键说明。'
              : 'Key notes about data, demo behavior, execution, and system boundaries.'}
          </p>
        </div>
        <div className="menu-group-list">
          {[
            isZh
              ? {
                  title: '市场数据',
                  desc: '页面会优先展示公开行情与缓存快照，极少数时刻可能存在秒级延迟。',
                }
              : {
                  title: 'Market data',
                  desc: 'The app prioritizes public market feeds and cached snapshots; in rare moments a seconds-level delay can occur.',
                },
            isZh
              ? {
                  title: '演示模式',
                  desc: '部分页面会使用 demo 样例数据来保证流程完整，这不代表真实成交记录。',
                }
              : {
                  title: 'Demo mode',
                  desc: 'Some surfaces use demo data to keep flows complete. This does not represent real execution history.',
                },
            isZh
              ? {
                  title: '执行与券商',
                  desc: '交易票据、纸面执行和券商跳转已经支持，但并非所有券商都开放 API 直连下单。',
                }
              : {
                  title: 'Execution & brokers',
                  desc: 'Trade tickets, paper execution, and broker handoff are supported, but not every broker has direct order API connectivity.',
                },
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

  if (section === 'create-passkey') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '创建通行密钥' : 'Create passkey'}</h1>
          <p>
            {isZh
              ? '使用 Face ID、Touch ID 或设备锁替代密码登录 NovaQuant。通行密钥会保存在你受信任的设备上。'
              : 'Use Face ID, Touch ID, or your device lock to sign in to NovaQuant instead of typing a password. A passkey stays on your trusted device.'}
          </p>
        </div>
        <div className="menu-setting-surface">
          <div className="menu-setting-highlight">
            <span className="menu-setting-kicker">{isZh ? '当前状态' : 'Current status'}</span>
            <strong>
              {isZh ? '这台设备已准备好创建通行密钥' : 'This device is ready for a passkey'}
            </strong>
            <p>
              {isZh
                ? '创建后，你将能用生物识别或屏幕锁快速登录，并可在 Devices 页面随时撤销。'
                : 'Once created, you can sign in with biometrics or your screen lock and revoke access at any time from Devices.'}
            </p>
          </div>
          <div className="menu-detail-bullets">
            <div className="menu-detail-bullet">
              <strong>{isZh ? '更快登录' : 'Faster sign-in'}</strong>
              <span>
                {isZh
                  ? '减少手动输入密码的频率。'
                  : 'Reduce how often you need to type a password.'}
              </span>
            </div>
            <div className="menu-detail-bullet">
              <strong>{isZh ? '更强保护' : 'Stronger protection'}</strong>
              <span>
                {isZh
                  ? '降低重复密码和钓鱼风险。'
                  : 'Lower the risk of reused passwords and phishing.'}
              </span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (section === 'change-password') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '修改密码' : 'Change password'}</h1>
          <p>
            {isZh
              ? '定期更新密码，并避免在多个服务中重复使用同一组凭证。'
              : 'Update your password regularly and avoid reusing the same credentials across services.'}
          </p>
        </div>
        <div className="menu-setting-surface">
          <div className="menu-detail-bullets">
            <div className="menu-detail-bullet">
              <strong>{isZh ? '密码建议' : 'Password guidance'}</strong>
              <span>
                {isZh
                  ? '至少 12 位，混合大小写、数字和符号，并避免使用可猜测的个人信息。'
                  : 'Use at least 12 characters with upper and lower case letters, numbers, and symbols, and avoid guessable personal information.'}
              </span>
            </div>
            <div className="menu-detail-bullet">
              <strong>{isZh ? '推荐做法' : 'Recommended next step'}</strong>
              <span>
                {isZh
                  ? '如果你怀疑密码泄露，请立即重置密码，并同时检查设备会话和通行密钥。'
                  : 'If you suspect your password has been exposed, reset it immediately and review your device sessions and passkey settings at the same time.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="menu-solid-cta menu-solid-cta-full"
            onClick={() =>
              openMailto(
                isZh ? 'NovaQuant 修改密码请求' : 'NovaQuant password change request',
                isZh
                  ? '请协助我发起密码重置流程。'
                  : 'Please help me start the password reset flow.',
              )
            }
          >
            {isZh ? '发起密码重置' : 'Start password reset'}
          </button>
        </div>
      </section>
    );
  }

  if (section === 'device-security') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '设备安全' : 'Device security'}</h1>
          <p>
            {isZh
              ? '控制这台设备上的生物识别登录方式，减少账户被旁路访问的风险。'
              : 'Control biometric sign-in on this device to reduce the chance of account access from an unlocked session.'}
          </p>
        </div>
        <div className="menu-choice-stack">
          {[
            {
              key: 'face-id',
              title: 'Face ID',
              desc: isZh
                ? '优先使用面容识别解锁 NovaQuant。'
                : 'Use Face ID to unlock NovaQuant first.',
            },
            {
              key: 'device-passcode',
              title: isZh ? '设备密码' : 'Device passcode',
              desc: isZh
                ? '在生物识别不可用时，回退到系统锁屏密码。'
                : 'Fall back to your system passcode when biometrics are unavailable.',
            },
          ].map((item) => {
            const active = deviceSecurityMode === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`menu-choice-card ${active ? 'is-selected' : ''}`}
                onClick={() => setDeviceSecurityMode(item.key)}
              >
                <span className="menu-choice-copy">
                  <strong>{item.title}</strong>
                  <span>{item.desc}</span>
                </span>
                <span
                  className={`menu-choice-radio ${active ? 'is-selected' : ''}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  if (section === 'devices') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '设备管理' : 'Devices'}</h1>
          <p>
            {isZh
              ? '检查哪些设备和网页会话仍然可以访问你的 NovaQuant 账户。'
              : 'Review which devices and web sessions can still access your NovaQuant account.'}
          </p>
        </div>
        <div className="menu-group-list">
          {deviceSessions.map((item) => (
            <div key={item.key} className="menu-list-row static">
              <span>
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-desc">{item.desc}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="menu-empty-surface">
          <p>
            {isZh
              ? '如果你发现异常会话，先修改密码，再联系支持协助强制退出所有设备。'
              : 'If you notice a session you do not recognize, change your password first and then contact support to help sign out all devices.'}
          </p>
        </div>
      </section>
    );
  }

  if (section === 'profile-visibility') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '谁可以找到你？' : 'Who can find you?'}</h1>
          <p>
            {isZh
              ? '选择谁可以在 NovaQuant 上通过你的姓名、用户名、手机号或邮箱搜索到你。'
              : 'Choose who can search for you on NovaQuant by your name, username, phone number, or email.'}
          </p>
        </div>
        <div className="menu-choice-stack">
          {[
            {
              key: 'anyone',
              title: isZh ? 'NovaQuant 上的任何人' : 'Anyone on NovaQuant',
              desc: isZh
                ? '任何拥有你基本信息的人都可以搜索到你的资料。'
                : 'Anyone who has your basic account details can search and find your profile.',
            },
            {
              key: 'none',
              title: isZh ? '没有人' : 'No one',
              desc: isZh
                ? '没有人可以通过姓名、用户名、手机号或邮箱找到你。'
                : 'No one can find you by your name, username, phone number, or email.',
            },
          ].map((item) => {
            const active = profileVisibility === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`menu-choice-card ${active ? 'is-selected' : ''}`}
                onClick={() => setProfileVisibility(item.key)}
              >
                <span className="menu-choice-copy">
                  <strong>{item.title}</strong>
                  <span>{item.desc}</span>
                </span>
                <span
                  className={`menu-choice-radio ${active ? 'is-selected' : ''}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="menu-inline-link"
          onClick={() => onSectionChange('privacy-policy')}
        >
          {isZh
            ? '想进一步了解我们如何使用你的个人信息？阅读隐私政策。'
            : 'To better understand how we use your personal information, read our Privacy Policy.'}
        </button>
      </section>
    );
  }

  if (section === 'blocking') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '已屏蔽的人' : 'Blocked people'}</h1>
          <p>
            {isZh
              ? '你还没有屏蔽任何人。被屏蔽的用户将无法找到你、向你发送请求或与你发起社交互动。'
              : 'You have not blocked anyone yet. Blocked people cannot find you, send you requests, or interact with your social profile.'}
          </p>
        </div>
        <div className="menu-empty-surface">
          <p>
            {isZh
              ? '如果你需要限制某位用户与你互动，请联系支持并提供用户名或相关上下文。'
              : 'If you need to restrict someone from interacting with you, contact support and include their username or the relevant context.'}
          </p>
        </div>
      </section>
    );
  }

  if (section === 'manage-data') {
    const rows = [
      {
        key: 'privacy-choices',
        title: isZh ? '你的隐私选择' : 'Your privacy choices',
        desc: isZh
          ? '控制个性化、更新通知和研究用途。'
          : 'Control personalization, updates, and research uses.',
      },
      {
        key: 'download-personal-data',
        title: isZh ? '下载个人数据' : 'Download personal data',
        desc: isZh
          ? '请求一份你的账户与产品使用导出。'
          : 'Request an export of your account and product usage data.',
      },
      {
        key: 'request-data-deletion',
        title: isZh ? '请求删除数据' : 'Request data deletion',
        desc: isZh
          ? '发起删除申请，我们会进行身份核验与合规审查。'
          : 'Start a deletion request and we will review it for identity and compliance requirements.',
      },
    ];
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '管理你的数据' : 'Manage your data'}</h1>
          <p>
            {isZh
              ? '在这里查看你的数据控制入口，决定我们如何使用、导出和处理你的个人信息。'
              : 'Review the controls that let you decide how your personal information is used, exported, and handled.'}
          </p>
        </div>
        <div className="menu-group-list">
          {rows.map((item) => (
            <button
              key={item.key}
              type="button"
              className="menu-list-row"
              onClick={() => onSectionChange(item.key)}
            >
              <span>
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-desc">{item.desc}</span>
              </span>
              <span className="menu-list-arrow">›</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (section === 'privacy-choices') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '你的隐私选择' : 'Your privacy choices'}</h1>
          <p>
            {isZh
              ? '管理个性化、产品更新和研究数据使用范围。'
              : 'Manage personalization, product updates, and how we use data for research improvements.'}
          </p>
        </div>
        <div className="menu-toggle-stack">
          {[
            {
              key: 'personalization',
              enabled: privacyPersonalization,
              onToggle: () => setPrivacyPersonalization((value) => !value),
              title: isZh ? '个性化洞察' : 'Personalized insights',
              desc: isZh
                ? '允许 NovaQuant 根据你的持仓、问答和观察列表优化卡片排序。'
                : 'Allow NovaQuant to tailor card ranking using your holdings, questions, and watchlists.',
            },
            {
              key: 'updates',
              enabled: privacyProductUpdates,
              onToggle: () => setPrivacyProductUpdates((value) => !value),
              title: isZh ? '产品更新与活动提醒' : 'Product updates and reminders',
              desc: isZh
                ? '允许我们通过邮件或站内消息发送更新、功能发布与活动提醒。'
                : 'Allow us to send email or in-product updates about launches, reminders, and rewards activity.',
            },
            {
              key: 'research',
              enabled: privacyResearchSharing,
              onToggle: () => setPrivacyResearchSharing((value) => !value),
              title: isZh ? '匿名研究改进' : 'Anonymized research improvement',
              desc: isZh
                ? '允许我们使用脱敏交互数据改进系统质量与风控。'
                : 'Allow us to use de-identified interaction data to improve system quality and risk controls.',
            },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="menu-toggle-card"
              onClick={item.onToggle}
            >
              <span className="menu-choice-copy">
                <strong>{item.title}</strong>
                <span>{item.desc}</span>
              </span>
              <span className={`preference-toggle ${item.enabled ? 'is-on' : 'is-off'}`}>
                <span />
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (section === 'download-personal-data') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '下载个人数据' : 'Download personal data'}</h1>
          <p>
            {isZh
              ? '你可以请求导出账户资料、观察列表、奖励记录、支持会话以及部分系统日志摘要。'
              : 'You can request an export of your account profile, watchlists, rewards history, support conversations, and selected system-log summaries.'}
          </p>
        </div>
        <div className="menu-setting-surface">
          <div className="menu-detail-bullets">
            <div className="menu-detail-bullet">
              <strong>{isZh ? '通常包含' : 'Usually includes'}</strong>
              <span>
                {isZh
                  ? '账户资料、偏好设置、观察列表、积分记录、支持工单与设备会话摘要。'
                  : 'Account profile, preferences, watchlists, points history, support tickets, and a summary of device sessions.'}
              </span>
            </div>
            <div className="menu-detail-bullet">
              <strong>{isZh ? '交付方式' : 'Delivery method'}</strong>
              <span>
                {isZh
                  ? '我们会先核验身份，然后把导出文件发送到你的注册邮箱。'
                  : 'We verify identity first and then send the export package to your registered email address.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="menu-solid-cta menu-solid-cta-full"
            onClick={() =>
              openMailto(
                isZh ? 'NovaQuant 数据导出请求' : 'NovaQuant data export request',
                isZh
                  ? '请为我的账户发起个人数据导出请求。'
                  : 'Please start a personal data export request for my account.',
              )
            }
          >
            {isZh ? '请求导出' : 'Request export'}
          </button>
        </div>
      </section>
    );
  }

  if (section === 'request-data-deletion') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '请求删除数据' : 'Request data deletion'}</h1>
          <p>
            {isZh
              ? '你可以申请删除部分或全部个人数据。出于合规、安全、反欺诈和记录保存要求，我们可能仍需保留某些信息。'
              : 'You may request deletion of some or all personal data. For compliance, security, anti-fraud, and record-retention reasons, we may still need to keep certain information.'}
          </p>
        </div>
        <div className="menu-setting-surface">
          <div className="menu-detail-bullets">
            <div className="menu-detail-bullet">
              <strong>{isZh ? '提交前请确认' : 'Before you submit'}</strong>
              <span>
                {isZh
                  ? '删除请求可能影响登录、奖励记录、支持历史以及未来的问题排查。'
                  : 'A deletion request may affect sign-in access, rewards history, support history, and our ability to investigate future issues.'}
              </span>
            </div>
            <div className="menu-detail-bullet">
              <strong>{isZh ? '处理流程' : 'Review process'}</strong>
              <span>
                {isZh
                  ? '我们会先核验身份，再依据适用法律和业务义务决定可以删除的范围。'
                  : 'We verify identity first and then review the request against applicable law and our operational obligations.'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="menu-outline-cta menu-solid-cta-full"
            onClick={() =>
              openMailto(
                isZh ? 'NovaQuant 数据删除请求' : 'NovaQuant data deletion request',
                isZh
                  ? '请协助我发起个人数据删除申请。'
                  : 'Please help me start a personal data deletion request.',
              )
            }
          >
            {isZh ? '发起删除申请' : 'Start deletion request'}
          </button>
        </div>
      </section>
    );
  }

  if (section === 'privacy-policy') {
    return (
      <section className="stack-gap menu-screen">
        <div className="menu-page-head">
          <h1>{isZh ? '隐私政策' : 'Privacy Policy'}</h1>
          <p>{isZh ? '生效日期：2026 年 3 月 21 日' : 'Effective date: March 21, 2026'}</p>
        </div>
        <div className="menu-policy-shell">
          {privacyPolicySections.map((item) => (
            <article key={item.title} className="menu-policy-section">
              <h2>{item.title}</h2>
              {item.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (section === 'security-privacy') {
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
            <p>
              {isZh
                ? '为你的 NovaQuant 账户增加额外的安全保护。'
                : 'Protect your NovaQuant account with additional layers of security.'}
            </p>
          </div>
          <div className="menu-group-list">
            {securityRows.map((item) => (
              <button
                key={item.key}
                type="button"
                className="menu-list-row"
                onClick={() => onSectionChange(item.key)}
              >
                <span>
                  <span className="menu-list-title">{item.title}</span>
                  {item.note ? (
                    <span className="menu-list-desc menu-list-desc-accent">{item.note}</span>
                  ) : null}
                </span>
                <span className="menu-list-arrow">›</span>
              </button>
            ))}
          </div>
        </div>

        <div className="menu-security-section">
          <div className="menu-page-head">
            <h1>{isZh ? '隐私' : 'Privacy'}</h1>
            <p>
              {isZh
                ? '管理你的资料、数据使用与隐私边界。'
                : 'Manage how your profile and data are used.'}
            </p>
          </div>
          <div className="menu-group-list">
            {privacyRows.map((item) => (
              <button
                key={item.key}
                type="button"
                className="menu-list-row"
                onClick={() => onSectionChange(item.key)}
              >
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-arrow">›</span>
              </button>
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
              <button
                key={key}
                type="button"
                className="menu-list-row"
                onClick={() => onSectionChange(key)}
              >
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
    <section className="stack-gap menu-screen menu-root-screen">
      <div className="menu-root-main">
        <div className="menu-identity-row menu-identity-row-plain">
          <div className="menu-identity-copy">
            <p className="menu-identity-kicker">{copy.username}</p>
            <p className="menu-identity-value">{username}</p>
          </div>
          <button type="button" className="points-pill" onClick={() => onSectionChange('points')}>
            <span className="points-pill-balance">
              {manualAvailable ? formatPoints(points.balance, locale) : copy.pointsHub}
            </span>
            <span className="points-pill-hint">
              {manualAvailable
                ? pointsHint(points, locale)
                : locale?.startsWith('zh')
                  ? '查看积分'
                  : 'Open points'}
            </span>
          </button>
        </div>

        <div className="menu-group-list">
          {[
            { key: 'support', title: copy.supportRootTitle, desc: copy.supportRootCopy },
            { key: 'rewards', title: copy.rewards, desc: copy.rewardsRootCopy },
            {
              key: 'security-privacy',
              title: copy.securityPrivacy,
              desc: copy.securityPrivacyCopy,
            },
            {
              key: 'settings',
              title: copy.settings,
              desc: locale?.startsWith('zh')
                ? '通知、偏好、账户与模式。'
                : 'Notifications, preferences, account, and mode.',
            },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className="menu-list-row"
              onClick={() => onSectionChange(item.key)}
            >
              <span>
                <span className="menu-list-title">{item.title}</span>
                <span className="menu-list-desc">{item.desc}</span>
              </span>
              <span className="menu-list-arrow">›</span>
            </button>
          ))}
        </div>

        <div className="menu-utility-section">
          <p className="menu-utility-kicker">{isZh ? 'NovaQuant 工具' : 'NovaQuant tools'}</p>
          <div className="menu-group-list">
            {[
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
                        : 'Run a sample-data walkthrough without touching the real account path.',
                    },
                  ]
                : []),
              {
                key: 'about',
                title: copy.about,
                desc: locale?.startsWith('zh')
                  ? '版本、支持与合规信息。'
                  : 'Version, support, and compliance.',
              },
            ].map((item) => {
              const onClick =
                item.key === 'about'
                  ? onOpenAbout
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
                    {item.key === 'demo' ? (demoEnabled ? 'On' : 'Off') : '›'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="menu-root-footer">
        <button
          type="button"
          className="menu-outline-cta menu-outline-cta-logout"
          onClick={onLogout}
        >
          {copy.logout}
        </button>
      </div>
    </section>
  );
}
