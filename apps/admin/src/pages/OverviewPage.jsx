import StatCard from '../components/StatCard';

const stats = [
  {
    label: '主后台域名',
    value: 'admin.novaquant.cloud',
    detail: '与用户前台独立部署、独立访问。',
    tone: 'blue'
  },
  {
    label: '后台算力',
    value: 'EC2 + Marvix',
    detail: 'Worker、发现循环、数据任务和私有运维仍在 EC2 上运行。',
    tone: 'green'
  },
  {
    label: '晋升护栏',
    value: 'SHADOW → CANARY',
    detail: '不会自动直接推到正式生产。',
    tone: 'amber'
  },
  {
    label: '管理员认证',
    value: '已启用',
    detail: '独立 admin session 与角色校验已接入。',
    tone: 'green'
  }
];

export default function OverviewPage() {
  return (
    <section className="page-grid">
      <div className="stats-grid">
        {stats.map((item) => (
          <StatCard key={item.label} {...item} />
        ))}
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>后台一期定位</h3>
          <span className="status-pill is-blue">第一阶段</span>
        </div>
        <ul className="bullet-list">
          <li>用户前台和管理后台保持独立子域名。</li>
          <li>管理后台读取管理员 API，不直接暴露仅限本机的 EC2 私有接口。</li>
          <li>Alpha 生命周期与 Shadow 指标只放在后台，不进入公开产品界面。</li>
          <li>EC2 继续负责计算与任务，Vercel 继续负责交付前端。</li>
        </ul>
      </section>
    </section>
  );
}
