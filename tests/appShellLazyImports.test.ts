import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards the lazy-loading shell introduced in the mobile perf pass: main tabs and
 * heavy overlays should stay off the index chunk.
 */
describe('App.jsx lazy shell', () => {
  const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
  const topBarStatePath = path.join(__dirname, '..', 'src', 'app', 'topBarState.js');
  const source = fs.readFileSync(appPath, 'utf8');
  const topBarStateSource = fs.readFileSync(topBarStatePath, 'utf8');

  function expectLazyComponent(relPath: string) {
    const escaped = relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`lazy\\(\\s*\\(\\)\\s*=>\\s*import\\(\\s*['"]${escaped}['"]\\s*\\)`);
    expect(source).toMatch(re);
  }

  it('lazy-loads primary tabs and first-run shell', () => {
    expectLazyComponent('./components/TodayTab');
    expectLazyComponent('./components/AiPage');
    expectLazyComponent('./components/BrowseTab');
    expectLazyComponent('./components/MenuTab');
    expectLazyComponent('./components/FirstRunSetupFlow');
    expectLazyComponent('./components/OnboardingFlow');
  });

  it('lazy-loads membership and about overlays', () => {
    expectLazyComponent('./components/MembershipSheet');
    expectLazyComponent('./components/BillingCheckoutSheet');
    expectLazyComponent('./components/AboutModal');
  });

  it('uses WebP logos in the top bar import graph', () => {
    expect(source).toMatch(/from\s+['"]\.\/assets\/NOVA1\.webp['"]/);
    expect(source).toMatch(/from\s+['"]\.\/assets\/Nova2\.webp['"]/);
    expect(source).not.toMatch(/NOVA1\.png/);
    expect(source).not.toMatch(/Nova2\.png/);
  });

  it('declares four primary tab keys in order', () => {
    expect(source).toMatch(
      /import\s+\{\s*deriveTopBarState\s*,\s*PRIMARY_TAB_KEYS\s*\}\s+from\s+['"]\.\/app\/topBarState\.js['"]/,
    );
    expect(topBarStateSource).toMatch(
      /export\s+const\s+PRIMARY_TAB_KEYS\s*=\s*\[\s*['"]today['"]\s*,\s*['"]ai['"]\s*,\s*['"]browse['"]\s*,\s*['"]my['"]\s*\]/,
    );
  });
});
