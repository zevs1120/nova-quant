export default function DisciplineTab({
  discipline,
  engagementState,
  locale,
  markDailyCheckin,
  markBoundaryKept,
  markWrapUpComplete,
  markWeeklyReviewed,
  askAi,
}) {
  return (
    <section className="stack-gap">
      <article className="glass-card posture-card">
        <h3 className="card-title">Discipline Progress</h3>
        <p className="daily-brief-conclusion">
          {engagementState?.habit_state?.summary ||
            (locale.startsWith('zh')
              ? '你在训练的是判断节奏，不是交易频率。'
              : 'You are training decision rhythm, not trading frequency.')}
        </p>

        <div className="status-grid-3">
          <div className="status-box">
            <p className="muted">Daily Check-in</p>
            <h2>
              {discipline.checkinStreak}
              {locale.startsWith('zh') ? ' 天' : ' days'}
            </h2>
          </div>
          <div className="status-box">
            <p className="muted">Weekly Review</p>
            <h2>
              {discipline.weeklyStreak}
              {locale.startsWith('zh') ? ' 周' : ' weeks'}
            </h2>
          </div>
          <div className="status-box">
            <p className="muted">Risk Boundary</p>
            <h2>
              {discipline.boundaryStreak}
              {locale.startsWith('zh') ? ' 天' : ' days'}
            </h2>
          </div>
        </div>

        <ul className="bullet-list">
          <li>
            {engagementState?.daily_check_state?.headline ||
              (discipline.checkedToday
                ? locale.startsWith('zh')
                  ? '今天已完成判断校准。'
                  : 'Today\u2019s view has already been confirmed.'
                : locale.startsWith('zh')
                  ? '今天还未完成判断校准。'
                  : 'Today\u2019s view is still waiting for confirmation.')}
          </li>
          <li>
            {discipline.boundaryToday
              ? locale.startsWith('zh')
                ? '今天已确认风险边界。'
                : 'Today\u2019s risk boundary has been confirmed.'
              : locale.startsWith('zh')
                ? '今天还未确认风险边界。'
                : 'Today\u2019s risk boundary is still unconfirmed.'}
          </li>
          <li>
            {discipline.reviewedThisWeek
              ? locale.startsWith('zh')
                ? '本周复盘已完成。'
                : 'This week\u2019s review is complete.'
              : locale.startsWith('zh')
                ? '本周还未完成复盘。'
                : 'This week\u2019s review is still open.'}
          </li>
          {discipline.noActionValueLine ? <li>{discipline.noActionValueLine}</li> : null}
        </ul>

        <div className="action-row">
          <button type="button" className="primary-btn" onClick={markDailyCheckin}>
            {locale.startsWith('zh') ? '完成今日 Check-in' : 'Complete today\u2019s check-in'}
          </button>
          <button type="button" className="secondary-btn" onClick={markBoundaryKept}>
            {locale.startsWith('zh') ? '记录风险边界执行' : 'Record boundary discipline'}
          </button>
          <button type="button" className="secondary-btn" onClick={markWeeklyReviewed}>
            {locale.startsWith('zh') ? '标记本周复盘完成' : 'Mark weekly review done'}
          </button>
        </div>
      </article>

      {engagementState?.widget_summary ? (
        <article className="glass-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Widget Preview</h3>
              <p className="muted status-line">
                {locale.startsWith('zh')
                  ? '桌面和锁屏摘要会围绕判断，而不是围绕行情刺激。'
                  : 'Home and lock-screen summaries stay centered on judgment, not market stimulation.'}
              </p>
            </div>
          </div>
          <div className="status-grid-3">
            {Object.values(engagementState.widget_summary).map((widget) => (
              <div key={widget.kind} className="status-box widget-preview-box">
                <p className="muted">{widget.kind.replace(/_/g, ' ')}</p>
                <h2>{widget.title}</h2>
                <p className="muted status-line">{widget.subtitle}</p>
                {widget.spark ? (
                  <p className="status-line widget-spark-line">{widget.spark}</p>
                ) : null}
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {engagementState?.notification_center?.notifications?.length ? (
        <article className="glass-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Notification Preview</h3>
              <p className="muted status-line">
                {locale.startsWith('zh')
                  ? '这些消息的目的都是提醒你回来确认，而不是催你交易。'
                  : 'These messages invite a calm return to confirm, not a push to trade.'}
              </p>
            </div>
            <span className="badge badge-neutral">
              {engagementState.notification_center.active_count || 0}
            </span>
          </div>
          <div className="quick-access-list" style={{ marginTop: 8 }}>
            {engagementState.notification_center.notifications.slice(0, 4).map((item) => (
              <div key={item.id} className="quick-access-row notification-preview-row">
                <span className="quick-access-title">{item.title}</span>
                <span className="quick-access-desc">{item.body}</span>
                <span className="muted status-line notification-tone-line">{item.tone}</span>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {engagementState?.daily_wrap_up ? (
        <article className="glass-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{engagementState.daily_wrap_up.title}</h3>
              <p className="muted status-line">{engagementState.daily_wrap_up.headline}</p>
            </div>
            <span
              className={`badge ${engagementState.daily_wrap_up.completed ? 'badge-triggered' : 'badge-neutral'}`}
            >
              {engagementState.daily_wrap_up.short_label}
            </span>
          </div>
          {engagementState.daily_wrap_up.opening_line ? (
            <p className="status-line ritual-kicker">
              {engagementState.daily_wrap_up.opening_line}
            </p>
          ) : null}
          <p className="daily-brief-conclusion">{engagementState.daily_wrap_up.summary}</p>
          <ul className="bullet-list">
            {(engagementState.daily_wrap_up.lessons || []).map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>{engagementState.daily_wrap_up.tomorrow_watch}</li>
          </ul>
          <div className="action-row">
            <button type="button" className="primary-btn" onClick={markWrapUpComplete}>
              {locale.startsWith('zh') ? '完成今日复盘' : 'Complete today\u2019s wrap-up'}
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => askAi('What mattered most in today\u2019s wrap-up?')}
            >
              Ask Nova
            </button>
          </div>
        </article>
      ) : null}
    </section>
  );
}
