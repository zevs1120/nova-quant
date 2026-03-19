export const DEMO_ENTRY_ENABLED = import.meta.env.VITE_ENABLE_DEMO_ENTRY !== '0';

// A full demo build should never silently hijack production.
// Keep it local-first unless we intentionally design a separate demo deployment.
export const FORCE_DEMO_BUILD = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === '1';

export function isDemoRuntime(investorDemoEnabled) {
  return Boolean(FORCE_DEMO_BUILD || investorDemoEnabled);
}
