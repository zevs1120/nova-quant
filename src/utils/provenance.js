function normalizeStatus(value, fallback = 'INSUFFICIENT_DATA') {
  const next = String(value || '').trim().toUpperCase();
  return next || fallback;
}

export function describeEvidenceMode({ locale = 'en', sourceStatus, dataStatus, sourceType } = {}) {
  const zh = locale?.startsWith('zh');
  const source = normalizeStatus(sourceStatus);
  const data = normalizeStatus(dataStatus, source);
  const mode = source === 'DB_BACKED' ? data : source;
  const sourceKind = String(sourceType || '').toLowerCase();

  const definitions = {
    REALIZED: {
      label: zh ? '实盘' : 'Live',
      tone: 'live',
      note: zh ? '来自已确认成交与真实账户状态。' : 'Backed by confirmed fills and real account state.'
    },
    DB_BACKED: {
      label: zh ? '数据库实时' : 'DB-backed',
      tone: 'db',
      note: zh ? '来自当前数据库快照，不代表已成交。' : 'Backed by current database snapshots, not realized fills.'
    },
    PAPER_ONLY: {
      label: zh ? '纸面' : 'Paper',
      tone: 'paper',
      note: zh ? '来自前向模拟，不代表真实成交。' : 'Forward-simulated only. Not a realized trade record.'
    },
    BACKTEST_ONLY: {
      label: zh ? '回测' : 'Backtest',
      tone: 'backtest',
      note: zh ? '历史回测结果，不得视为实盘记录。' : 'Historical backtest only. Must not be read as live performance.'
    },
    MODEL_DERIVED: {
      label: zh ? '模型推导' : 'Model-derived',
      tone: 'derived',
      note: zh ? '由模型推导，不是直接市场确认。' : 'Model-derived, not directly market-confirmed.'
    },
    EXPERIMENTAL: {
      label: zh ? '实验' : 'Experimental',
      tone: 'experimental',
      note: zh ? '处于实验阶段，不应直接驱动真实动作。' : 'Experimental. Not production-safe for direct action.'
    },
    WITHHELD: {
      label: zh ? '保留' : 'Withheld',
      tone: 'withheld',
      note: zh ? '因证据或风险不足而被保留。' : 'Withheld because evidence or risk quality is insufficient.'
    },
    DEMO_ONLY: {
      label: zh ? '演示' : 'Demo',
      tone: 'demo',
      note: zh ? '仅用于演示，不得视为研究或实盘证据。' : 'For demo only. Not valid as research or live evidence.'
    },
    INSUFFICIENT_DATA: {
      label: zh ? '数据不足' : 'Insufficient',
      tone: 'insufficient',
      note: zh ? '当前数据不足，判断可信度受限。' : 'Data is insufficient. Confidence is constrained.'
    }
  };

  const entry = definitions[mode] || definitions.INSUFFICIENT_DATA;
  const watermarks = {
    REALIZED: zh ? '实盘 / 已成交' : 'LIVE / REALIZED',
    DB_BACKED: zh ? '数据库快照 / 未成交' : 'DB SNAPSHOT / NOT REALIZED',
    PAPER_ONLY: zh ? '纸面 / 非实盘' : 'PAPER / NOT REALIZED',
    BACKTEST_ONLY: zh ? '回测 / 非实盘' : 'BACKTEST / NOT LIVE',
    MODEL_DERIVED: zh ? '模型推导 / 非确认' : 'MODEL-DERIVED / NOT CONFIRMED',
    EXPERIMENTAL: zh ? '实验 / 非生产' : 'EXPERIMENTAL / NOT PROD',
    WITHHELD: zh ? '保留 / 禁止执行' : 'WITHHELD / DO NOT ACT',
    DEMO_ONLY: zh ? '演示 / 非真实' : 'DEMO / NOT REAL',
    INSUFFICIENT_DATA: zh ? '数据不足 / 不建议动作' : 'INSUFFICIENT / DO NOT ACT'
  };

  const detail =
    sourceKind.includes('backtest') || mode === 'BACKTEST_ONLY'
      ? zh
        ? '含历史假设与成本设定。'
        : 'Uses historical assumptions and cost settings.'
      : sourceKind.includes('paper') || sourceKind.includes('simulated')
        ? zh
          ? '来自模拟订单与持仓账本。'
          : 'Derived from simulated orders and positions.'
        : null;

  return {
    mode,
    label: entry.label,
    tone: entry.tone,
    note: detail ? `${entry.note} ${detail}` : entry.note,
    watermark: watermarks[mode] || watermarks.INSUFFICIENT_DATA
  };
}
