const CATEGORY_GROUPS = [
  {
    key: 'group:review',
    title: 'Review',
    description: 'See your weekly recap and discipline progress.',
    items: [
      {
        key: 'weekly',
        title: 'Weekly Review',
        description: 'A calm weekly summary and next focus.'
      },
      {
        key: 'discipline',
        title: 'Discipline Progress',
        description: 'Check your daily rhythm and boundary habits.'
      }
    ]
  },
  {
    key: 'group:system',
    title: 'System',
    description: 'See signals, safety, performance, and data status.',
    items: [
      {
        key: 'signals',
        title: 'Signals',
        description: 'All strategy signals and why some were filtered.'
      },
      {
        key: 'performance',
        title: 'Performance',
        description: 'Paper, replay, and proof summaries.'
      },
      {
        key: 'safety',
        title: 'Safety',
        description: 'Today’s risk limits and safety notes.'
      },
      {
        key: 'data',
        title: 'Data Status',
        description: 'Freshness, coverage, and missing data checks.'
      }
    ]
  },
  {
    key: 'group:market',
    title: 'Market Notes',
    description: 'A simple place for broader market context.',
    items: [
      {
        key: 'insights',
        title: 'Insights',
        description: 'The background behind today’s view.'
      }
    ]
  },
  {
    key: 'group:settings',
    title: 'Settings',
    description: 'Change your mode and app preferences.',
    items: [
      {
        key: 'settings',
        title: 'Settings',
        description: 'Language, mode, and personal preferences.'
      }
    ]
  }
];

function extendGroups(uiMode) {
  if (uiMode !== 'advanced') return CATEGORY_GROUPS;
  return CATEGORY_GROUPS.map((group) =>
    group.key === 'group:settings'
      ? {
          ...group,
          items: [
            ...group.items,
            {
              key: 'advanced',
              title: 'Advanced',
              description: 'Deeper research and system details.'
            }
          ]
        }
      : group
  );
}

function sectionLabel(section, uiMode) {
  if (section === 'signals') return 'Signals';
  if (section === 'weekly') return 'Weekly Review';
  if (section === 'discipline') return 'Discipline Progress';
  if (section === 'performance') return 'Performance';
  if (section === 'safety') return 'Safety';
  if (section === 'insights') return 'Insights';
  if (section === 'data') return 'Data Status';
  if (section === 'settings') return 'Settings';
  if (section === 'advanced') return uiMode === 'advanced' ? 'Advanced' : 'Advanced';
  const group = extendGroups(uiMode).find((item) => item.key === section);
  return group?.title || 'More';
}

export default function MoreTab({
  section,
  onSectionChange,
  uiMode,
  discipline,
  engagement,
  appMeta,
  renderSection,
  investorDemoEnabled,
  onToggleDemo,
  onOpenAbout
}) {
  const groups = extendGroups(uiMode);
  const currentGroup = groups.find((item) => item.key === section);

  if (currentGroup) {
    return (
      <section className="stack-gap more-detail-screen">
        <p className="muted status-line more-detail-note">{currentGroup.description}</p>
        <article className="glass-card more-detail-card">
          <div className="quick-access-list">
            {currentGroup.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className="quick-access-row"
                onClick={() => onSectionChange(item.key)}
              >
                <span className="quick-access-title">{item.title}</span>
                <span className="quick-access-desc">{item.description}</span>
              </button>
            ))}
          </div>
        </article>
      </section>
    );
  }

  if (section !== 'menu') {
    return (
      <section className="stack-gap more-detail-screen">
        <p className="muted status-line more-detail-note">This stays in More so Today can stay focused on the decision itself.</p>
        {renderSection(section)}
      </section>
    );
  }

  return (
    <section className="stack-gap more-screen">
      <article className="glass-card more-overview-card">
        <p className="ritual-kicker">System surfaces</p>
        <div className="card-header">
          <div>
            <h3 className="card-title">More</h3>
            <p className="muted">Research, settings, and review live here so Today can stay brutally simple.</p>
          </div>
          <span className="badge badge-neutral">{uiMode}</span>
        </div>
      </article>

      <div className="more-list">
        <button type="button" className="more-list-row" onClick={() => onSectionChange('group:review')}>
          <span>
            <span className="quick-access-title">Review</span>
            <span className="quick-access-desc">Weekly recap &amp; discipline progress</span>
          </span>
          <span className="more-list-arrow">›</span>
        </button>
        <button type="button" className="more-list-row" onClick={() => onSectionChange('group:system')}>
          <span>
            <span className="quick-access-title">System</span>
            <span className="quick-access-desc">Signals, safety &amp; performance</span>
          </span>
          <span className="more-list-arrow">›</span>
        </button>
        <button type="button" className="more-list-row" onClick={() => onSectionChange('group:market')}>
          <span>
            <span className="quick-access-title">Market Notes</span>
            <span className="quick-access-desc">Broader market context</span>
          </span>
          <span className="more-list-arrow">›</span>
        </button>
        <button type="button" className="more-list-row" onClick={() => onSectionChange('settings')}>
          <span>
            <span className="quick-access-title">Settings</span>
            <span className="quick-access-desc">App preferences &amp; mode</span>
          </span>
          <span className="more-list-arrow">›</span>
        </button>
        <button type="button" className="more-list-row" onClick={onOpenAbout}>
          <span>
            <span className="quick-access-title">About</span>
            <span className="quick-access-desc">App info &amp; support</span>
          </span>
          <span className="more-list-arrow">›</span>
        </button>
        <button type="button" className="more-list-row" onClick={onToggleDemo}>
          <span>
            <span className="quick-access-title">Demo Mode</span>
            <span className="quick-access-desc">Reset demo data &amp; walkthrough</span>
          </span>
          <span className={`badge ${investorDemoEnabled ? 'badge-triggered' : 'badge-neutral'}`}>
            {investorDemoEnabled ? 'On' : 'Off'}
          </span>
        </button>
      </div>

      <article className="glass-card more-version-card">
        <div className="card-header">
          <div>
            <h3 className="card-title">NovaQuant</h3>
            <p className="muted">A decision surface first. Everything else exists to support that judgment.</p>
          </div>
          <span className="badge badge-neutral">{appMeta?.app_version_label || '--'}</span>
        </div>
        <p className="status-line more-version-line">
          Version {appMeta?.app_version || '--'}
          {appMeta?.build_number ? ` · Build ${appMeta.build_number}` : ''}
        </p>
      </article>

      <p className="muted status-line more-screen-meta">
        {engagement?.daily_check_state?.status === 'COMPLETED'
          ? 'Today already checked'
          : engagement?.daily_check_state?.status === 'REFRESH_REQUIRED'
            ? 'Today’s view changed'
            : 'Morning check pending'}{' '}
        · Check-in streak: {discipline?.checkinStreak || 0} days · Weekly review streak: {discipline?.weeklyStreak || 0} weeks
      </p>
    </section>
  );
}
