export const PLANNED_ADMIN_APIS = [
  {
    route: '/api/admin/session',
    purpose: '管理员会话与角色校验',
    status: '已完成',
  },
  {
    route: '/api/admin/overview',
    purpose: '核心指标、Alpha 生命周期统计、运行健康',
    status: '待开发',
  },
  {
    route: '/api/admin/users',
    purpose: '注册用户、套餐状态、风险档案、最近登录',
    status: '待开发',
  },
  {
    route: '/api/admin/alphas',
    purpose: '候选注册表、评估结果、Shadow 与 Canary 复核',
    status: '待开发',
  },
  {
    route: '/api/admin/signals',
    purpose: '信号库存、执行模式、订单与模拟跟踪',
    status: '待开发',
  },
  {
    route: '/api/admin/system',
    purpose: '数据源健康、Worker 状态、模型与供应商健康',
    status: '待开发',
  },
];
