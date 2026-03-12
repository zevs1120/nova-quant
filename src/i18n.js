const messages = {
  en: {
    app: {
      brand: 'Nova Quant',
      more: 'More',
      noData: '--',
      ai: 'AI',
      dataConnected: 'Data: Connected',
      dataDelayed: 'Data: Delayed',
      riskMode: 'Risk Mode',
      model: 'Model',
      userMode: 'Mode'
    },
    tabs: {
      signals: 'Today',
      holdings: 'Holdings',
      why: 'Why',
      weekly: 'Weekly',
      market: 'Insights',
      proof: 'Performance',
      risk: 'Safety',
      velocity: 'Velocity',
      research: 'Research'
    },
    mode: {
      beginner: 'Beginner',
      standard: 'Standard',
      advanced: 'Advanced'
    },
    common: {
      market: 'Market',
      assetClass: 'Asset',
      status: 'Status',
      sort: 'Sort',
      range: 'Range',
      newest: 'Newest',
      confidence: 'Confidence',
      all: 'All',
      lastUpdated: 'Last updated',
      copied: 'Copied',
      close: 'Close',
      on: 'ON',
      off: 'OFF',
      usStocks: 'US Stocks',
      options: 'Options',
      stocks: 'Stocks',
      crypto: 'Crypto',
      time: 'Time',
      symbol: 'Symbol',
      side: 'Side',
      entryExit: 'Entry / Exit',
      pnl: 'PnL',
      fees: 'Fees'
    },
    status: {
      NEW: 'New',
      PENDING: 'Pending',
      TRIGGERED: 'Triggered',
      CLOSED: 'Closed',
      EXPIRED: 'Expired',
      INVALIDATED: 'Invalidated'
    },
    direction: {
      LONG: 'Long',
      SHORT: 'Short'
    },
    confidenceBand: {
      high: 'High',
      medium: 'Medium',
      low: 'Low'
    },
    validity: {
      '24H': '24H',
      UNTIL_TRIGGERED: 'Until Triggered'
    },
    signals: {
      confShort: 'Conf',
      confN: 'Conf {value}/5',
      watchlistToggle: 'Toggle watchlist',
      noSignals: 'No {status} signals in {market}.',
      freshness: 'Freshness',
      expiresAt: 'Expires',
      executionSteps: 'Execution Steps',
      canITrade: 'Can I trade this?',
      paperExecute: 'Paper Execute',
      markDone: 'Mark as Done',
      eligibilityTitle: 'Eligibility Check',
      checkRisk: 'Risk profile allows it',
      checkTemp: 'Market temperature allows it',
      checkValidity: 'Signal validity',
      reducedSize: 'Execute with reduced size',
      normalSize: 'Normal sizing allowed',
      invalidNow: 'Expired or invalidated',
      validNow: 'Valid',
      executionChecklist: 'Execution Checklist',
      strategyDeckTitle: 'Strategy Deck',
      strategyDeckSub: '{strategies} strategy templates online · {active} active opportunities',
      coveredStrategies: 'Strategies',
      activeSignals: 'Active',
      totalSignals: 'Total',
      activeCount: 'Active {active}/{total}',
      avgConf: 'Avg conf {value}',
      todayOpportunityTitle: 'Today Opportunity Stack',
      todayOpportunitySub: '{count} cards ranked by readiness and confidence',
      backToSignals: 'Back to Signals',
      detailTitle: 'Signal Detail',
      entryZone: 'Entry zone',
      stopLoss: 'Stop loss',
      takeProfit: 'Take profit',
      positionSize: 'Position size',
      positionSizeValue: '{value}% of equity',
      validity: 'Validity / TIF',
      modelVersion: 'Model version',
      signalId: 'Signal ID',
      rationale: 'Rationale',
      copyParams: 'Copy order params',
      shareLink: 'Share link',
      shareTitle: 'Signal {symbol}',
      assetPayload: 'Asset payload',
      optionContract: 'Option contract',
      stockHorizon: 'Stock horizon',
      cryptoFundingBasis: 'Funding / Basis',
      funnelRegime: 'Filtered(Regime)',
      funnelRisk: 'Filtered(Risk)',
      funnelConflict: 'Filtered(Conflict)',
      funnelExecutable: 'Executable',
      funnelFilled: 'Filled',
      funnelRoundTrip: 'Round trip',
      noTradeTopN: 'No-Trade Reason Top N',
      shadowLogTitle: 'Shadow Opportunity Log',
      shadowLogSub: 'Near-miss opportunities used for threshold debugging.',
      shadowLogEmpty: 'No near-miss shadow opportunities in current window.'
    },
    proof: {
      winRate: 'Win Rate',
      avgRR: 'Avg R:R',
      maxDD: 'Max DD',
      totalReturn: 'Total Return',
      backtestVsLive: 'Backtest vs Live / Paper',
      methodology: 'Methodology',
      fees: 'Fees',
      slippage: 'Slippage',
      funding: 'Funding',
      leverage: 'Leverage',
      recentTrades: 'Recent Trades',
      downloadCsv: 'Download CSV',
      downloadPdf: 'Download PDF',
      chartBacktest: 'Backtest',
      chartLive: 'Live / Paper',
      paperTimeline: 'Paper Trading Status Timeline',
      paperTimelineSub: 'Execution sync and control actions for trust and auditability.',
      sampleSize: 'Sample size',
      livePaperLabel: 'Live/Paper label',
      costAssumptions: 'Cost assumptions',
      attribution: 'Attribution',
      byStrategy: 'By strategy',
      byRegime: 'By regime',
      deviation: 'Deviation'
    },
    paperStatus: {
      SYNCED: 'Synced',
      RUNNING: 'Running',
      DERISKED: 'De-risked',
      PAUSED: 'Paused',
      RECOVERED: 'Recovered'
    },
    risk: {
      rules: 'Risk Rules',
      perTrade: 'Per-trade risk limit',
      perTradeValue: 'Max {value}% loss per trade',
      dailyLoss: 'Daily loss limit',
      dailyLossValue: 'Stop trading at {value}%',
      maxDD: 'Max drawdown limit',
      maxDDValue: 'Pause/reduce at {value}%',
      volSwitch: 'Volatility switch',
      status: 'Risk Status',
      tradingToday: 'Trading status today',
      currentLevel: 'Current risk level',
      lastEvent: 'Last event',
      todayLossProgress: 'Today loss progress',
      todayPnl: 'Today PnL',
      drawdownProgress: 'Drawdown progress',
      currentBucket: 'Current risk bucket',
      explain: 'Explain',
      level: {
        LOW: 'Low',
        MEDIUM: 'Medium',
        HIGH: 'High'
      }
    },
    velocity: {
      current: 'Current Velocity',
      percentile: 'Percentile',
      similarStats: 'Similar Event Stats',
      events: 'Events',
      upProb: 'Next 7D Up Prob.',
      avgMove: 'Avg Move',
      avgDD: 'Avg Drawdown',
      howUsed: 'How We Use It',
      systemStance: 'System stance today',
      stanceRiskOn: 'Risk-on bias, follow trend entries.',
      stanceNeutral: 'Neutral stance, selective execution.',
      stanceRiskOff: 'Risk-off stance, reduced risk bucket.',
      sampleSize: 'Sample size',
      assumptions: 'Assumptions',
      assumptionText: 'Fees/slippage/funding assumptions included.',
      whyRiskReduced: 'Why risk reduced?',
      regime: {
        RISK_ON: 'Risk-On',
        NEUTRAL: 'Neutral',
        RISK_OFF: 'Risk-Off'
      }
    },
    market: {
      bigData: 'Market Big Data Modules',
      cryptoDash: 'Crypto Dashboard',
      fundingBasis: 'Funding & Basis State',
      sentimentRegime: 'Sentiment / Regime',
      exchangeHealth: 'Exchange Health',
      carryFavorable: 'Carry-favorable'
    },
    onboarding: {
      title: 'Quick Setup',
      step: 'Step {n} of 3',
      next: 'Next',
      back: 'Back',
      finish: 'Start',
      pickWatchlist: 'Pick your starter watchlist',
      profile: {
        conservative: 'Conservative',
        balanced: 'Balanced',
        aggressive: 'Aggressive'
      }
    },
    about: {
      title: 'About & Compliance',
      team: 'Team',
      appVersion: 'App Version',
      dataUpdated: 'Data Last Updated',
      disclaimer:
        'This is a signal & execution tool, not asset management. Funds remain in the user\'s own brokerage/exchange account (non-custodial).'
    },
    chat: {
      title: 'Nova Quant Coach',
      open: 'AI Coach',
      close: 'Close',
      send: 'Send',
      sending: '...',
      thinking: 'Thinking...',
      placeholder: 'Ask about strategy, risk, execution...',
      emptyHint: 'Ask any quant/market question. Works even without your private signal data.',
      errorPrefix: 'Unable to complete:',
      errorFallback: 'Network issue, please try again.',
      quick: {
        explain: 'Explain',
        execute: 'How to execute',
        risk: 'Risk check'
      },
      prompt: {
        explain: 'Explain this signal for {symbol} in plain English.',
        execute: 'How should I execute this signal for {symbol} step by step?',
        risk: 'Do a risk check for this {symbol} signal and tell me when not to trade.'
      },
      suggest: {
        quantBasics: 'What is a good quant workflow?',
        riskSizing: 'How should I size positions?',
        executeChecklist: 'Give me a pre-trade checklist.'
      }
    },
    ai: {
      brand: 'Nova Quant AI',
      title: 'Assistant Cockpit',
      back: 'Back',
      empty: 'Ask for signal execution, risk checks, or market interpretation.',
      emptySub: 'When exact context is missing, you will still get general quant guidance.',
      inputPlaceholder: 'Ask with context-aware intent...',
      contextTitle: 'Context Panel',
      timeframe: 'Timeframe',
      riskBucket: 'Risk bucket',
      tempPct: 'Temperature %ile',
      volPct: 'Volatility %ile',
      keyParams: 'Key Params',
      profile: 'Risk profile',
      quick: {
        explainSignal: 'Explain this signal',
        execute: 'How do I execute?',
        failureModes: 'What can go wrong?',
        adjustRisk: 'Adjust for my risk profile',
        summary3: 'Summarize in 3 steps'
      },
      quickOpt: {
        explainContract: 'Explain contract',
        entryStopTp: 'Entry/Stop/TP',
        eodPlan: 'EOD exit plan'
      },
      quickCr: {
        explainFunding: 'Explain funding/basis state',
        squeezeRisk: 'Risk of squeeze',
        executionTips: 'Execution tips'
      },
      quickSt: {
        horizonPlan: 'Horizon plan',
        catalystRisk: 'Catalyst risk',
        positionSizing: 'Position sizing'
      },
      quickDefault: {
        whatMeans: 'What does this mean?',
        howExecute: 'How to execute?',
        whenNotTrade: 'When NOT to trade?',
        whyRiskReduced: 'Why risk reduced?'
      }
    }
  },
  zh: {
    app: {
      brand: 'Nova Quant',
      more: '更多',
      noData: '--',
      ai: 'AI',
      dataConnected: '数据: 已连接',
      dataDelayed: '数据: 延迟',
      riskMode: '风险模式',
      model: '模型',
      userMode: '模式'
    },
    tabs: {
      signals: '今日',
      holdings: '持仓',
      why: '解释',
      weekly: '周复盘',
      market: '洞察',
      proof: '绩效',
      risk: '安全',
      velocity: '速度',
      research: '研究'
    },
    mode: {
      beginner: '新手',
      standard: '标准',
      advanced: '进阶'
    },
    common: {
      market: '市场',
      assetClass: '资产',
      status: '状态',
      sort: '排序',
      range: '区间',
      newest: '最新',
      confidence: '置信度',
      all: '全部',
      lastUpdated: '更新时间',
      copied: '已复制',
      close: '关闭',
      on: '开启',
      off: '关闭',
      usStocks: '美股',
      options: '期权',
      stocks: '股票',
      crypto: '加密',
      time: '时间',
      symbol: '标的',
      side: '方向',
      entryExit: '开仓 / 平仓',
      pnl: '收益',
      fees: '费用'
    },
    status: {
      NEW: '新信号',
      PENDING: '待触发',
      TRIGGERED: '已触发',
      CLOSED: '已平仓',
      EXPIRED: '已过期',
      INVALIDATED: '已失效'
    },
    direction: {
      LONG: '做多',
      SHORT: '做空'
    },
    confidenceBand: {
      high: '高',
      medium: '中',
      low: '低'
    },
    validity: {
      '24H': '24小时',
      UNTIL_TRIGGERED: '直到触发'
    },
    signals: {
      confShort: '置信',
      confN: '置信 {value}/5',
      watchlistToggle: '切换自选',
      noSignals: '{market}暂无{status}信号。',
      freshness: '新鲜度',
      expiresAt: '失效时间',
      executionSteps: '执行步骤',
      canITrade: '我现在能做吗？',
      paperExecute: '模拟执行',
      markDone: '标记已执行',
      eligibilityTitle: '可交易性检查',
      checkRisk: '风控额度是否允许',
      checkTemp: '市场温度是否允许',
      checkValidity: '信号是否有效',
      reducedSize: '降仓执行',
      normalSize: '可按常规仓位执行',
      invalidNow: '已过期或失效',
      validNow: '当前有效',
      executionChecklist: '执行清单',
      strategyDeckTitle: '策略矩阵',
      strategyDeckSub: '已上线 {strategies} 套策略模板 · 当前可执行机会 {active} 条',
      coveredStrategies: '策略数',
      activeSignals: '活跃',
      totalSignals: '总信号',
      activeCount: '活跃 {active}/{total}',
      avgConf: '平均置信 {value}',
      todayOpportunityTitle: '今日机会堆栈',
      todayOpportunitySub: '按可执行度与置信度排序，共 {count} 张行动卡',
      backToSignals: '返回信号列表',
      detailTitle: '信号详情',
      entryZone: '入场区间',
      stopLoss: '止损',
      takeProfit: '止盈',
      positionSize: '建议仓位',
      positionSizeValue: '权益的 {value}%',
      validity: '有效期 / TIF',
      modelVersion: '模型版本',
      signalId: '信号 ID',
      rationale: '策略理由',
      copyParams: '复制下单参数',
      shareLink: '分享链接',
      shareTitle: '信号 {symbol}',
      assetPayload: '资产载荷',
      optionContract: '期权合约',
      stockHorizon: '股票周期',
      cryptoFundingBasis: '资金费率 / 基差',
      funnelRegime: 'Regime过滤',
      funnelRisk: '风控过滤',
      funnelConflict: '冲突过滤',
      funnelExecutable: '可执行',
      funnelFilled: '已成交',
      funnelRoundTrip: '已完成闭环',
      noTradeTopN: '不交易原因 Top N',
      shadowLogTitle: '影子机会日志',
      shadowLogSub: '用于阈值调优的近失机会追踪。',
      shadowLogEmpty: '当前窗口暂无近失影子机会。'
    },
    proof: {
      winRate: '胜率',
      avgRR: '平均盈亏比',
      maxDD: '最大回撤',
      totalReturn: '总收益',
      backtestVsLive: '回测 vs 实盘/模拟',
      methodology: '方法假设',
      fees: '手续费',
      slippage: '滑点',
      funding: '资金费率',
      leverage: '杠杆',
      recentTrades: '近期交易',
      downloadCsv: '下载 CSV',
      downloadPdf: '下载 PDF',
      chartBacktest: '回测',
      chartLive: '实盘/模拟',
      paperTimeline: '模拟盘状态时间线',
      paperTimelineSub: '展示执行同步和风控动作，增强可审计性。',
      sampleSize: '样本量',
      livePaperLabel: '实盘/模拟标签',
      costAssumptions: '成本假设',
      attribution: '归因分析',
      byStrategy: '按策略',
      byRegime: '按状态',
      deviation: '偏差'
    },
    paperStatus: {
      SYNCED: '已同步',
      RUNNING: '运行中',
      DERISKED: '已降风险',
      PAUSED: '已暂停',
      RECOVERED: '已恢复'
    },
    risk: {
      rules: '风控规则',
      perTrade: '单笔风险上限',
      perTradeValue: '单笔最大亏损 {value}%',
      dailyLoss: '日内亏损上限',
      dailyLossValue: '达到 {value}% 停止交易',
      maxDD: '回撤上限',
      maxDDValue: '达到 {value}% 降仓或暂停',
      volSwitch: '波动开关',
      status: '风控状态',
      tradingToday: '今日交易状态',
      currentLevel: '当前风险级别',
      lastEvent: '最近事件',
      todayLossProgress: '今日亏损进度',
      todayPnl: '今日盈亏',
      drawdownProgress: '当前回撤进度',
      currentBucket: '当前风险桶',
      explain: '解释',
      level: {
        LOW: '低',
        MEDIUM: '中',
        HIGH: '高'
      }
    },
    velocity: {
      current: '当前速度值',
      percentile: '历史分位',
      similarStats: '相似事件统计',
      events: '事件数',
      upProb: '未来7天上涨概率',
      avgMove: '平均涨跌幅',
      avgDD: '平均回撤',
      howUsed: '如何使用',
      systemStance: '今日系统立场',
      stanceRiskOn: '偏风险，顺势参与。',
      stanceNeutral: '中性，择优执行。',
      stanceRiskOff: '避险，降低风险桶。',
      sampleSize: '样本量',
      assumptions: '假设',
      assumptionText: '已计入手续费/滑点/资金费率假设。',
      whyRiskReduced: '为什么降风险？',
      regime: {
        RISK_ON: '偏风险',
        NEUTRAL: '中性',
        RISK_OFF: '避险'
      }
    },
    market: {
      bigData: '市场大数据模块',
      cryptoDash: '加密市场仪表盘',
      fundingBasis: '资金费率与基差状态',
      sentimentRegime: '情绪 / Regime',
      exchangeHealth: '交易所健康度',
      carryFavorable: 'Carry 友好'
    },
    onboarding: {
      title: '快速设置',
      step: '第 {n} / 3 步',
      next: '下一步',
      back: '上一步',
      finish: '开始使用',
      pickWatchlist: '选择你的初始自选池',
      profile: {
        conservative: '保守型',
        balanced: '均衡型',
        aggressive: '进取型'
      }
    },
    about: {
      title: '关于与合规',
      team: '团队',
      appVersion: '应用版本',
      dataUpdated: '数据更新时间',
      disclaimer:
        '本工具为信号与执行辅助，不属于资产管理。资金始终保留在用户本人券商/交易所账户（非托管）。'
    },
    chat: {
      title: 'Nova Quant 助手',
      open: 'AI 助手',
      close: '关闭',
      send: '发送',
      sending: '...',
      thinking: '思考中...',
      placeholder: '可提问策略、风控、执行...',
      emptyHint: '你可以直接问量化和市场问题，即使没有私有信号数据也可回答。',
      errorPrefix: '请求失败：',
      errorFallback: '网络异常，请稍后重试。',
      quick: {
        explain: '解释信号',
        execute: '如何执行',
        risk: '风险检查'
      },
      prompt: {
        explain: '请用通俗语言解释一下 {symbol} 这个信号。',
        execute: '请给我 {symbol} 这个信号的分步执行方法。',
        risk: '请对 {symbol} 这个信号做风险检查，并告诉我什么情况下不该交易。'
      },
      suggest: {
        quantBasics: '一个好的量化交易流程是什么？',
        riskSizing: '仓位应该怎么分配？',
        executeChecklist: '给我一份交易前检查清单。'
      }
    },
    ai: {
      brand: 'Nova Quant AI',
      title: '助手驾驶舱',
      back: '返回',
      empty: '你可以问信号解释、执行步骤、风控判断。',
      emptySub: '若缺少内部数据，会自动给你通用量化建议。',
      inputPlaceholder: '输入你的问题（支持上下文）...',
      contextTitle: '上下文面板',
      timeframe: '周期',
      riskBucket: '风险桶',
      tempPct: '温度分位',
      volPct: '波动分位',
      keyParams: '关键参数',
      profile: '风险画像',
      quick: {
        explainSignal: '解释这个信号',
        execute: '怎么执行',
        failureModes: '可能失败在哪里',
        adjustRisk: '按我的风险级别调整',
        summary3: '3 步总结'
      },
      quickOpt: {
        explainContract: '解释合约',
        entryStopTp: '入场/止损/止盈',
        eodPlan: '收盘退出计划'
      },
      quickCr: {
        explainFunding: '解释资金费率/基差',
        squeezeRisk: '挤压风险',
        executionTips: '执行建议'
      },
      quickSt: {
        horizonPlan: '持有周期计划',
        catalystRisk: '催化风险',
        positionSizing: '仓位建议'
      },
      quickDefault: {
        whatMeans: '这是什么意思？',
        howExecute: '怎么执行？',
        whenNotTrade: '什么时候不该做？',
        whyRiskReduced: '为什么降风险？'
      }
    }
  }
};

function getByPath(obj, path) {
  return path.split('.').reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part];
    }
    return undefined;
  }, obj);
}

function applyVars(template, vars) {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template
  );
}

export function createTranslator(lang = 'en') {
  const pack = messages[lang] ?? messages.en;

  return (key, vars, fallback = '') => {
    const value = getByPath(pack, key) ?? getByPath(messages.en, key);
    if (typeof value !== 'string') {
      return fallback || key;
    }
    return applyVars(value, vars);
  };
}

export function getLocale(lang) {
  return lang === 'zh' ? 'zh-CN' : 'en-US';
}

export function getDefaultLang() {
  if (typeof window === 'undefined') return 'en';
  return window.navigator.language?.toLowerCase().includes('zh') ? 'zh' : 'en';
}
