import { formatDateTime } from '../utils/format';

export default function AboutModal({ open, onClose, config, t, locale }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="card-header">
          <h3 className="card-title">{t('about.title')}</h3>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <p className="muted">{t('about.disclaimer', undefined, config.disclaimer)}</p>
        <p className="status-line">
          {locale?.startsWith('zh')
            ? '一个把“今天该不该动”压缩成清晰判断的 AI 决策系统。'
            : 'An AI decision system built to reduce the day to one clear judgment.'}
        </p>
        <div className="detail-list">
          <div className="detail-row">
            <span className="detail-label">{t('about.team')}</span>
            <span className="detail-value">{config.team}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">{t('about.appVersion')}</span>
            <span className="detail-value">{config.app_version}</span>
          </div>
          {config.build_number ? (
            <div className="detail-row">
              <span className="detail-label">Build</span>
              <span className="detail-value">{config.build_number}</span>
            </div>
          ) : null}
          <div className="detail-row">
            <span className="detail-label">{t('about.dataUpdated')}</span>
            <span className="detail-value">{formatDateTime(config.last_updated, locale)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
