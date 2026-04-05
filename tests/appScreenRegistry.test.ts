import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App screen registry wiring', () => {
  const appPath = path.join(__dirname, '..', 'src', 'App.jsx');
  const registryPath = path.join(__dirname, '..', 'src', 'app', 'screenRegistry.jsx');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const registrySource = fs.readFileSync(registryPath, 'utf8');

  it('imports and uses the dedicated screen registry', () => {
    expect(appSource).toContain("import { renderActiveScreen } from './app/screenRegistry.jsx';");
    expect(appSource).toContain('const screenContent = renderActiveScreen({');
    expect(appSource).not.toContain('const renderScreen = () => {');
    expect(appSource).not.toContain('const renderMenuSection = (section) => {');
  });

  it('keeps per-tab render branches inside the registry helper', () => {
    expect(registrySource).toContain('export function renderMenuSection');
    expect(registrySource).toContain('export function renderActiveScreen');
    expect(registrySource).toContain("if (activeTab === 'today')");
    expect(registrySource).toContain("if (activeTab === 'browse')");
    expect(registrySource).toContain(
      "if (activeTab === 'my' && mySectionList.includes(mySection))",
    );
  });
});
