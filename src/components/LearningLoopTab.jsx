import { formatDateTime, formatNumber } from '../utils/format';
import { useControlPlaneStatus } from '../hooks/useControlPlaneStatus';

export default function LearningLoopTab({ data, locale, fetchJson, effectiveUserId }) {
  const runtime = data?.config?.runtime || {};
  const { controlPlane, loading: controlPlaneLoading } = useControlPlaneStatus({
    data,
    fetchJson,
    effectiveUserId,
  });
  const flywheel = controlPlane?.flywheel || null;
  const latestDataRun = flywheel?.free_data?.recent_runs?.[0] || null;
  const latestEvolutionRun = flywheel?.evolution?.recent_runs?.[0] || null;
  const recentNews = Array.isArray(flywheel?.free_data?.recent_news)
    ? flywheel.free_data.recent_news
    : [];
  const recentActivity = Array.isArray(flywheel?.recent_activity) ? flywheel.recent_activity : [];
  const currentDatasetCount = Number(flywheel?.training?.current_dataset_count || 0);
  const minimumTrainingRows = Number(flywheel?.training?.minimum_training_rows || 0);
  const isZh = locale?.startsWith('zh');

  if (!flywheel) {
    return (
      <section className="stack-gap">
        <article className="glass-card">
          <h3 className="card-title">Learning Loop</h3>
          <p className="muted status-line">
            {controlPlaneLoading
              ? isZh
                ? '学习飞轮状态正在按需加载。'
                : 'Learning loop status is loading on demand.'
              : isZh
                ? '学习飞轮状态暂时不可用，请先让后端完成一轮 control-plane 刷新。'
                : 'Learning loop status is not available yet.'}
          </p>
        </article>
      </section>
    );
  }

  return (
    <section className="stack-gap">
      <article className="glass-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Learning Loop</h3>
            <p className="muted status-line">
              {isZh ? '最近活跃时间' : 'Last activity'}:{' '}
              {formatDateTime(flywheel.last_activity_at, locale)}
            </p>
          </div>
          <span
            className={`badge ${flywheel.training?.ready_for_training ? 'badge-triggered' : 'badge-neutral'}`}
          >
            {flywheel.training?.ready_for_training
              ? isZh
                ? '可训练'
                : 'Training Ready'
              : isZh
                ? '积累中'
                : 'Accumulating'}
          </span>
        </div>

        <div className="status-grid-3" style={{ marginTop: 10 }}>
          <div className="status-box">
            <p className="muted">Free Data</p>
            <h2>{flywheel.free_data?.latest_status || '--'}</h2>
            <p className="muted status-line">
              {formatDateTime(flywheel.free_data?.latest_run_at, locale)}
            </p>
          </div>
          <div className="status-box">
            <p className="muted">Evolution</p>
            <h2>{flywheel.evolution?.latest_status || '--'}</h2>
            <p className="muted status-line">
              {formatDateTime(flywheel.evolution?.latest_run_at, locale)}
            </p>
          </div>
          <div className="status-box">
            <p className="muted">Training Samples</p>
            <h2>{formatNumber(currentDatasetCount, 0, locale)}</h2>
            <p className="muted status-line">
              {isZh ? '门槛' : 'Threshold'} {formatNumber(minimumTrainingRows, 0, locale)}
            </p>
          </div>
        </div>

        <ul className="bullet-list" style={{ marginTop: 12 }}>
          <li>
            {isZh
              ? `最近一次免费数据刷新处理了 ${formatNumber(latestDataRun?.crypto_structure?.symbols_processed || 0, 0, locale)} 个 crypto 标的，并刷新了 ${formatNumber(latestDataRun?.news?.refreshed_symbols || 0, 0, locale)} 个新闻符号。`
              : `The latest free-data cycle touched ${formatNumber(latestDataRun?.crypto_structure?.symbols_processed || 0, 0, locale)} crypto symbols and refreshed ${formatNumber(latestDataRun?.news?.refreshed_symbols || 0, 0, locale)} news symbols.`}
          </li>
          <li>
            {isZh
              ? `最近一次演化周期：升级 ${formatNumber(latestEvolutionRun?.promoted_count || 0, 0, locale)} 个，回滚 ${formatNumber(latestEvolutionRun?.rollback_count || 0, 0, locale)} 个，safe mode ${formatNumber(latestEvolutionRun?.safe_mode_count || 0, 0, locale)} 个。`
              : `The latest evolution cycle promoted ${formatNumber(latestEvolutionRun?.promoted_count || 0, 0, locale)}, rolled back ${formatNumber(latestEvolutionRun?.rollback_count || 0, 0, locale)}, and placed ${formatNumber(latestEvolutionRun?.safe_mode_count || 0, 0, locale)} markets in safe mode.`}
          </li>
          <li>
            {isZh
              ? `最近一次训练飞轮样本数是 ${formatNumber(currentDatasetCount, 0, locale)}，执行状态：${flywheel.training?.latest_execution_reason || '未执行'}。`
              : `The latest training flywheel saw ${formatNumber(currentDatasetCount, 0, locale)} samples. Execution status: ${flywheel.training?.latest_execution_reason || 'not executed'}.`}
          </li>
        </ul>
      </article>

      {recentActivity.length ? (
        <article className="glass-card">
          <h3 className="card-title">Recent Loop Activity</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workflow</th>
                  <th>Status</th>
                  <th>Detail</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.map((row) => (
                  <tr key={`${row.workflow_key}-${row.updated_at}`}>
                    <td>{row.label}</td>
                    <td>{row.status}</td>
                    <td>{row.detail}</td>
                    <td>{formatDateTime(row.updated_at, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      <article className="glass-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Recent Data Intake</h3>
            <p className="muted status-line">
              {isZh
                ? '看最近抓到了哪些免费数据。'
                : 'See what the backend has pulled most recently.'}
            </p>
          </div>
          <span className="badge badge-neutral">{latestDataRun?.trigger_type || '--'}</span>
        </div>

        <div className="status-grid-3" style={{ marginTop: 10 }}>
          <div className="status-box">
            <p className="muted">News Refreshed</p>
            <h2>{formatNumber(latestDataRun?.news?.refreshed_symbols || 0, 0, locale)}</h2>
            <p className="muted status-line">
              {formatNumber(latestDataRun?.news?.rows_upserted || 0, 0, locale)} rows
            </p>
          </div>
          <div className="status-box">
            <p className="muted">Funding Points</p>
            <h2>{formatNumber(latestDataRun?.crypto_structure?.funding_points || 0, 0, locale)}</h2>
            <p className="muted status-line">
              {formatNumber(
                latestDataRun?.crypto_structure?.latest_funding_symbols || 0,
                0,
                locale,
              )}{' '}
              symbols
            </p>
          </div>
          <div className="status-box">
            <p className="muted">Basis Points</p>
            <h2>{formatNumber(latestDataRun?.crypto_structure?.basis_points || 0, 0, locale)}</h2>
            <p className="muted status-line">
              {formatNumber(latestDataRun?.crypto_structure?.latest_basis_symbols || 0, 0, locale)}{' '}
              symbols
            </p>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Headline</th>
                <th>Source</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {recentNews.length ? (
                recentNews.map((row) => (
                  <tr key={row.id}>
                    <td>{row.symbol}</td>
                    <td>{row.headline}</td>
                    <td>{row.source}</td>
                    <td>{formatDateTime(row.published_at, locale)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">
                    {isZh ? '暂时还没有最近抓取的新闻记录。' : 'No recent news rows yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="glass-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Recent Evolution</h3>
            <p className="muted status-line">
              {isZh
                ? '看系统最近如何调整 champion / challenger。'
                : 'See how the system recently adjusted champions and challengers.'}
            </p>
          </div>
          <span className="badge badge-neutral">{latestEvolutionRun?.trigger_type || '--'}</span>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Summary</th>
                <th>Champion</th>
                <th>Challenger</th>
              </tr>
            </thead>
            <tbody>
              {latestEvolutionRun?.markets?.length ? (
                latestEvolutionRun.markets.map((row) => (
                  <tr key={`${latestEvolutionRun.id}-${row.market}`}>
                    <td>{row.market}</td>
                    <td>{row.summary || '--'}</td>
                    <td>{row.active_model_id || '--'}</td>
                    <td>{row.challenger_model_id || '--'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">
                    {isZh ? '暂时没有最近演化记录。' : 'No recent evolution rows yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="glass-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">Training Readiness</h3>
            <p className="muted status-line">
              {isZh
                ? '这里会告诉你系统是不是已经真的开始训练。'
                : 'This tells you whether the system has started training for real.'}
            </p>
          </div>
          <span
            className={`badge ${flywheel.training?.ready_for_training ? 'badge-triggered' : 'badge-neutral'}`}
          >
            {flywheel.training?.latest_status || '--'}
          </span>
        </div>

        <div className="status-grid-3" style={{ marginTop: 10 }}>
          <div className="status-box">
            <p className="muted">Sample Count</p>
            <h2>{formatNumber(currentDatasetCount, 0, locale)}</h2>
            <p className="muted status-line">{flywheel.training?.current_dataset_source || '--'}</p>
          </div>
          <div className="status-box">
            <p className="muted">Execution</p>
            <h2>{flywheel.training?.latest_execution_success ? 'SUCCESS' : 'WAIT'}</h2>
            <p className="muted status-line">
              {flywheel.training?.latest_execution_reason || '--'}
            </p>
          </div>
          <div className="status-box">
            <p className="muted">Task Types</p>
            <h2>{formatNumber(flywheel.training?.task_types?.length || 0, 0, locale)}</h2>
            <p className="muted status-line">
              {formatDateTime(flywheel.training?.latest_run_at, locale)}
            </p>
          </div>
        </div>

        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Trainer</th>
                <th>Samples</th>
                <th>Execution</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {(flywheel.training?.recent_runs || []).length ? (
                flywheel.training.recent_runs.map((row) => (
                  <tr key={row.id}>
                    <td>{row.status}</td>
                    <td>{row.trainer || '--'}</td>
                    <td>{formatNumber(row.dataset_count || 0, 0, locale)}</td>
                    <td>{row.execution?.reason || '--'}</td>
                    <td>{formatDateTime(row.updated_at, locale)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5">
                    {isZh ? '暂时没有训练飞轮记录。' : 'No training flywheel runs yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
