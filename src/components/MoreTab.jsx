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
  renderSection,
  investorDemoEnabled,
  onToggleDemo,
  onOpenAbout
}) {
  const groups = extendGroups(uiMode);
  const currentGroup = groups.find((item) => item.key === section);

  if (currentGroup) {
    return (
      <section className="stack-gap">
        <article className="glass-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{currentGroup.title}</h3>
              <p className="muted">{currentGroup.description}</p>
            </div>
            <button type="button" className="ghost-btn" onClick={() => onSectionChange('menu')}>
              ← Back
            </button>
          </div>
        </article>

        <article className="glass-card">
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
      <section className="stack-gap">
        <article className="glass-card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{sectionLabel(section, uiMode)}</h3>
              <p className="muted">This stays in More so the main tabs remain simple.</p>
            </div>
            <button type="button" className="ghost-btn" onClick={() => onSectionChange('menu')}>
              ← Back
            </button>
          </div>
        </article>
        {renderSection(section)}
      </section>
    );
  }

  return (
    <section className="stack-gap">
      <article className="glass-card">
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

        <p className="muted status-line">
          Check-in streak: {discipline?.checkinStreak || 0} days · Weekly review streak: {discipline?.weeklyStreak || 0} weeks
        </p>
      </article>
    </section>
  );
}
