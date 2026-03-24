const CATEGORY_GROUPS = [
  {
    key: 'group:review',
    title: 'Review',
    description: 'See your weekly recap and discipline progress.',
    items: [
      {
        key: 'weekly',
        title: 'Weekly Review',
        description: 'A calm weekly summary and next focus.',
      },
      {
        key: 'discipline',
        title: 'Discipline Progress',
        description: 'Check your daily rhythm and boundary habits.',
      },
    ],
  },
  {
    key: 'group:system',
    title: 'System',
    description: 'See signals, safety, performance, and data status.',
    items: [
      {
        key: 'signals',
        title: 'Signals',
        description: 'All strategy signals and why some were filtered.',
      },
      {
        key: 'performance',
        title: 'Performance',
        description: 'Paper, replay, and proof summaries.',
      },
      {
        key: 'safety',
        title: 'Safety',
        description: 'Today’s risk limits and safety notes.',
      },
      {
        key: 'data',
        title: 'Data Status',
        description: 'Freshness, coverage, and missing data checks.',
      },
    ],
  },
  {
    key: 'group:market',
    title: 'Market Notes',
    description: 'A simple place for broader market context.',
    items: [
      {
        key: 'insights',
        title: 'Insights',
        description: 'The background behind today’s view.',
      },
    ],
  },
  {
    key: 'group:settings',
    title: 'Settings',
    description: 'Change your mode and app preferences.',
    items: [
      {
        key: 'settings',
        title: 'Settings',
        description: 'Language, mode, and personal preferences.',
      },
    ],
  },
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
              description: 'Deeper research and system details.',
            },
          ],
        }
      : group,
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
  onOpenAbout,
}) {
  const groups = extendGroups(uiMode);
  const currentGroup = groups.find((item) => item.key === section);

  if (currentGroup) {
    return (
      <section className="stack-gap more-detail-screen more-native-screen">
        <div className="more-group-header">
          <p className="more-group-title">{currentGroup.title}</p>
          <p className="more-group-caption">{currentGroup.description}</p>
        </div>
        <div className="more-group-list">
          {currentGroup.items.map((item) => (
            <button
              key={item.key}
              type="button"
              className="more-list-row more-native-row"
              onClick={() => onSectionChange(item.key)}
            >
              <span>
                <span className="quick-access-title">{item.title}</span>
                <span className="quick-access-desc">{item.description}</span>
              </span>
              <span className="more-list-arrow">›</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (section !== 'menu') {
    return (
      <section className="stack-gap more-detail-screen more-native-screen">
        <p className="muted status-line more-detail-note">
          This stays in More so Today can stay focused on the decision itself.
        </p>
        {renderSection(section)}
      </section>
    );
  }

  return (
    <section className="stack-gap more-screen more-native-screen">
      {groups.map((group) => (
        <section key={group.key} className="more-group">
          <div className="more-group-header">
            <p className="more-group-title">{group.title}</p>
            <p className="more-group-caption">{group.description}</p>
          </div>
          <div className="more-group-list">
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                className="more-list-row more-native-row"
                onClick={() => onSectionChange(item.key)}
              >
                <span>
                  <span className="quick-access-title">{item.title}</span>
                  <span className="quick-access-desc">{item.description}</span>
                </span>
                <span className="more-list-arrow">›</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="more-group">
        <div className="more-group-header">
          <p className="more-group-title">App</p>
          <p className="more-group-caption">Info, demo tools, and app version.</p>
        </div>
        <div className="more-group-list">
          <button type="button" className="more-list-row more-native-row" onClick={onOpenAbout}>
            <span>
              <span className="quick-access-title">About</span>
              <span className="quick-access-desc">App info and support</span>
            </span>
            <span className="more-list-arrow">›</span>
          </button>
          <button type="button" className="more-list-row more-native-row" onClick={onToggleDemo}>
            <span>
              <span className="quick-access-title">Demo Mode</span>
              <span className="quick-access-desc">Investor walkthrough and sample data</span>
            </span>
            <span className={`badge ${investorDemoEnabled ? 'badge-triggered' : 'badge-neutral'}`}>
              {investorDemoEnabled ? 'On' : 'Off'}
            </span>
          </button>
        </div>
      </section>

      <div className="more-version-inline">
        <span>NovaQuant {appMeta?.app_version || '--'}</span>
        {appMeta?.build_number ? <span>Build {appMeta.build_number}</span> : null}
      </div>

      <p className="muted status-line more-screen-meta">
        {engagement?.daily_check_state?.status === 'COMPLETED'
          ? 'Today already checked'
          : engagement?.daily_check_state?.status === 'REFRESH_REQUIRED'
            ? 'Today’s view changed'
            : 'Morning check pending'}{' '}
        · Check-in streak: {discipline?.checkinStreak || 0} days · Weekly review streak:{' '}
        {discipline?.weeklyStreak || 0} weeks
      </p>
    </section>
  );
}
