export default function SignalsExecutionPage() {
  return (
    <section className="page-grid two-up">
      <section className="panel">
        <div className="panel-header">
          <h3>Signals</h3>
          <span className="status-pill is-blue">Planned</span>
        </div>
        <ul className="bullet-list">
          <li>Current ranked action cards.</li>
          <li>Top symbols and confidence changes.</li>
          <li>Alpha overlay impact on confidence and sizing.</li>
          <li>Watch-only vs actionable segmentation.</li>
        </ul>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Execution</h3>
          <span className="status-pill is-red">Needs admin API</span>
        </div>
        <ul className="bullet-list">
          <li>Paper / live / shadow execution split.</li>
          <li>Kill-switch state and reconciliation errors.</li>
          <li>Provider health for Alpaca / Binance or future brokers.</li>
          <li>Manual intervention log for operator actions.</li>
        </ul>
      </section>
    </section>
  );
}
