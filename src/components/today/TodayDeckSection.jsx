import '../../styles/today-deck.css';

function TodayDeckCard({
  card,
  index,
  locale,
  watchlistSymbols,
  usageGuideStep,
  onOpenMembershipPrompt,
  onOpenSignalDetail,
  onSaveSignalToWatchlist,
  renderValidityPill,
  hiddenDeckCount,
  todayCardLimit,
}) {
  const cardSymbol = String(card?.signal?.symbol || '')
    .trim()
    .toUpperCase();
  const isSaved = cardSymbol ? watchlistSymbols.includes(cardSymbol) : false;
  const disclosure =
    locale === 'zh'
      ? '模型生成的市场情报；不是券商订单。行动前请核对价格、流动性、风险和自身适合度。'
      : 'Model-generated market intelligence; not a broker order. Verify price, liquidity, risk, and suitability before acting.';

  return (
    <article
      key={card.id}
      className={`${card.kind === 'lock' ? 'today-stack-card today-stack-card-lock' : `today-stack-card today-rebuild-card today-rebuild-card-${card.palette}`} ${
        usageGuideStep === 'tap' && index === 0 && card.kind !== 'lock'
          ? 'is-usage-guide-target'
          : ''
      }`}
      data-visual={card.visual}
      style={{
        '--stack-index': `${index}`,
        '--stack-z': `${index + 1}`,
        ...(card.themeStyle || {}),
      }}
      onClick={() => {
        if (card.kind === 'lock') {
          onOpenMembershipPrompt?.('today_locked', {
            freeCardLimit: todayCardLimit || 3,
            hiddenDeckCount,
          });
          return;
        }
        onOpenSignalDetail(card.signal, card.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (card.kind === 'lock') {
            onOpenMembershipPrompt?.('today_locked', {
              freeCardLimit: todayCardLimit || 3,
              hiddenDeckCount,
            });
            return;
          }
          onOpenSignalDetail(card.signal, card.id);
        }
      }}
    >
      {card.kind === 'lock' ? (
        <>
          <p className="today-rebuild-card-kicker">{card.kicker}</p>
          <h2 className="today-rebuild-card-title">{card.title}</h2>
          <div className="today-rebuild-card-footer">
            <p className="today-rebuild-card-note">{card.note}</p>
          </div>
        </>
      ) : (
        <>
          <div className="today-rebuild-card-head">
            <div className="today-rebuild-card-copy">
              <p className="today-rebuild-card-kicker">{card.kicker}</p>
              <div className="today-rebuild-card-title-row">
                <h2 className="today-rebuild-card-title">{card.signal?.symbol || '--'}</h2>
                <button
                  type="button"
                  className={`today-rebuild-watchlist-button ${isSaved ? 'is-saved' : ''}`}
                  data-gesture-ignore="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSaveSignalToWatchlist(card.signal);
                  }}
                >
                  {isSaved
                    ? locale === 'zh'
                      ? '已加'
                      : 'Saved'
                    : locale === 'zh'
                      ? '+ 观察'
                      : '+ Watchlist'}
                </button>
              </div>
            </div>
            <div className="today-rebuild-card-pills">
              <span className={`today-rebuild-card-chip today-rebuild-card-chip-${card.tone}`}>
                {card.chipLabel}
              </span>
              {renderValidityPill(card.signal)}
            </div>
          </div>

          <div className="today-rebuild-art" aria-hidden="true">
            <span className="today-rebuild-art-ring" />
            <span className="today-rebuild-art-orb" />
            <span className="today-rebuild-art-trace" />
          </div>

          <div className="today-rebuild-card-footer">
            <p className="today-rebuild-card-subtitle">{card.subtitle}</p>
            {Array.isArray(card.executionItems) && card.executionItems.length ? (
              <div className="today-rebuild-card-metrics" aria-label="Execution summary">
                {card.executionItems.map((item) => (
                  <div key={item.label} className="today-rebuild-card-metric">
                    <span className="today-rebuild-card-metric-label">{item.label}</span>
                    <span className="today-rebuild-card-metric-value">{item.value}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {card.note ? <p className="today-rebuild-card-note">{card.note}</p> : null}
            <p className="today-rebuild-card-disclosure">{disclosure}</p>
          </div>
        </>
      )}
    </article>
  );
}

function TodayDeckEmptyState({
  hiddenDeckCount,
  locale,
  todayCardLimit,
  onOpenMembershipPrompt,
  onAskAi,
  triggerFeedback,
  askPrompt,
}) {
  if (hiddenDeckCount > 0) {
    return (
      <article className="today-rebuild-empty">
        <p className="today-rebuild-card-kicker">{locale === 'zh' ? 'Membership' : 'Membership'}</p>
        <h2 className="today-rebuild-empty-title">
          {locale === 'zh'
            ? `解锁剩余 ${hiddenDeckCount} 张 Today 卡片`
            : `Unlock ${hiddenDeckCount} more Today cards`}
        </h2>
        <p className="today-rebuild-empty-copy">
          {locale === 'zh'
            ? `免费版今天先看前 ${todayCardLimit || 3} 张。升级 Lite 继续浏览完整队列，并保留 Keep your broker 路径。`
            : `Free includes the first ${todayCardLimit || 3} cards. Upgrade to Lite to keep the full queue and broker handoff ready.`}
        </p>
        <div className="today-rebuild-empty-actions">
          <button
            type="button"
            className="today-rebuild-lock-cta"
            onClick={() =>
              onOpenMembershipPrompt?.('today_locked', {
                freeCardLimit: todayCardLimit || 3,
                hiddenDeckCount,
              })
            }
          >
            {locale === 'zh' ? '升级 Lite' : 'Start Lite'}
          </button>
          <button
            type="button"
            className="today-rebuild-ghost-cta"
            onClick={() =>
              onOpenMembershipPrompt?.('today_locked', {
                freeCardLimit: todayCardLimit || 3,
                hiddenDeckCount,
              })
            }
          >
            {locale === 'zh' ? '查看计划' : 'See plans'}
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="today-rebuild-empty">
      <p className="today-rebuild-card-kicker">{locale === 'zh' ? 'Action Card' : 'Action Card'}</p>
      <h2 className="today-rebuild-empty-title">
        {locale === 'zh' ? '当前没有更多标的卡片' : 'No more cards right now'}
      </h2>
      <p className="today-rebuild-empty-copy">
        {locale === 'zh'
          ? '这一轮队列已经处理完了。你可以去 Ask Nova 追问，或等待下一次系统快照。'
          : 'This queue is done for now. Ask Nova for context or wait for the next system snapshot.'}
      </p>
      <div className="today-rebuild-empty-actions">
        <button
          type="button"
          className="today-rebuild-lock-cta"
          data-gesture-ignore="true"
          onClick={() => {
            triggerFeedback('soft');
            onAskAi?.(askPrompt, {
              page: 'today',
              focus: 'restraint',
            });
          }}
        >
          <span>Ask Nova</span>
        </button>
      </div>
    </article>
  );
}

export default function TodayDeckSection({
  analyticsCards,
  walletCards,
  hiddenDeckCount,
  locale,
  watchlistSymbols,
  usageGuideStep,
  guideCopy,
  isPreviewOpen,
  onOpenMembershipPrompt,
  onOpenSignalDetail,
  onSaveSignalToWatchlist,
  renderValidityPill,
  onCompleteUsageGuide,
  todayCardLimit,
  onAskAi,
  triggerFeedback,
  askPrompt,
}) {
  return (
    <>
      <section className="today-rebuild-stack">
        <div className="today-rebuild-deck">
          {analyticsCards.length ? (
            <div className="today-stack-list" role="list" aria-label="Today action cards">
              {walletCards.map((card, index) => (
                <TodayDeckCard
                  key={card.id}
                  card={card}
                  index={index}
                  locale={locale}
                  watchlistSymbols={watchlistSymbols}
                  usageGuideStep={usageGuideStep}
                  onOpenMembershipPrompt={onOpenMembershipPrompt}
                  onOpenSignalDetail={onOpenSignalDetail}
                  onSaveSignalToWatchlist={onSaveSignalToWatchlist}
                  renderValidityPill={renderValidityPill}
                  hiddenDeckCount={hiddenDeckCount}
                  todayCardLimit={todayCardLimit}
                />
              ))}
            </div>
          ) : (
            <TodayDeckEmptyState
              hiddenDeckCount={hiddenDeckCount}
              locale={locale}
              todayCardLimit={todayCardLimit}
              onOpenMembershipPrompt={onOpenMembershipPrompt}
              onAskAi={onAskAi}
              triggerFeedback={triggerFeedback}
              askPrompt={askPrompt}
            />
          )}
        </div>
      </section>

      {usageGuideStep === 'tap' && !isPreviewOpen ? (
        <div className="today-usage-guide today-usage-guide-stack">
          <div className="today-usage-guide-panel" data-gesture-ignore="true">
            <p className="today-usage-guide-kicker">{guideCopy.tapHint}</p>
            <h3 className="today-usage-guide-title">{guideCopy.tapTitle}</h3>
            <p className="today-usage-guide-copy">{guideCopy.tapBody}</p>
            <button type="button" className="today-usage-guide-skip" onClick={onCompleteUsageGuide}>
              {guideCopy.skip}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
