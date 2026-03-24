import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachStandaloneWebShell } from '../src/server/standaloneWeb.js';

describe('api server standalone web shell', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function createFakeApp() {
    return {
      use: vi.fn(),
      get: vi.fn(),
    };
  }

  it('mounts static middleware and SPA fallback when SERVE_WEB_DIST is enabled', () => {
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marvix-dist-'));
    tempDirs.push(distDir);
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      '<!doctype html><html><body>Marvix Cloud Shell</body></html>',
    );

    const app = createFakeApp();
    const result = attachStandaloneWebShell(app as any, {
      ...process.env,
      SERVE_WEB_DIST: '1',
      WEB_DIST_PATH: distDir,
    });

    expect(result).toBe(app);
    expect(app.use).toHaveBeenCalledTimes(1);
    expect(app.get).toHaveBeenCalledTimes(1);
    expect(app.get.mock.calls[0][0]).toBeInstanceOf(RegExp);
    expect(typeof app.use.mock.calls[0][0]).toBe('function');
  });

  it('skips mounting when the standalone shell is disabled', () => {
    const app = createFakeApp();
    const result = attachStandaloneWebShell(app as any, {
      ...process.env,
      SERVE_WEB_DIST: '0',
    });

    expect(result).toBe(app);
    expect(app.use).not.toHaveBeenCalled();
    expect(app.get).not.toHaveBeenCalled();
  });

  it('skips mounting when dist/index.html is missing', () => {
    const distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marvix-dist-'));
    tempDirs.push(distDir);

    const app = createFakeApp();
    const result = attachStandaloneWebShell(app as any, {
      ...process.env,
      SERVE_WEB_DIST: 'true',
      WEB_DIST_PATH: distDir,
    });

    expect(result).toBe(app);
    expect(app.use).not.toHaveBeenCalled();
    expect(app.get).not.toHaveBeenCalled();
  });
});
