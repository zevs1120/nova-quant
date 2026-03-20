import type { ChatContextInput, ChatHistoryMessage, ChatMode, ToolContextBundle } from './types.js';
import { getAssistantVoiceGuide, getBrandVoiceConstitution } from '../../copy/novaCopySystem.js';
import { getAssistantDisclaimer, getAssistantSectionLabels } from '../../utils/assistantLanguage.js';

function line(value: unknown): string {
  return String(value ?? '').trim();
}

function compactJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function formatSignalCards(signalCards: unknown[]): string[] {
  return signalCards
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map((row) => {
      const symbol = line(row.symbol || '--');
      const direction = line(row.direction || 'WAIT');
      const confidence = Number(row.confidence ?? row.conviction ?? 0);
      const grade = line(row.grade || '--');
      const entryLow = line((row.entry_zone as Record<string, unknown> | undefined)?.low ?? row.entry_min ?? '--');
      const entryHigh = line((row.entry_zone as Record<string, unknown> | undefined)?.high ?? row.entry_max ?? '--');
      const status = line(row.data_status || row.source_label || row.source_status || 'INSUFFICIENT_DATA');
      return `- ${symbol} ${direction} | conf ${confidence.toFixed(0)} | grade ${grade} | entry ${entryLow}-${entryHigh} | status ${status}`;
    })
    .slice(0, 5);
}

function formatSignalDetail(signalDetail: Record<string, unknown> | null): string[] {
  if (!signalDetail) return ['- none'];
  const entryZone = (signalDetail.entry_zone as Record<string, unknown> | undefined) || {};
  const stopLoss = (signalDetail.stop_loss as Record<string, unknown> | undefined) || {};
  return [
    `- symbol ${line(signalDetail.symbol)} ${line(signalDetail.direction || 'WAIT')}`,
    `- confidence ${String(signalDetail.confidence ?? '--')}, strategy ${line(signalDetail.strategy_id || signalDetail.strategy_family || '--')}`,
    `- entry ${line(entryZone.low ?? signalDetail.entry_min ?? '--')} to ${line(entryZone.high ?? signalDetail.entry_max ?? '--')}`,
    `- stop ${line(stopLoss.price ?? signalDetail.stop_loss ?? '--')}, invalidation ${line(signalDetail.invalidation_level ?? '--')}`
  ];
}

function formatPerformanceSummary(performanceSummary: Record<string, unknown> | null): string[] {
  const firstRecord = (performanceSummary?.records as Array<Record<string, unknown>> | undefined)?.[0];
  const overall = firstRecord?.overall as Record<string, unknown> | undefined;
  if (!overall) return ['- unavailable'];
  return [
    `- source ${line(overall.source_label || '--')} | sample ${line(overall.sample_size || '--')}`,
    `- return ${line(overall.net_return ?? overall.total_return ?? '--')} | dd ${line(overall.max_drawdown ?? '--')}`,
    `- sharpe ${line(overall.sharpe ?? '--')} | turnover ${line(overall.turnover ?? '--')}`
  ];
}

function formatHistory(history: ChatHistoryMessage[]): string[] {
  return history.slice(-6).map((item) => `- ${item.role.toUpperCase()}: ${item.content.slice(0, 280)}`);
}

function formatResearchTools(bundle: ToolContextBundle): string[] {
  return (bundle.researchContext?.tool_results || []).map((row) => {
    const payload = compactJson(row.payload);
    return `- ${row.tool} | source ${row.source_status} | data ${row.data_status} | ${payload.slice(0, 900)}`;
  });
}

function formatDecisionSummary(context: ChatContextInput | undefined): string[] {
  if (!context?.decisionSummary) return ['- unavailable'];
  return [
    `- today call ${line(context.decisionSummary.today_call || '--')}`,
    `- risk posture ${line(context.decisionSummary.risk_posture || '--')}`,
    `- top action ${line(context.decisionSummary.top_action_label || '--')} ${line(context.decisionSummary.top_action_symbol || '')}`.trim(),
    `- transparency ${line(context.decisionSummary.source_status || '--')} / ${line(context.decisionSummary.data_status || '--')}`
  ];
}

function formatHoldingsSummary(context: ChatContextInput | undefined): string[] {
  if (!context?.holdingsSummary) return ['- unavailable'];
  return [
    `- holdings ${line(context.holdingsSummary.holdings_count || '--')} | total weight ${line(context.holdingsSummary.total_weight_pct || '--')}`,
    `- aligned ${line(context.holdingsSummary.aligned_weight_pct || '--')} | unsupported ${line(context.holdingsSummary.unsupported_weight_pct || '--')}`,
    `- top1 ${line(context.holdingsSummary.top1_pct || '--')} | risk ${line(context.holdingsSummary.risk_level || '--')}`,
    `- recommendation ${line(context.holdingsSummary.recommendation || '--')}`
  ];
}

function formatEngagementSummary(context: ChatContextInput | undefined): string[] {
  if (!context?.engagementSummary) return ['- unavailable'];
  return [
    `- locale ${line(context.engagementSummary.locale || context.locale || '--')}`,
    `- morning check ${line(context.engagementSummary.morning_check_status || '--')} | ${line(context.engagementSummary.morning_check_label || '--')}`,
    `- ritual ${line(context.engagementSummary.morning_check_arrival || '--')} | ${line(context.engagementSummary.morning_check_ritual || '--')}`,
    `- perception ${line(context.engagementSummary.perception_status || '--')} | ${line(context.engagementSummary.perception_headline || '--')}`,
    `- perception focus ${line(context.engagementSummary.perception_focus || '--')} | ${line(context.engagementSummary.perception_confirmation || '--')}`,
    `- wrap-up ready ${String(Boolean(context.engagementSummary.wrap_up_ready))} | completed ${String(Boolean(context.engagementSummary.wrap_up_completed))}`,
    `- wrap tone ${line(context.engagementSummary.wrap_up_line || '--')}`,
    `- discipline ${line(context.engagementSummary.discipline_score || '--')} | quality ${line(context.engagementSummary.behavior_quality || '--')}`,
    `- recommendation change ${line(context.engagementSummary.recommendation_change || '--')}`,
    `- ui tone ${line(context.engagementSummary.ui_tone || '--')}`
  ];
}

export function buildSystemPrompt(mode: ChatMode, exactSignalData: boolean, replyLanguage = 'en'): string {
  const language = String(replyLanguage || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const labels = getAssistantSectionLabels(language);
  const disclaimer = getAssistantDisclaimer(language);
  const constitution = getBrandVoiceConstitution(language);
  const assistantTone = getAssistantVoiceGuide({ locale: language, posture: 'WAIT', userState: 'default' });
  const modeLine =
    mode === 'research-assistant'
      ? language === 'zh'
        ? '模式：研究助手。以 AI 原生量化研究助手的方式工作，优先考虑因子逻辑、验证质量、市场状态、实现真实性，以及下一步研究流程。'
        : 'Mode: Research Assistant. Behave like an AI-native quant research assistant. Prioritize factor logic, validation quality, regime context, implementation realism, and what should happen next in the research workflow.'
      : mode === 'context-aware'
        ? language === 'zh'
          ? '模式：上下文感知。优先使用与当前信号、页面、市场和用户上下文直接相关的证据。'
          : 'Mode: Context-Aware. Prioritize evidence tied to the requested signal, page, market, and user context.'
        : language === 'zh'
          ? '模式：通用教练。可以利用产品上下文，但解释必须对新手安全、实用。'
          : 'Mode: General Coach. Use product context when useful, but keep explanations beginner-safe and practical.';

  const missingSignalInstruction =
    mode === 'context-aware' && !exactSignalData
      ? language === 'zh'
        ? '如果缺少精确信号细节，要明确说出来，并降级为通用指导，不要假装有数据。'
        : 'If exact signal detail is missing, say so clearly and downgrade to general guidance instead of pretending.'
      : language === 'zh'
        ? '如果存在精确信号细节，要先锚定在这些事实上回答。'
        : 'If exact signal detail exists, anchor the answer to it first.';

  return [
    language === 'zh' ? '你是 Nova Quant 的 Nova Assistant。' : 'You are Nova Assistant for Nova Quant.',
    modeLine,
    missingSignalInstruction,
    language === 'zh'
      ? '你必须证据感知、诚实、对新手友好，并且有明确行动导向。'
      : 'You are evidence-aware, honest, beginner-friendly, and action-oriented.',
    language === 'zh' ? `品牌设定：${constitution.identity}` : `Brand constitution: ${constitution.identity}`,
    language === 'zh'
      ? `语气原则：${constitution.principles.join(' | ')}`
      : `Voice principles: ${constitution.principles.join(' | ')}`,
    language === 'zh' ? `开场参考：${assistantTone.opener}` : `Assistant opener reference: ${assistantTone.opener}`,
    language === 'zh'
      ? `风险表达参考：${assistantTone.risk_explain}`
      : `Risk explanation reference: ${assistantTone.risk_explain}`,
    language === 'zh'
      ? `冲动拦截参考：${assistantTone.intercept}`
      : `Impulse interception reference: ${assistantTone.intercept}`,
    language === 'zh'
      ? '语气要冷静、锋利、克制，略带生命感。可以有一点干冷幽默，但不能卖弄、卖货、戏剧化或煽动交易。'
      : 'Your tone is calm, sharp, restrained, and a little alive. You may use a small amount of dry wit, but never become cute, salesy, theatrical, or sales-driven.',
    language === 'zh'
      ? '当风险较高时，要像是在保护用户避免无意义动作；当最优解是不动时，要让这种不动显得有判断力，而不是空话。'
      : 'When risk is high, sound like you are protecting the user from unnecessary action. When no action is best, make that feel deliberate and intelligent, not empty.',
    language === 'zh'
      ? '如果证据不支持，绝不能假装存在实盘交易、券商连通性或已实现业绩。'
      : 'Never pretend live trading, broker connectivity, or realized performance exists when the evidence says otherwise.',
    language === 'zh'
      ? '如果数据是模拟、断连、保留或不足，要直接说清楚。'
      : 'If data is simulated, disconnected, withheld, or insufficient, say that plainly.',
    language === 'zh'
      ? '输出协议（必须遵守）：只能使用以下中文标题，并严格按这个顺序输出：'
      : 'Output protocol (MANDATORY): use these exact section headers in uppercase and this exact order:',
    `${labels.VERDICT}:`,
    `${labels.PLAN}:`,
    `${labels.WHY}:`,
    `${labels.RISK}:`,
    `${labels.EVIDENCE}:`,
    language === 'zh' ? '格式规则：' : 'Formatting rules:',
    language === 'zh' ? `- ${labels.VERDICT}：只能写一行短句。` : '- VERDICT: one short line only.',
    mode === 'research-assistant'
      ? language === 'zh'
        ? `- ${labels.PLAN}：3-5 条简洁要点。必须包含下一步研究动作，以及是否值得进入回测 / replay / 模拟盘。`
        : '- PLAN: 3-5 concise bullets. Include the next research action and whether it is worthy of backtest / replay / paper.'
      : language === 'zh'
        ? `- ${labels.PLAN}：3-5 条简洁要点。必须包含下一步动作、风险边界和仓位想法。`
        : '- PLAN: 3-5 concise bullets. Include what to do next, risk boundary, and position size idea.',
    mode === 'research-assistant'
      ? language === 'zh'
        ? `- ${labels.WHY}：严格 3 条，聚焦因子、市场状态匹配、验证质量或组合/执行真实性。`
        : '- WHY: exactly 3 bullets focused on factors, regime fit, validation quality, or portfolio/execution realism.'
      : language === 'zh'
        ? `- ${labels.WHY}：严格 3 条，用通俗语言解释。`
        : '- WHY: exactly 3 bullets in plain language.',
    language === 'zh'
      ? `- ${labels.RISK}：2 条风险提示，再加 1 条明确写出“常见失效模式 / 什么情况下不要做”。`
      : '- RISK: 2 bullets + 1 explicit line that says "Common failure modes / when NOT to trade".',
    language === 'zh'
      ? `- ${labels.EVIDENCE}：只能写上下文里真实存在的紧凑事实。`
      : '- EVIDENCE: only compact facts that are actually present in context.',
    language === 'zh' ? '- 保持适合手机阅读，不要倾倒原始 JSON。' : '- Keep it mobile-friendly and do not dump raw JSON.',
    language === 'zh' ? '安全规则：' : 'Safety rules:',
    language === 'zh'
      ? '- 不要编造业绩、成交、实盘券商权限或隐藏数据。'
      : '- Do not fabricate performance, fills, live broker access, or hidden data.',
    language === 'zh'
      ? '- 与其猜，不如明确说“我没有足够干净的数据”。'
      : '- Prefer "I do not have enough clean data" over guessing.',
    language === 'zh'
      ? `- 禁止语言包括：${constitution.banned_phrases.join('，')}。`
      : `- Forbidden language includes: ${constitution.banned_phrases.join(', ')}.`,
    mode === 'research-assistant'
      ? language === 'zh'
        ? '- 当因子层面的真实结果不可用时，要明确区分知识分类与测量证据。\n- 优先使用有经济逻辑支撑的因子解释，而不是散户式技术指标堆砌。\n- 让风控与执行真实性优先于追逐收益。\n- 除非证据明确显示支持，否则不要暗示商品期货 runtime 已可用。'
        : '- When factor-level realized data is unavailable, explicitly separate taxonomy knowledge from measured evidence.\n- Prefer economically grounded factor logic over retail technical indicators.\n- Keep risk control and implementation realism ahead of return-chasing.\n- Do not imply commodity futures runtime support unless the evidence explicitly shows it.'
      : language === 'zh'
        ? '- 解释要务实，且始终基于证据。'
        : '- Keep explanations practical and evidence-aware.',
    language === 'zh'
      ? `- 必须以这句结尾："${disclaimer}"。`
      : `- End with the exact phrase: "${disclaimer}".`
  ].join('\n');
}

export function buildUserPrompt(input: {
  userMessage: string;
  mode: ChatMode;
  contextBundle: ToolContextBundle;
  context: ChatContextInput | undefined;
  history: ChatHistoryMessage[];
}): string {
  const sections = [
    `USER REQUEST\n${input.userMessage}`,
    `PAGE / TASK CONTEXT\n${compactJson(input.context || {}) || '{}'}`,
    `RECENT THREAD MEMORY\n${formatHistory(input.history).join('\n') || '- none'}`,
    `EXACT SIGNAL DETAIL\n${formatSignalDetail(input.contextBundle.signalDetail).join('\n')}`,
    `TOP RELEVANT SIGNALS\n${formatSignalCards(input.contextBundle.signalCards).join('\n') || '- none'}`,
    `MARKET / RISK SNAPSHOT\n- market ${line(input.contextBundle.marketTemperature?.regime_id || input.contextBundle.marketTemperature?.stance || '--')}\n- risk ${line(input.contextBundle.riskProfile?.profile_key || '--')}\n- status ${input.contextBundle.statusSummary.join(' | ')}`,
    `DECISION SNAPSHOT\n${formatDecisionSummary(input.context).join('\n')}`,
    `HOLDINGS SUMMARY\n${formatHoldingsSummary(input.context).join('\n')}`,
    `ENGAGEMENT RHYTHM\n${formatEngagementSummary(input.context).join('\n')}`,
    `PERFORMANCE SUMMARY\n${formatPerformanceSummary(input.contextBundle.performanceSummary).join('\n')}`,
    `DETERMINISTIC GUIDANCE TOOL\n${line(input.contextBundle.deterministicGuide?.text || 'unavailable')}`,
    `RESEARCH TOOLS\n${formatResearchTools(input.contextBundle).join('\n') || '- none'}`,
    `PRIORITIZED EVIDENCE\n${input.contextBundle.selectedEvidence.map((item) => `- ${item}`).join('\n') || '- none'}`,
    `SOURCE TRANSPARENCY\n${compactJson(input.contextBundle.sourceTransparency)}`,
    `RESEARCH MODE\n${input.contextBundle.researchContext?.research_mode ? 'yes' : 'no'} | tools ${input.contextBundle.researchContext?.selected_tools?.join(', ') || 'none'}`,
    `EXACT SIGNAL DATA AVAILABLE\n${input.contextBundle.hasExactSignalData ? 'yes' : 'no'}`
  ];

  return sections.join('\n\n');
}
