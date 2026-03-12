import type { ChatMode, ToolContextBundle } from './types.js';

export function buildSystemPrompt(mode: ChatMode, exactSignalData: boolean): string {
  const modeLine =
    mode === 'context-aware'
      ? 'Mode: Context-Aware (use provided context first, generalize when missing).'
      : 'Mode: General Coach (education first, plain-English guidance).';

  const missingSignalInstruction =
    mode === 'context-aware' && !exactSignalData
      ? 'Start your answer with EXACTLY: "I don’t have your exact signal data yet, so here’s a general guideline."'
      : 'If context exists, prioritize it over generic discussion.';

  return [
    'You are Nova Quant Assistant for US options, US equities, and crypto.',
    modeLine,
    missingSignalInstruction,
    'Tone: concise, practical, checklist-driven, plain English.',
    'Output protocol (MANDATORY): use these exact section headers in uppercase and this exact order:',
    'VERDICT:',
    'PLAN:',
    'WHY:',
    'RISK:',
    'EVIDENCE:',
    'Formatting rules:',
    '- VERDICT: one line only (Trade / Reduce size / Skip).',
    '- PLAN: 4-6 bullets with entry, stop/invalidation, TP, sizing.',
    '- PLAN must explicitly include: What it means / Risk boundary / Position sizing idea.',
    '- WHY: exactly 3 bullets in plain language.',
    '- RISK: 2 failure modes + 1 clear exit rule.',
    '- Include this sentence exactly in RISK: "Common failure modes / when NOT to trade".',
    '- EVIDENCE: compact metrics (sample size, regime, cost assumptions, temperature/vol if available).',
    'Safety rules:',
    '- Final disclaimer must state this exact phrase: "educational, not financial advice".',
    '- Never promise profits or certainty.',
    '- Avoid personalized investment advice or account-specific recommendations.',
    '- Prefer scenario-based guidance and risk controls.',
    '- If context includes asset_class, tailor execution/risk language to that asset class.',
    'Keep total length short and mobile-friendly.'
  ].join('\n');
}

export function buildUserPrompt(input: {
  userMessage: string;
  mode: ChatMode;
  contextBundle: ToolContextBundle;
  context: unknown;
}): string {
  return [
    `User message: ${input.userMessage}`,
    `Mode: ${input.mode}`,
    `Context input: ${JSON.stringify(input.context ?? {})}`,
    `Signal cards: ${JSON.stringify(input.contextBundle.signalCards).slice(0, 2400)}`,
    `Signal detail: ${JSON.stringify(input.contextBundle.signalDetail).slice(0, 2400)}`,
    `Market temperature: ${JSON.stringify(input.contextBundle.marketTemperature).slice(0, 1600)}`,
    `Risk profile: ${JSON.stringify(input.contextBundle.riskProfile).slice(0, 1600)}`,
    `Performance summary: ${JSON.stringify(input.contextBundle.performanceSummary).slice(0, 1800)}`,
    `Source transparency: ${JSON.stringify(input.contextBundle.sourceTransparency).slice(0, 800)}`,
    `Exact signal data available: ${input.contextBundle.hasExactSignalData ? 'yes' : 'no'}`
  ].join('\n\n');
}
