export type NovaLocale = 'en' | 'zh';
export type NovaPosture = 'ATTACK' | 'PROBE' | 'DEFEND' | 'WAIT';

export interface BrandVoiceConstitution {
  locale: NovaLocale;
  identity: string;
  principles: string[];
  opportunity: string;
  risk: string;
  doNotAct: string;
  returnInvite: string;
  noActionValue: string;
  impulsiveIntervention: string;
  temperedOpportunity: string;
  playful_boundary: { allowed: string[]; forbidden: string[] };
  banned_phrases: string[];
}

export interface ToneMatrixRecord {
  summary: string;
  motionTone: string;
  language: string[];
}

export declare const NOVA_BRAND_VOICE: Record<NovaLocale, Omit<BrandVoiceConstitution, 'locale' | 'playful_boundary' | 'banned_phrases'>>;
export declare const NOVA_PLAYFUL_BOUNDARY: { allowed: string[]; forbidden: string[] };
export declare const NOVA_TONE_MATRIX: Record<'defensive' | 'cautious' | 'observe' | 'probe' | 'opportunity' | 'watchful' | 'quiet', ToneMatrixRecord>;

export function normalizeNovaLocale(locale?: string | null): NovaLocale;
export function getBrandVoiceConstitution(locale?: string): BrandVoiceConstitution;
export function getToneMatrix(locale?: string): { locale: NovaLocale; matrix: typeof NOVA_TONE_MATRIX };
export function getPlayfulnessPrinciples(locale?: string): { locale: NovaLocale; definition: string; allowed: string[]; forbidden: string[] };
export function getDailyStanceCopy(args: { posture?: string; locale?: string; variant?: string; seed?: string; changed?: boolean; noActionDay?: boolean }): string;
export function getTodayRiskCopy(args: { posture?: string; locale?: string; changed?: boolean; seed?: string }): { label: string; explanation: string; delta: string };
export function getMorningCheckCopy(args: { posture?: string; status?: string; locale?: string; seed?: string; changed?: boolean; noActionDay?: boolean }): {
  title: string;
  short_label: string;
  headline: string;
  prompt: string;
  arrival_line: string;
  ritual_line: string;
  humor_line: string;
  completion_feedback: string;
  cta_label: string;
  ai_cta_label: string;
  changed_line: string | null;
};
export function getActionCardCopy(args: { posture?: string; locale?: string; seed?: string; actionState?: string }): {
  title: string;
  risk_title: string;
  more_ranked_title: string;
  recent_signals_title: string;
  ask_nova_label: string;
  open_wrap_label: string;
  why_now: string;
  caution: string;
  invalidation: string;
  badges: Record<string, string>;
};
export function getNoActionCopy(args: { locale?: string; seed?: string; posture?: string }): { arrival: string; completion: string; wrap: string; notify: string };
export function getNotificationCopy(args: { category?: string; posture?: string; locale?: string; triggerType?: string; seed?: string; overlap?: boolean }): { title: string; body: string };
export function getWidgetCopy(args: { type: string; posture?: string; locale?: string; triggerType?: string; seed?: string }): { title: string; caption?: string; spark: string };
export function getDisciplineCopy(args: { locale?: string; score?: number; noActionDay?: boolean; seed?: string }): { summary: string; no_action_value_line: string | null; behavior_quality: string };
export function getWrapUpCopy(args: { locale?: string; posture?: string; ready: boolean; completed: boolean; seed?: string; noActionDay?: boolean }): { title: string; short_label: string; headline: string; opening_line: string; completion_feedback: string; no_action_line: string | null };
export function getAssistantVoiceGuide(args?: { locale?: string; posture?: string; userState?: string }): { opener: string; risk_explain: string; intercept: string; no_action: string; wrap: string; style_rules: string[] };
export function getUiRegimeTone(args: { posture?: string; locale?: string }): {
  tone: string;
  accent: string;
  label: string;
  widget_label: string;
  arrival_line: string;
  ritual_line: string;
  humor_line: string;
  completion_line: string;
  protective_line: string;
  wrap_line: string;
  motion_profile: string;
  motion: Record<string, string>;
};
export function getPortfolioActionLabel(action: string, locale?: string): string;
export function getCopyGuardrails(locale?: string): { locale: NovaLocale; banned_phrases: string[]; rules: string[] };
