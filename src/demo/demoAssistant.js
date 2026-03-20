import { getAssistantVoiceGuide, getNoActionCopy } from '../copy/novaCopySystem.js';
import { detectMessageLanguage, formatStructuredAssistantReply } from '../utils/assistantLanguage';

function safeNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatPrice(value) {
  const num = safeNumber(value, null);
  if (!Number.isFinite(num)) return 'n/a';
  if (Math.abs(num) >= 1000) return `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${num.toFixed(2)}`;
}

function topSignal(state) {
  const evidence = Array.isArray(state?.evidence?.top_signals) ? state.evidence.top_signals : [];
  const runtime = Array.isArray(state?.signals) ? state.signals : [];
  return evidence[0] || runtime[0] || null;
}

function holdingsRows(state) {
  return Array.isArray(state?.user_context?.holdings_review?.rows) ? state.user_context.holdings_review.rows : [];
}

function normalizeQuestion(question = '') {
  return String(question).trim().toLowerCase();
}

function inferIntent(question = '') {
  const q = normalizeQuestion(question);
  if (q.includes('holding') || q.includes('portfolio') || q.includes('持仓')) return 'holdings';
  if (q.includes('safe') || q.includes('risk') || q.includes('风险')) return 'risk';
  if (q.includes('enter') || q.includes('buy') || q.includes('sell') || q.includes('now')) return 'entry';
  if (q.includes('explain') || q.includes('strategy') || q.includes('how does')) return 'strategy';
  if (q.includes('signal') || q.includes('why')) return 'signal';
  return 'general';
}

function buildEvidenceLine(signal, state, language = 'en') {
  const zh = language === 'zh';
  const entryLow = safeNumber(signal?.entry_zone?.low ?? signal?.entry_low ?? signal?.entry, null);
  const entryHigh = safeNumber(signal?.entry_zone?.high ?? signal?.entry_high ?? signal?.entry, null);
  const tp = safeNumber(signal?.take_profit_levels?.[0]?.price ?? signal?.take_profit, null);
  const sl = safeNumber(signal?.stop_loss?.price ?? signal?.invalidation_level, null);
  const confidence = safeNumber(signal?.confidence ?? signal?.conviction, 0);
  const safety = state?.safety?.conclusion || (zh ? '当前只能用小仓位控制风险。' : 'Risk is controlled only with small size.');

  return [
    signal
      ? zh
        ? `${signal.symbol} ${String(signal.direction || 'WAIT').toUpperCase()} 是当前 demo 的动作卡。`
        : `${signal.symbol} ${String(signal.direction || 'WAIT').toUpperCase()} is the current demo action.`
      : zh
        ? '当前没有加载 demo 信号。'
        : 'No demo signal is loaded.',
    entryLow !== null && entryHigh !== null
      ? zh
        ? `入场区间 ${formatPrice(entryLow)} 到 ${formatPrice(entryHigh)}。`
        : `Entry zone ${formatPrice(entryLow)} to ${formatPrice(entryHigh)}.`
      : null,
    tp !== null ? (zh ? `止盈 ${formatPrice(tp)}。` : `Take profit ${formatPrice(tp)}.`) : null,
    sl !== null ? (zh ? `止损 ${formatPrice(sl)}。` : `Stop loss ${formatPrice(sl)}.`) : null,
    confidence ? (zh ? `置信度 ${Math.round(confidence * 100)} / 100。` : `Confidence ${Math.round(confidence * 100)} out of 100.`) : null,
    zh ? 'Demo 说明：这条回答来自离线投资者演示流程，不是实时助手。' : 'Demo note: this answer is coming from the offline investor walkthrough, not the live assistant.',
    safety
  ]
    .filter(Boolean)
    .join(' ');
}

function structured({ language = 'en', verdict, plan, why, risk, evidence }) {
  return formatStructuredAssistantReply({
    language,
    verdict,
    plan,
    why,
    risk,
    evidence
  });
}

export function buildDemoAssistantReply(question, state, context = {}) {
  const language = detectMessageLanguage(question, context?.locale || 'en');
  const zh = language === 'zh';
  const signal = topSignal(state);
  const intent = inferIntent(question);
  const holdings = holdingsRows(state);
  const safety = state?.safety?.conclusion || (zh ? '这个 demo 里只允许新手级别的小仓位。' : 'Only small beginner-sized positions are allowed in this demo.');
  const primaryEvidence = buildEvidenceLine(signal, state, language);
  const strategySource = signal?.strategy_source || 'AI quant strategy';
  const positionPct = safeNumber(signal?.position_advice?.position_pct, null);
  const posture = state?.decision?.risk_state?.posture || state?.decision?.summary?.risk_posture || 'WAIT';
  const locale = context?.locale || 'en';
  const voice = getAssistantVoiceGuide({ locale, posture, userState: intent });
  const noAction = getNoActionCopy({ locale, posture, seed: String(signal?.symbol || 'demo') });

  if (intent === 'holdings') {
    const biggest = holdings[0];
    return structured({
      language,
      verdict: biggest
        ? zh
          ? `${voice.opener} ${biggest.symbol || '你的组合'} 目前仍然可控，重点不是继续把噪音加上去。`
          : `${voice.opener} ${biggest.symbol || 'Your portfolio'} is still manageable. The real point is not adding chaos on top of it.`
        : zh
          ? `${voice.opener} 这个 demo 组合本来就是故意做得克制的，这种克制本身就是产品表达的一部分。`
          : `${voice.opener} The demo portfolio is intentionally controlled. That restraint is part of the story, not a missing feature.`,
      plan: biggest
        ? zh
          ? [`如果 ${biggest.symbol || '最大仓位'} 仍然和系统方向一致，就继续持有。`, '今天不要在同一主题里再叠加一笔大仓位。', '如果你要降风险，就先减最拥挤的那只。']
          : [
            `Keep ${biggest.symbol || 'the largest position'} if it still matches the system direction.`,
            'Do not add another big position in the same theme today.',
            'If you want to reduce risk, trim the most crowded name first.'
          ]
        : zh
          ? ['先加载 demo 持仓列表。', '总暴露保持中等。', '不要叠加太多相似仓位。']
          : ['Load the investor demo holdings list.', 'Keep total exposure moderate.', 'Avoid stacking similar positions.'],
      why: zh
        ? ['这个 demo 组合是为了看起来真实，而不是为了过度优化。', '产品想展示的是纪律和清晰度，不是高换手。', '仓位建议保持简单，方便第一次使用的投资者理解。']
        : [
            'The demo portfolio is built to look realistic, not over-optimized.',
            'The app is trying to show discipline and clarity, not aggressive turnover.',
            'Position advice stays simple so a first-time investor can understand it.'
          ],
      risk: zh
        ? ['哪怕 demo 组合是正收益，也不能把它理解成真实实盘结果。', '小账户最该盯的仍然是集中度。']
        : ['Even a positive demo portfolio should not be read as a live result.', 'Concentration is still the main thing to watch in a small account.'],
      evidence: [primaryEvidence]
    });
  }

  if (intent === 'risk') {
    return structured({
      language,
      verdict: safety,
      plan: zh
        ? [
            `如果你要做这笔，仓位控制在 ${positionPct ? `${Math.round(positionPct)}%` : '小试探仓'}。`,
            '止损按卡片写的执行，不要进场后再放宽。',
            '如果价格已经跳离买入区间，就等，不要追。'
          ]
        : [
            `If you trade this setup, keep it to ${positionPct ? `${Math.round(positionPct)}%` : 'a small starter size'}.`,
            'Use the stop as written. Do not widen it after entry.',
            'If the price jumps away from the buy zone, wait instead of chasing.'
          ],
      why: zh
        ? [
            'demo 故意把仓位做得克制，置信度不等于可以放大动作。',
            '产品把风险放在第一位，是为了减少情绪化错误。',
            signal ? `${signal.symbol} 会被展示，是因为它是今天 demo 包里最干净的 setup。` : '当前没有活跃的 demo 信号。'
          ]
        : [
            'The demo keeps size modest on purpose. Confidence is not a license to get loud.',
            'Risk comes first because this product is built to reduce emotional mistakes.',
            signal ? `${signal.symbol} is shown because it is the cleanest setup in the demo pack today.` : 'There is no active demo signal right now.'
          ],
      risk: zh
        ? ['风险可控不等于保证能赚。', '如果价格离开计划区间，最正确的动作仍然可能是继续等。']
        : ['Safe does not mean guaranteed.', 'The correct move can still be to wait if price leaves the planned zone.'],
      evidence: [primaryEvidence, voice.risk_explain]
    });
  }

  if (intent === 'entry') {
    const entryLow = safeNumber(signal?.entry_zone?.low ?? signal?.entry_low ?? signal?.entry, null);
    const entryHigh = safeNumber(signal?.entry_zone?.high ?? signal?.entry_high ?? signal?.entry, null);
    const tp = safeNumber(signal?.take_profit_levels?.[0]?.price ?? signal?.take_profit, null);
    const sl = safeNumber(signal?.stop_loss?.price ?? signal?.invalidation_level, null);
    return structured({
      language,
      verdict: signal
        ? zh
          ? `${voice.opener} 可以考虑，但前提是 ${signal.symbol} 还在计划入场区间内。`
          : `${voice.opener} Yes, but only if ${signal.symbol} stays in the planned entry zone.`
        : `${voice.no_action} ${noAction.completion}`,
      plan: zh
        ? [
            entryLow !== null && entryHigh !== null
              ? `只在 ${formatPrice(entryLow)} 到 ${formatPrice(entryHigh)} 之间考虑入场。`
              : '只有在计划 setup 仍然有效时才考虑入场。',
            tp !== null ? `止盈先看 ${formatPrice(tp)}。` : '先看止盈，不要临场自由发挥目标位。',
            sl !== null ? `止损看 ${formatPrice(sl)}。` : '止损按卡片执行，不要自己改。',
            `仓位控制在 ${positionPct ? `${Math.round(positionPct)}%` : '小仓位'}。`
          ]
        : [
            entryLow !== null && entryHigh !== null
              ? `Only enter between ${formatPrice(entryLow)} and ${formatPrice(entryHigh)}.`
              : 'Only enter if the planned setup is still valid.',
            tp !== null ? `Take profit is ${formatPrice(tp)}.` : 'Take profit comes first; do not freestyle the target.',
            sl !== null ? `Stop loss is ${formatPrice(sl)}.` : 'Use the stop exactly as shown.',
            `Keep size to ${positionPct ? `${Math.round(positionPct)}%` : 'a small allocation'}.`
          ],
      why: zh
        ? ['这个 demo 想展示的是先有计划，再去行动。', '入场、目标和止损被一起展示，是为了让交易一眼能看懂。', '重点是受控执行，而不是最大暴露。']
        : [
            'This demo is built to show a clear plan before action.',
            'Entry, target, and stop are shown together so the trade is understandable at a glance.',
            'The point is controlled execution, not maximum exposure.'
          ],
      risk: zh ? ['如果价格已经明显偏离区间，正确动作就是继续等。'] : ['If price moves too far from the zone, the right choice is to wait.'],
      evidence: [primaryEvidence]
    });
  }

  if (intent === 'strategy') {
    return structured({
      language,
      verdict: zh ? 'Nova 先看证据，再决定是否给出小仓位动作。' : 'Nova uses a simple evidence-first process, then keeps size small.',
      plan: zh
        ? ['先找当前面板里最干净的 setup。', '再看市场是否足够平稳，允许动作。', '最后整理成一张包含入场、目标、止损和仓位的行动卡。']
        : [
            'It looks for the clearest setup on the board.',
            'It checks whether the market is calm enough to act.',
            'It turns that into one simple action card with entry, target, stop, and size.'
          ],
      why: zh
        ? [`${strategySource} 是 demo 卡片上展示的策略标签。`, '这套体验是给散户用户设计的，所以先解释动作，再展开细节。', '目标是减少冲动交易，而不是把产品做得很花哨。']
        : [
            `${strategySource} is the strategy label shown on the demo card.`,
            'The experience is designed for retail users, so it explains the action before the details.',
            'The goal is to reduce impulsive trading, not to make the app look complicated.'
          ],
      risk: zh
        ? ['demo 展示的是一个受控示例，不是实时承诺。', '真正重要的仍然是风控，而不是置信标签。']
        : ['The demo shows a controlled example, not a live promise.', 'Risk controls still matter more than confidence labels.'],
      evidence: [primaryEvidence, voice.risk_explain]
    });
  }

  if (intent === 'signal') {
    return structured({
      language,
      verdict: signal
        ? zh
          ? `${voice.opener} ${signal.symbol} 是当前 demo 里的主信号，因为它是现在最干净的一张行动卡。`
          : `${voice.opener} ${signal.symbol} is the main demo signal because it is the cleanest action card available right now.`
        : `${voice.no_action} ${noAction.notify}`,
      plan: zh
        ? [
            signal ? `先聚焦 ${signal.symbol}，不要同时分散注意力到太多名字。` : '先等下一次足够干净的 setup。',
            '把这张卡片当成完整计划：入场、目标、止损、仓位都看它。',
            '如果你想看更多细节，再和下面最近的 demo 信号做对比。'
          ]
        : [
            signal ? `Focus on ${signal.symbol} instead of spreading attention across too many names.` : 'Wait for the next clean setup.',
            'Use the card as the full plan: entry, target, stop, and size.',
            'If you want more detail, compare it with the recent demo signals underneath.'
          ],
      why: zh
        ? ['demo 的目标是给你一个强动作，而不是十个噪音想法。', '相比完整交易后台，一张清晰行动卡更容易让投资者理解。', signal ? `${signal.symbol} 通过了 demo 的筛选规则，所以排在最前。` : '当前没有 setup 通过 demo 筛选。']
        : [
            'The demo is built to show one strong action instead of ten noisy ideas.',
            'A single clear card is easier for an investor to understand than a full trading dashboard.',
            signal ? `${signal.symbol} passed the demo selection rules and is shown first.` : 'No setup passed the demo selection rules.'
          ],
      risk: zh
        ? ['高置信也仍然要小仓位。', '再干净的 setup 也可能失败，所以止损仍然是计划的一部分。']
        : ['High confidence still requires small size.', 'A clean setup can fail, so the stop remains part of the plan.'],
      evidence: [primaryEvidence, voice.intercept]
    });
  }

  return structured({
    language,
    verdict: signal
      ? zh
        ? `${voice.opener} 当前 demo 想法是 ${signal.symbol} ${String(signal.direction || 'WAIT').toUpperCase()}，计划清晰，仓位也克制。`
        : `${voice.opener} The current demo idea is ${signal.symbol} ${String(signal.direction || 'WAIT').toUpperCase()}, with a clear plan and small size.`
      : `${voice.no_action} ${noAction.completion}`,
    plan: zh
      ? ['先从主行动卡开始看。', '在做任何动作前先看风险框。', '如果还不清楚，再用自然语言追问一句。']
      : ['Start from the main action card.', 'Check the risk box before doing anything.', 'If needed, ask one follow-up question in plain language.'],
    why: zh
      ? ['demo 助手故意保持简单，对投资者更友好。', '它故意做成离线，这样没有网络时演示流程也稳定。', context?.page ? `这条回答锚定在 ${context.page} 页面上下文。` : '这条回答锚定在当前 demo 上下文。']
      : [
          'The demo assistant is intentionally simple and investor-friendly.',
          'It is offline on purpose so the walkthrough is stable even without network access.',
          context?.page ? `This answer is anchored to the ${context.page} screen context.` : 'This answer is anchored to the current demo context.'
        ],
    risk: zh ? ['这是 demo 演示流程，不是实时交易会话。'] : ['This is a demo walkthrough, not a live trading session.'],
    evidence: [primaryEvidence, voice.wrap]
  });
}
