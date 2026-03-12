import { useMemo } from 'react';
import { formatNumber, formatPercent } from '../utils/format';

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function topFrequency(items = [], topN = 3) {
  const map = {};
  for (const item of items) {
    map[item] = (map[item] || 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name, count]) => ({ name, count }));
}

function weeklyPaperReturn(equityCurve = []) {
  if (!equityCurve.length) return null;
  const recent = equityCurve.slice(-6);
  const first = Number(recent[0]?.equity || 0);
  const last = Number(recent[recent.length - 1]?.equity || 0);
  if (!first || !last) return null;
  return last / first - 1;
}

export default function WeeklyReviewTab({
  research,
  today,
  safety,
  insights,
  signals,
  uiMode,
  locale,
  discipline,
  onMarkReviewed,
  onExplain
}) {
  const snapshots = research?.daily_snapshots || [];
  const week = snapshots.slice(-5);
  const diagnostics = research?.diagnostics || {};
  const paper = research?.champion?.paper || {};
  const weeklySystemReview = research?.weekly_system_review || {};

  const weekly = useMemo(() => {
    if (!week.length) {
      return {
        summary: '本周复盘数据还不完整，先保持风险纪律。',
        dominantRegime: '--',
        avgSafety: null,
        avgSelected: null,
        avgFiltered: null,
        topSelected: [],
        topFiltered: [],
        avoidBehavior: '避免在证据不足时硬做第二笔。',
        nextFocus: '--',
        paperRet: null
      };
    }

    const avgSafety = mean(week.map((row) => row.safety_score));
    const avgSelected = mean(week.map((row) => (row.selected_opportunities || []).length));
    const avgFiltered = mean(week.map((row) => (row.filtered_opportunities || []).length));
    const topSelected = topFrequency(week.flatMap((row) => row.selected_opportunities || []), 3);
    const topFiltered = topFrequency(week.flatMap((row) => row.filtered_opportunities || []), 3);
    const dominantRegime = topFrequency(week.map((row) => row.market_regime), 1)[0]?.name || '--';
    const paperRet = weeklyPaperReturn(paper.equity_curve || []);

    const avoidBehavior =
      diagnostics?.top_failure_reasons?.[0]?.reason ||
      '追高和重复加仓';

    let summary = '这周最有价值的不是抓更多机会，而是把低质量动作挡在了门外。';
    if (avgSafety <= 50) {
      summary = '这周系统最有价值的是帮你少做了高风险动作，而不是多做交易。';
    } else if (avgSelected >= 2.5) {
      summary = '这周可执行窗口较多，但最关键仍是只做高质量机会。';
    }

    const nextFocus =
      weeklySystemReview?.interesting_challengers?.[0]?.challenger_id ||
      (signals || []).find((item) => ['NEW', 'TRIGGERED'].includes(String(item.status)))?.symbol ||
      '--';

    return {
      summary,
      dominantRegime,
      avgSafety,
      avgSelected,
      avgFiltered,
      topSelected,
      topFiltered,
      avoidBehavior,
      nextFocus,
      paperRet
    };
  }, [diagnostics?.top_failure_reasons, paper.equity_curve, signals, week, weeklySystemReview?.interesting_challengers]);

  const growthFeedback =
    discipline?.checkinStreak >= 7
      ? '你已经连续完成 check-in，这比频繁交易更有价值。'
      : '先把 daily check-in 稳定下来，收益会更可持续。';

  return (
    <section className="stack-gap">
      <article className="glass-card posture-card hero-call-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Weekly Review</h3>
            <p className="muted">周度奖励不是“交易更多”，而是“更少犯错”。</p>
          </div>
          <span className="badge badge-neutral">sample + simulated</span>
        </div>

        <p className="daily-brief-conclusion">{weekly.summary}</p>

        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">本周环境</p>
            <h2>{weekly.dominantRegime}</h2>
          </div>
          <div className="status-box">
            <p className="muted">平均安全分</p>
            <h2>{formatNumber(weekly.avgSafety, 1, locale)}</h2>
          </div>
          <div className="status-box">
            <p className="muted">Paper 周回报</p>
            <h2>{formatPercent(weekly.paperRet, 2, true)}</h2>
          </div>
        </div>

        <div className="action-row">
          <button type="button" className="primary-btn" onClick={onMarkReviewed}>
            {discipline?.reviewedThisWeek ? '本周复盘已完成' : '标记本周复盘完成'}
          </button>
          <button type="button" className="secondary-btn" onClick={() => onExplain?.('给我一句下周执行纪律建议。')}>
            Ask AI
          </button>
        </div>
      </article>

      <article className="glass-card">
        <h3 className="card-title">本周市场环境</h3>
        <ul className="bullet-list">
          <li>Regime: {insights?.regime?.tag || '--'}。</li>
          <li>系统本周平均每天筛出 {formatNumber(weekly.avgSelected, 1, locale)} 个机会，过滤 {formatNumber(weekly.avgFiltered, 1, locale)} 个。</li>
          <li>当前风格提示: {today?.style_hint || '--'}，风险模式: {safety?.mode || '--'}。</li>
        </ul>
      </article>

      <article className="glass-card">
        <h3 className="card-title">哪类机会有效 / 无效</h3>
        <div className="weekly-grid">
          <div className="status-box">
            <p className="muted">更有效</p>
            <ul className="bullet-list">
              {weekly.topSelected.length ? weekly.topSelected.map((item) => (
                <li key={item.name}>{item.name}（{item.count} 天）</li>
              )) : <li>本周没有明显稳定优胜类目。</li>}
            </ul>
          </div>
          <div className="status-box">
            <p className="muted">更应回避</p>
            <ul className="bullet-list">
              {weekly.topFiltered.length ? weekly.topFiltered.map((item) => (
                <li key={item.name}>{item.name}（{item.count} 天）</li>
              )) : <li>过滤样本不足，继续观察。</li>}
            </ul>
          </div>
        </div>
      </article>

      <article className="glass-card">
        <h3 className="card-title">你最该避免的行为</h3>
        <p className="daily-brief-conclusion">下周最该避免的仍然是：{weekly.avoidBehavior}。</p>
        <p className="muted status-line">你的最大风险通常不是错过机会，而是仓位节奏失控。</p>
      </article>

      <article className="glass-card one-reco-card">
        <h3 className="card-title">下周只盯一个方向</h3>
        <p className="daily-brief-conclusion">{weekly.nextFocus}</p>
        <p className="muted status-line">只保留一个主重点，能显著降低冲动交易概率。</p>
      </article>

      <article className="glass-card">
        <h3 className="card-title">成长反馈</h3>
        <ul className="bullet-list">
          <li>{growthFeedback}</li>
          <li>当前 daily check-in 连续: {discipline?.checkinStreak || 0} 天。</li>
          <li>当前 weekly review 连续: {discipline?.weeklyStreak || 0} 周。</li>
          <li>你在建立“先判断再行动”的节奏，这比短期收益更稀缺。</li>
        </ul>
      </article>

      {uiMode === 'advanced' ? (
        <article className="glass-card">
          <h3 className="card-title">Weekly Snapshot Table (Advanced)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Regime</th>
                  <th>Safety</th>
                  <th>Gross / Net</th>
                  <th>Selected</th>
                  <th>Filtered</th>
                </tr>
              </thead>
              <tbody>
                {week.slice().reverse().map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.market_regime}</td>
                    <td>{formatNumber(row.safety_score, 1, locale)}</td>
                    <td>{row.suggested_exposure?.gross}% / {row.suggested_exposure?.net}%</td>
                    <td>{row.selected_opportunities?.length || 0}</td>
                    <td>{row.filtered_opportunities?.length || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
