import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Every `lazy(() => import(...))` target under App.jsx — catches accidental eager imports. */
describe('App.jsx lazy import catalog', () => {
  const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
  const source = fs.readFileSync(appPath, 'utf8');

  const lazyPaths = [
    ...source.matchAll(/lazy\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);

  const unique = [...new Set(lazyPaths)];

  it('keeps a healthy number of lazy entry points', () => {
    expect(unique.length).toBeGreaterThanOrEqual(18);
  });

  const required = [
    './components/TodayTab',
    './components/AiPage',
    './components/BrowseTab',
    './components/MenuTab',
    './components/FirstRunSetupFlow',
    './components/OnboardingFlow',
    './components/HoldingsTab',
    './components/MembershipSheet',
    './components/BillingCheckoutSheet',
    './components/AboutModal',
    './components/SignalsTab',
    './components/ResearchTab',
    './components/ProofTab',
    './components/RiskTab',
    './components/MarketTab',
    './components/WeeklyReviewTab',
    './components/DisciplineTab',
    './components/LearningLoopTab',
    './components/SettingsTab',
    './components/DataStatusTab',
  ];

  it.each(required)('lazy-loads %s', (rel) => {
    expect(unique).toContain(rel);
  });
});
