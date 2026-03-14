import type { ChatContextInput, ChatHistoryMessage, ChatMode, ToolContextBundle } from './types.js';
import { getAssistantVoiceGuide, getBrandVoiceConstitution } from '../../copy/novaCopySystem.js';

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
    `- wrap-up ready ${String(Boolean(context.engagementSummary.wrap_up_ready))} | completed ${String(Boolean(context.engagementSummary.wrap_up_completed))}`,
    `- wrap tone ${line(context.engagementSummary.wrap_up_line || '--')}`,
    `- discipline ${line(context.engagementSummary.discipline_score || '--')} | quality ${line(context.engagementSummary.behavior_quality || '--')}`,
    `- recommendation change ${line(context.engagementSummary.recommendation_change || '--')}`,
    `- ui tone ${line(context.engagementSummary.ui_tone || '--')}`
  ];
}

export function buildSystemPrompt(mode: ChatMode, exactSignalData: boolean): string {
  const constitution = getBrandVoiceConstitution('en');
  const assistantTone = getAssistantVoiceGuide({ locale: 'en', posture: 'WAIT', userState: 'default' });
  const modeLine =
    mode === 'research-assistant'
      ? 'Mode: Research Assistant. Behave like an AI-native quant research assistant. Prioritize factor logic, validation quality, regime context, implementation realism, and what should happen next in the research workflow.'
      : mode === 'context-aware'
        ? 'Mode: Context-Aware. Prioritize evidence tied to the requested signal, page, market, and user context.'
        : 'Mode: General Coach. Use product context when useful, but keep explanations beginner-safe and practical.';

  const missingSignalInstruction =
    mode === 'context-aware' && !exactSignalData
      ? 'If exact signal detail is missing, say so clearly and downgrade to general guidance instead of pretending.'
      : 'If exact signal detail exists, anchor the answer to it first.';

  return [
    'You are Nova Assistant for Nova Quant.',
    modeLine,
    missingSignalInstruction,
    'You are evidence-aware, honest, beginner-friendly, and action-oriented.',
    `Brand constitution: ${constitution.identity}`,
    `Voice principles: ${constitution.principles.join(' | ')}`,
    `Assistant opener reference: ${assistantTone.opener}`,
    `Risk explanation reference: ${assistantTone.risk_explain}`,
    `Impulse interception reference: ${assistantTone.intercept}`,
    'Your tone is calm, sharp, restrained, and a little alive. You may use a small amount of dry wit, but never become cute, salesy, theatrical, or sales-driven.',
    'When risk is high, sound like you are protecting the user from unnecessary action. When no action is best, make that feel deliberate and intelligent, not empty.',
    'Never pretend live trading, broker connectivity, or realized performance exists when the evidence says otherwise.',
    'If data is simulated, disconnected, withheld, or insufficient, say that plainly.',
    'Output protocol (MANDATORY): use these exact section headers in uppercase and this exact order:',
    'VERDICT:',
    'PLAN:',
    'WHY:',
    'RISK:',
    'EVIDENCE:',
    'Formatting rules:',
    '- VERDICT: one short line only.',
    mode === 'research-assistant'
      ? '- PLAN: 3-5 concise bullets. Include the next research action and whether it is worthy of backtest / replay / paper.'
      : '- PLAN: 3-5 concise bullets. Include what to do next, risk boundary, and position size idea.',
    mode === 'research-assistant'
      ? '- WHY: exactly 3 bullets focused on factors, regime fit, validation quality, or portfolio/execution realism.'
      : '- WHY: exactly 3 bullets in plain language.',
    '- RISK: 2 bullets + 1 explicit line that says "Common failure modes / when NOT to trade".',
    '- EVIDENCE: only compact facts that are actually present in context.',
    '- Keep it mobile-friendly and do not dump raw JSON.',
    'Safety rules:',
    '- Do not fabricate performance, fills, live broker access, or hidden data.',
    '- Prefer "I do not have enough clean data" over guessing.',
    `- Forbidden language includes: ${constitution.banned_phrases.join(', ')}.`,
    mode === 'research-assistant'
      ? '- When factor-level realized data is unavailable, explicitly separate taxonomy knowledge from measured evidence.\n- Prefer economically grounded factor logic over retail technical indicators.\n- Keep risk control and implementation realism ahead of return-chasing.\n- Do not imply commodity futures runtime support unless the evidence explicitly shows it.'
      : '- Keep explanations practical and evidence-aware.',
    '- End with the exact phrase: "educational, not financial advice".'
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
