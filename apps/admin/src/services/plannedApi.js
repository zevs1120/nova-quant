export const PLANNED_ADMIN_APIS = [
  {
    route: '/api/admin/session',
    purpose: 'Admin auth session and role validation',
    status: 'planned'
  },
  {
    route: '/api/admin/overview',
    purpose: 'Top-level KPIs, alpha lifecycle counts, runtime health',
    status: 'planned'
  },
  {
    route: '/api/admin/users',
    purpose: 'Registered users, plan status, risk profile, last login',
    status: 'planned'
  },
  {
    route: '/api/admin/alphas',
    purpose: 'Candidate registry, evaluations, shadow and canary review',
    status: 'planned'
  },
  {
    route: '/api/admin/signals',
    purpose: 'Signal inventory, execution mode, order and paper tracking',
    status: 'planned'
  },
  {
    route: '/api/admin/system',
    purpose: 'Data source health, worker status, model/provider health',
    status: 'planned'
  }
];
