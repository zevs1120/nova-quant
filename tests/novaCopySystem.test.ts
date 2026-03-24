import { describe, expect, it } from 'vitest';
import {
  getActionCardCopy,
  getAssistantVoiceGuide,
  getBrandVoiceConstitution,
  getCopyGuardrails,
  getDailyStanceCopy,
  getDisciplineCopy,
  getMorningCheckCopy,
  getNoActionCopy,
  getNotificationCopy,
  getPerceptionLayerCopy,
  getTodayRiskCopy,
  getUiRegimeTone,
  getWidgetCopy,
} from '../src/copy/novaCopySystem.js';

describe('nova copy system', () => {
  it('exposes a brand constitution with explicit guardrails', () => {
    const constitution = getBrandVoiceConstitution('zh');
    expect(constitution.identity).toContain('决策搭子');
    expect(constitution.principles.length).toBeGreaterThan(3);
    expect(constitution.banned_phrases).toContain('快冲');
  });

  it('maps daily stance and risk tone without hype', () => {
    const stance = getDailyStanceCopy({
      posture: 'ATTACK',
      locale: 'en',
      variant: 'sharp',
      seed: 'alpha',
    });
    const risk = getTodayRiskCopy({
      posture: 'DEFEND',
      locale: 'en',
      changed: true,
      seed: 'beta',
    });

    expect(stance.toLowerCase()).not.toContain('act now');
    expect(risk.label).toBeTruthy();
    expect(risk.explanation).toBeTruthy();
    expect(risk.delta).toBeTruthy();
  });

  it('gives no-action days deliberate completion language', () => {
    const morning = getMorningCheckCopy({
      posture: 'WAIT',
      status: 'COMPLETED',
      locale: 'zh',
      seed: 'quiet-day',
      noActionDay: true,
    });
    const noAction = getNoActionCopy({
      locale: 'zh',
      posture: 'WAIT',
      seed: 'quiet-day',
    });

    expect(morning.completion_feedback).toBeTruthy();
    expect(noAction.completion).toMatch(/完成|动作|等待/);
  });

  it('keeps notifications and widgets in the same restrained voice', () => {
    const notification = getNotificationCopy({
      category: 'PROTECTIVE',
      posture: 'DEFEND',
      locale: 'zh',
      seed: 'protective',
    });
    const widget = getWidgetCopy({
      type: 'change',
      posture: 'PROBE',
      locale: 'en',
      triggerType: 'risk_shift',
      seed: 'shift',
    });

    expect(notification.title).toBeTruthy();
    expect(notification.body).not.toContain('快');
    expect(widget.title).toBeTruthy();
    expect(widget.spark).toBeTruthy();
  });

  it('gives the assistant a calm but alive voice guide', () => {
    const voice = getAssistantVoiceGuide({
      locale: 'en',
      posture: 'DEFEND',
      userState: 'impulsive',
    });

    expect(voice.opener).toBeTruthy();
    expect(voice.intercept.toLowerCase()).toContain('clarity');
    expect(voice.style_rules.length).toBeGreaterThan(1);
  });

  it('derives ui regime tone and discipline feedback from real states', () => {
    const uiTone = getUiRegimeTone({
      posture: 'PROBE',
      locale: 'en',
    });
    const discipline = getDisciplineCopy({
      locale: 'en',
      score: 84,
      noActionDay: true,
      seed: 'discipline',
    });
    const actionCopy = getActionCardCopy({
      posture: 'PROBE',
      locale: 'en',
      actionState: 'watch-only',
      seed: 'card',
    });
    const guardrails = getCopyGuardrails('zh');

    expect(uiTone.tone).toBe('watchful');
    expect(uiTone.motion).toHaveProperty('entry');
    expect(discipline.behavior_quality).toBe('STEADY');
    expect(actionCopy.invalidation).toBeTruthy();
    expect(guardrails.rules.some((line) => line.includes('高风险日'))).toBe(true);
  });

  it('builds a perception-layer voice that feels system-first instead of dashboard-like', () => {
    const perception = getPerceptionLayerCopy({
      locale: 'zh',
      posture: 'WAIT',
      status: 'arriving',
      noActionDay: true,
      seed: 'perception',
    });

    expect(perception.badge).toBe('系统判断');
    expect(perception.headline).toBeTruthy();
    expect(perception.focus_line).toMatch(/系统|动作|市场|等待/);
    expect(perception.headline).not.toContain('快冲');
  });
});
