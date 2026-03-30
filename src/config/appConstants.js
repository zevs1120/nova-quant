export const MENU_PARENTS = {
  weekly: 'group:review',
  discipline: 'group:review',
  signals: 'group:system',
  performance: 'group:system',
  safety: 'group:system',
  data: 'group:system',
  learning: 'group:system',
  insights: 'group:market',
  settings: 'group:settings',
  advanced: 'group:settings',
};

export const DEFAULT_AUTH_WATCHLIST = Object.freeze(['SPY', 'QQQ', 'AAPL']);

export const DEMO_MANUAL_STATE = Object.freeze({
  available: true,
  mode: 'DEMO',
  reason: null,
  summary: {
    balance: 1240,
    expiringSoon: 180,
    vipDays: 1,
    vipDaysRedeemed: 1,
  },
  referrals: {
    inviteCode: 'DEMO-NOVA',
    referredByCode: null,
    total: 3,
    rewarded: 2,
  },
  ledger: [
    {
      id: 'demo-ledger-1',
      eventType: 'MORNING_CHECK',
      pointsDelta: 120,
      balanceAfter: 1240,
      title: '+120',
      description: 'Morning Check plus one AI question.',
      createdAt: new Date().toISOString(),
    },
  ],
  rewards: [
    {
      id: 'vip-1d',
      kind: 'vip_day',
      title: 'Redeem 1 VIP day',
      description: '1000 points unlocks one more VIP day.',
      costPoints: 1000,
      enabled: true,
    },
  ],
  predictions: [],
  rules: {
    vipRedeemPoints: 1000,
    referralRewardPoints: 200,
    defaultPredictionStake: 100,
  },
});

export const MY_SECTION_LIST = [
  'menu',
  'support',
  'help-center',
  'support-chats',
  'disclosures',
  'membership',
  'points',
  'prediction-games',
  'rewards',
  'security-privacy',
  'create-passkey',
  'change-password',
  'device-security',
  'devices',
  'profile-visibility',
  'blocking',
  'manage-data',
  'privacy-choices',
  'download-personal-data',
  'request-data-deletion',
  'privacy-policy',
  'points-history',
  'group:review',
  'group:system',
  'group:market',
  'group:settings',
];

export const initialData = {
  signals: [],
  evidence: {
    top_signals: [],
    source_status: 'INSUFFICIENT_DATA',
    data_status: 'INSUFFICIENT_DATA',
    asof: null,
    supporting_run_id: null,
  },
  performance: { records: [], last_updated: null, proof: { datasets: {} }, paper_timeline: [] },
  trades: [],
  velocity: {},
  config: {},
  market_modules: [],
  analytics: {},
  research: null,
  decision: null,
  today: null,
  safety: null,
  insights: null,
  ai: null,
  layers: {},
  control_plane: null,
};

export function buildTabMeta(locale) {
  const zh = locale?.startsWith('zh');
  return {
    today: { icon: 'today', label: zh ? '今日' : 'Today' },
    ai: { icon: 'nova', label: 'Ask Nova' },
    browse: { icon: 'browse', label: zh ? '发现' : 'Browse' },
    my: { icon: 'my', label: zh ? '我的' : 'My' },
  };
}

export function buildMenuTitles(locale) {
  const zh = locale?.startsWith('zh');
  return {
    menu: zh ? '菜单' : 'Menu',
    support: zh ? '支持' : 'Support',
    'help-center': zh ? '帮助中心' : 'Help Center',
    'support-chats': zh ? '支持会话' : 'Support Chats',
    disclosures: zh ? '披露与说明' : 'Disclosures',
    membership: zh ? '会员' : 'Membership',
    points: zh ? '积分中心' : 'Points Hub',
    'prediction-games': zh ? '预测游戏' : 'Prediction Games',
    rewards: zh ? '奖励 / 邀请好友' : 'Rewards / Invite Friends',
    'security-privacy': zh ? '安全与隐私' : 'Security & Privacy',
    'create-passkey': zh ? '创建通行密钥' : 'Create passkey',
    'change-password': zh ? '修改密码' : 'Change password',
    'device-security': zh ? '设备安全' : 'Device security',
    devices: zh ? '设备管理' : 'Devices',
    'profile-visibility': zh ? '资料可见性' : 'Profile visibility',
    blocking: zh ? '屏蔽名单' : 'Blocking',
    'manage-data': zh ? '管理你的数据' : 'Manage your data',
    'privacy-choices': zh ? '隐私选择' : 'Privacy choices',
    'download-personal-data': zh ? '下载个人数据' : 'Download personal data',
    'request-data-deletion': zh ? '请求删除数据' : 'Request data deletion',
    'privacy-policy': zh ? '隐私政策' : 'Privacy Policy',
    'points-history': zh ? '积分明细' : 'Points History',
    'group:review': zh ? '复盘' : 'Review',
    'group:system': zh ? '系统' : 'System',
    'group:market': zh ? '市场笔记' : 'Market Notes',
    'group:settings': zh ? '设置' : 'Settings',
    signals: zh ? '信号总览' : 'Signals',
    weekly: zh ? '周复盘' : 'Weekly Review',
    discipline: zh ? '纪律进度' : 'Discipline Progress',
    performance: zh ? '表现证明' : 'Performance',
    safety: zh ? '安全边界' : 'Safety',
    insights: zh ? '市场洞察' : 'Insights',
    data: zh ? '数据状态' : 'Data Status',
    learning: zh ? '学习飞轮' : 'Learning Loop',
    settings: zh ? '设置' : 'Settings',
    advanced: zh ? '高级' : 'Advanced',
  };
}
