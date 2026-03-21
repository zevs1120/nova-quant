export default function SignalsExecutionPage() {
  return (
    <section className="page-grid two-up">
      <section className="panel">
        <div className="panel-header">
          <h3>信号视图</h3>
          <span className="status-pill is-blue">规划中</span>
        </div>
        <ul className="bullet-list">
          <li>当前排序后的行动卡片。</li>
          <li>重点标的与置信度变化。</li>
          <li>Alpha overlay 对置信度和仓位的影响。</li>
          <li>仅观察与可执行信号的分层。</li>
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>执行视图</h3>
          <span className="status-pill is-red">需要管理 API</span>
        </div>
        <ul className="bullet-list">
          <li>Paper / Live / Shadow 执行拆分。</li>
          <li>Kill switch 状态与对账错误。</li>
          <li>Alpaca、Binance 与未来券商的连接健康。</li>
          <li>人工干预与运营操作日志。</li>
        </ul>
      </section>
    </section>
  );
}
