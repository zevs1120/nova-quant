function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function asSymbol(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}

function inferAssetClass(symbol, rawAssetClass) {
  if (rawAssetClass) return rawAssetClass;
  if (symbol.includes('-') || symbol.endsWith('USDT')) return 'CRYPTO';
  return 'US_STOCK';
}

function inferMarket(assetClass) {
  return assetClass === 'CRYPTO' ? 'CRYPTO' : 'US';
}

function normalizeHolding(item, index) {
  const symbol = asSymbol(item?.symbol);
  const assetClass = inferAssetClass(symbol, item?.asset_class);
  const weight = toNumber(item?.weight_pct, null);
  const cost = toNumber(item?.cost_basis, null);
  const quantity = toNumber(item?.quantity, null);
  const currentPriceOverride = toNumber(item?.current_price_override ?? item?.current_price, null);
  const marketValue = toNumber(item?.market_value, null);
  const confidenceLevelRaw = toNumber(item?.confidence_level, null);
  const confidenceLevel =
    confidenceLevelRaw === null ? null : clamp(Math.round(confidenceLevelRaw), 1, 5);

  return {
    id: item?.id || `holding-${index + 1}`,
    symbol,
    asset_class: assetClass,
    market: item?.market || inferMarket(assetClass),
    weight_pct: weight,
    quantity,
    cost_basis: cost,
    current_price_override: currentPriceOverride,
    market_value: marketValue,
    sector: String(item?.sector || '').trim() || null,
    confidence_level: confidenceLevel,
    note: String(item?.note || '').trim(),
    source_kind: String(item?.source_kind || '').trim() || null,
    source_label: String(item?.source_label || '').trim() || null,
    import_confidence: toNumber(item?.import_confidence, null),
  };
}

function exposureRows(rows) {
  const map = {};
  for (const row of rows) {
    const key = row.sector || 'Unknown';
    if (!map[key]) {
      map[key] = {
        sector: key,
        weight_pct: 0,
        count: 0,
        symbols: [],
      };
    }
    map[key].weight_pct += row.effective_weight_pct;
    map[key].count += 1;
    map[key].symbols.push(row.symbol);
  }

  return Object.values(map)
    .map((item) => ({
      ...item,
      weight_pct: Number(item.weight_pct.toFixed(2)),
    }))
    .sort((a, b) => b.weight_pct - a.weight_pct);
}

function riskModePenalty(mode) {
  if (mode === 'do not trade') return 22;
  if (mode === 'trade light') return 12;
  return 0;
}

function statusFromSystem({ candidate, filtered, instrument, safetyMode }) {
  if (candidate?.direction === 'SHORT') {
    return {
      system_status: 'contradicted',
      system_action: 'trim',
      reason: '系统当前偏向 SHORT，这类长仓暴露需要减仓或对冲。',
    };
  }

  if (candidate && safetyMode !== 'do not trade') {
    return {
      system_status: 'aligned',
      system_action: safetyMode === 'trade light' ? 'light-hold' : 'hold',
      reason:
        safetyMode === 'trade light'
          ? `系统支持该持仓，但今天是轻仓模式（${candidate.grade} 级机会）。`
          : `系统支持该持仓（${candidate.grade} 级机会）。`,
    };
  }

  if (filtered) {
    return {
      system_status: 'not_supported',
      system_action: 'trim',
      reason: `系统未支持当前仓位：${filtered.reason || '未通过风险/状态过滤。'}`,
    };
  }

  if (candidate && safetyMode === 'do not trade') {
    return {
      system_status: 'watch',
      system_action: 'observe',
      reason: '当前安全模式暂停新风险暴露，建议仅观察。',
    };
  }

  if (!instrument) {
    return {
      system_status: 'untracked',
      system_action: 'observe',
      reason: '系统当前未覆盖该标的，无法给出高可信仓位建议。',
    };
  }

  return {
    system_status: 'watch',
    system_action: 'observe',
    reason: '系统暂无明确支持信号，建议以观察为主。',
  };
}

export const SAMPLE_HOLDINGS_TEMPLATE = [
  {
    symbol: 'AAPL',
    asset_class: 'US_STOCK',
    weight_pct: 18,
    cost_basis: 187.2,
    confidence_level: 4,
    note: 'Core',
  },
  {
    symbol: 'QQQ',
    asset_class: 'US_STOCK',
    weight_pct: 22,
    cost_basis: 426.4,
    confidence_level: 4,
    note: 'Growth ETF',
  },
  {
    symbol: 'XLF',
    asset_class: 'US_STOCK',
    weight_pct: 12,
    cost_basis: 38.6,
    confidence_level: 3,
    note: 'Financials',
  },
  {
    symbol: 'BTC-USDT',
    asset_class: 'CRYPTO',
    weight_pct: 10,
    cost_basis: 68800,
    confidence_level: 3,
    note: 'Crypto core',
  },
];

export function buildHoldingsReview({ holdings = [], state } = {}) {
  const normalized = holdings
    .map((item, index) => normalizeHolding(item, index))
    .filter((item) => item.symbol);

  if (!normalized.length) {
    return {
      generated_at: new Date().toISOString(),
      totals: {
        holdings_count: 0,
        total_weight_pct: 0,
        aligned_count: 0,
        unsupported_count: 0,
        watch_count: 0,
        total_market_value: null,
        total_unrealized_pnl_amount: null,
        estimated_unrealized_pnl_pct: null,
      },
      concentration: {
        top1_pct: 0,
        top3_pct: 0,
        sector_exposure: [],
        duplicate_exposures: [],
      },
      system_alignment: {
        aligned_weight_pct: 0,
        unsupported_weight_pct: 0,
      },
      confidence_summary: {
        average_confidence_level: null,
        high_conflict_count: 0,
      },
      risk: {
        score: 0,
        level: 'low',
        recommendation: '先添加你的持仓，系统才可以给出个性化仓位建议。',
        primary_risks: ['暂无持仓数据。'],
      },
      key_advice: '先添加持仓，再根据系统建议做减仓/持有/观察决策。',
      actions: [
        '添加当前持仓（股票/ETF/加密），建议填写大致仓位占比。',
        '先校验是否与系统方向一致，再决定是否加仓。',
        '优先处理不被系统支持或重复暴露过高的仓位。',
      ],
      rows: [],
    };
  }

  const instruments = state?.layers?.data_layer?.instruments || [];
  const candidates = state?.layers?.portfolio_layer?.candidates || [];
  const filtered = state?.layers?.portfolio_layer?.filtered_out || [];
  const safetyMode = state?.safety?.mode || 'normal risk';

  const instrumentBySymbol = new Map(instruments.map((item) => [asSymbol(item.ticker), item]));
  const candidateBySymbol = new Map(candidates.map((item) => [asSymbol(item.ticker), item]));
  const filteredBySymbol = new Map(filtered.map((item) => [asSymbol(item.ticker), item]));

  const draftRows = normalized.map((holding) => {
    const symbol = asSymbol(holding.symbol);
    const instrument = instrumentBySymbol.get(symbol);
    const candidate = candidateBySymbol.get(symbol);
    const blocked = filteredBySymbol.get(symbol);

    const currentPrice =
      toNumber(holding.current_price_override, null) ??
      toNumber(instrument?.latest_close, null) ??
      toNumber(candidate?.entry_plan?.entry_zone?.high, null) ??
      toNumber(candidate?.entry_plan?.entry_zone?.low, null);

    const pnlPct =
      toNumber(holding.cost_basis, null) && toNumber(currentPrice, null)
        ? (currentPrice - holding.cost_basis) / holding.cost_basis
        : null;
    const marketValue =
      toNumber(holding.market_value, null) ??
      (toNumber(holding.quantity, null) !== null && toNumber(currentPrice, null) !== null
        ? holding.quantity * currentPrice
        : null);
    const pnlAmount =
      toNumber(holding.quantity, null) !== null &&
      pnlPct !== null &&
      toNumber(holding.cost_basis, null) !== null
        ? (currentPrice - holding.cost_basis) * holding.quantity
        : null;

    const systemView = statusFromSystem({
      candidate,
      filtered: blocked,
      instrument,
      safetyMode,
    });

    return {
      ...holding,
      sector:
        holding.sector ||
        instrument?.sector ||
        (holding.asset_class === 'CRYPTO' ? 'Crypto' : 'Unknown'),
      current_price: currentPrice,
      pnl_pct: pnlPct !== null ? Number(pnlPct.toFixed(4)) : null,
      pnl_amount: pnlAmount !== null ? Number(pnlAmount.toFixed(2)) : null,
      market_value: marketValue !== null ? Number(marketValue.toFixed(2)) : null,
      user_confidence_level: holding.confidence_level,
      source_kind: holding.source_kind || null,
      source_label: holding.source_label || null,
      import_confidence: holding.import_confidence,
      grade: candidate?.grade || null,
      confidence: toNumber(candidate?.confidence, null),
      model_risk_score: toNumber(candidate?.risk_score, null),
      ...systemView,
    };
  });

  const totalDerivedMarketValue = draftRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.market_value || 0)),
    0,
  );
  const canUseMarketValueWeights =
    totalDerivedMarketValue > 0 &&
    draftRows.every(
      (row) => Number.isFinite(Number(row.market_value)) && Number(row.market_value) > 0,
    );
  const defaultWeight = draftRows.length ? 100 / draftRows.length : 0;

  const rows = draftRows.map((row) => {
    const effectiveWeight = clamp(
      canUseMarketValueWeights
        ? (Number(row.market_value || 0) / totalDerivedMarketValue) * 100
        : (toNumber(row.weight_pct, null) ?? defaultWeight),
      0,
      100,
    );
    return {
      ...row,
      effective_weight_pct: Number(effectiveWeight.toFixed(2)),
    };
  });

  rows.sort((a, b) => b.effective_weight_pct - a.effective_weight_pct);

  const totalWeight = rows.reduce((sum, row) => sum + row.effective_weight_pct, 0);
  const top1 = rows[0]?.effective_weight_pct || 0;
  const top3 = rows.slice(0, 3).reduce((sum, row) => sum + row.effective_weight_pct, 0);

  const alignedRows = rows.filter((row) => row.system_status === 'aligned');
  const unsupportedRows = rows.filter(
    (row) => row.system_status === 'not_supported' || row.system_status === 'contradicted',
  );
  const watchRows = rows.filter(
    (row) => row.system_status === 'watch' || row.system_status === 'untracked',
  );

  const alignedWeight = alignedRows.reduce((sum, row) => sum + row.effective_weight_pct, 0);
  const unsupportedWeight = unsupportedRows.reduce((sum, row) => sum + row.effective_weight_pct, 0);
  const confidenceRows = rows.filter((row) => toNumber(row.user_confidence_level, null) !== null);
  const avgUserConfidence = confidenceRows.length
    ? confidenceRows.reduce((sum, row) => sum + Number(row.user_confidence_level), 0) /
      confidenceRows.length
    : null;
  const highConflictCount = rows.filter(
    (row) =>
      toNumber(row.user_confidence_level, null) !== null &&
      Number(row.user_confidence_level) >= 4 &&
      (row.system_status === 'not_supported' || row.system_status === 'contradicted'),
  ).length;

  const sectorExposure = exposureRows(rows);
  const duplicateExposures = sectorExposure.filter(
    (item) => item.count >= 2 && item.weight_pct >= 40,
  );

  let riskScore = 28;
  if (totalWeight > 115) riskScore += 18;
  else if (totalWeight > 95) riskScore += 8;

  if (top1 >= 35) riskScore += 18;
  else if (top1 >= 25) riskScore += 9;

  if (top3 >= 75) riskScore += 14;
  else if (top3 >= 60) riskScore += 7;

  if (unsupportedWeight >= 35) riskScore += 15;
  else if (unsupportedWeight >= 20) riskScore += 8;

  riskScore += duplicateExposures.length * 6;
  if (highConflictCount >= 2) riskScore += 6;
  riskScore += riskModePenalty(safetyMode);
  riskScore = clamp(Math.round(riskScore), 0, 100);

  const riskLevel = riskScore >= 72 ? 'high' : riskScore >= 48 ? 'medium' : 'low';

  const primaryRisks = [];
  if (top1 >= 35) primaryRisks.push(`单一持仓占比 ${top1.toFixed(1)}%，集中度偏高。`);
  if (top3 >= 75) primaryRisks.push(`前三持仓合计 ${top3.toFixed(1)}%，组合分散不足。`);
  if (unsupportedWeight >= 20)
    primaryRisks.push(`有 ${unsupportedWeight.toFixed(1)}% 仓位不被系统方向支持。`);
  if (duplicateExposures.length) {
    primaryRisks.push(
      `重复暴露偏高：${duplicateExposures
        .map((item) => `${item.sector} ${item.weight_pct.toFixed(1)}%`)
        .join(' / ')}。`,
    );
  }
  if (highConflictCount > 0) {
    primaryRisks.push(`你有 ${highConflictCount} 个高信心仓位当前不被系统支持，需优先复核。`);
  }
  if (safetyMode === 'trade light')
    primaryRisks.push('今天系统处于轻仓模式，应主动降低无优势仓位。');
  if (safetyMode === 'do not trade')
    primaryRisks.push('今天系统暂停新风险暴露，建议以保护仓位为先。');
  if (!primaryRisks.length) primaryRisks.push('当前持仓结构未触发明显高风险项，维持纪律即可。');

  const recommendation =
    safetyMode === 'do not trade'
      ? '建议减仓并以观察为主，避免新增方向性风险。'
      : riskLevel === 'high'
        ? '建议先处理集中和不被支持的仓位，再考虑新机会。'
        : safetyMode === 'trade light'
          ? '建议保留最强仓位，其余降到轻仓，控制总暴露。'
          : '持仓结构总体可控，优先保留与系统方向一致的仓位。';

  const weightedPnlBase = rows.reduce(
    (sum, row) => sum + (row.pnl_pct === null ? 0 : row.pnl_pct * row.effective_weight_pct),
    0,
  );
  const weightedPnlPct = totalWeight > 0 ? weightedPnlBase / totalWeight : null;
  const totalMarketValue = rows.reduce(
    (sum, row) => sum + (row.market_value === null ? 0 : row.market_value),
    0,
  );
  const totalPnlAmount = rows.reduce(
    (sum, row) => sum + (row.pnl_amount === null ? 0 : row.pnl_amount),
    0,
  );

  const actions = [
    recommendation,
    alignedRows.length
      ? `优先保留系统支持的 ${alignedRows.length} 个仓位（约 ${alignedWeight.toFixed(1)}% 权重）。`
      : '当前没有明显受系统支持的持仓，先以风险控制为主。',
    unsupportedRows.length
      ? `尽快复核 ${unsupportedRows.length} 个不被支持仓位（约 ${unsupportedWeight.toFixed(1)}% 权重）。`
      : '未发现明显与系统冲突的仓位。',
  ];
  const keyAdvice = actions[0];

  return {
    generated_at: new Date().toISOString(),
    totals: {
      holdings_count: rows.length,
      total_weight_pct: Number(totalWeight.toFixed(2)),
      aligned_count: alignedRows.length,
      unsupported_count: unsupportedRows.length,
      watch_count: watchRows.length,
      total_market_value: totalMarketValue > 0 ? Number(totalMarketValue.toFixed(2)) : null,
      total_unrealized_pnl_amount:
        totalMarketValue > 0 || totalPnlAmount !== 0 ? Number(totalPnlAmount.toFixed(2)) : null,
      estimated_unrealized_pnl_pct:
        weightedPnlPct !== null ? Number(weightedPnlPct.toFixed(4)) : null,
    },
    concentration: {
      top1_pct: Number(top1.toFixed(2)),
      top3_pct: Number(top3.toFixed(2)),
      sector_exposure: sectorExposure,
      duplicate_exposures: duplicateExposures,
    },
    system_alignment: {
      aligned_weight_pct: Number(alignedWeight.toFixed(2)),
      unsupported_weight_pct: Number(unsupportedWeight.toFixed(2)),
    },
    confidence_summary: {
      average_confidence_level:
        avgUserConfidence === null ? null : Number(avgUserConfidence.toFixed(2)),
      high_conflict_count: highConflictCount,
    },
    risk: {
      score: riskScore,
      level: riskLevel,
      recommendation,
      primary_risks: primaryRisks.slice(0, 4),
    },
    key_advice: keyAdvice,
    actions,
    rows,
  };
}
