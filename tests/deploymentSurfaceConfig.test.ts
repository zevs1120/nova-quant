import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

describe('deployment surface config', () => {
  it('routes app and landing api traffic to the canonical production api host', () => {
    const appConfig = readJson('app/vercel.json');
    const landingConfig = readJson('landing/vercel.json');
    const adminConfig = readJson('admin/vercel.json');

    expect(appConfig.rewrites).toContainEqual({
      source: '/api/:path*',
      destination: 'https://api.novaquant.cloud/api/:path*',
    });
    expect(landingConfig.rewrites).toContainEqual({
      source: '/api/:path*',
      destination: 'https://api.novaquant.cloud/api/:path*',
    });
    expect(adminConfig.rewrites).toContainEqual({
      source: '/api/:path*',
      destination: 'https://api.novaquant.cloud/api/:path*',
    });
  });

  it('keeps the repository root deployment api-only', () => {
    const rootConfig = readJson('vercel.json');

    expect(rootConfig.buildCommand).toBe('npm run build:api');
    expect(rootConfig.outputDirectory).toBe('dist');

    expect(rootConfig.rewrites).toContainEqual({
      source: '/api/:route*',
      destination: '/api?route=:route*',
    });

    expect(rootConfig.rewrites).toContainEqual({
      source: '/healthz',
      destination: '/api?route=healthz',
    });

    expect(rootConfig.rewrites).toContainEqual({
      source: '/',
      destination: '/api',
    });
  });
});
