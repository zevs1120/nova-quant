import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const packageLockPath = path.join(root, 'package-lock.json');
const versionConfigPath = path.join(root, 'src/config/version.js');
const changelogPath = path.join(root, 'CHANGELOG.md');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function bumpSemver(version, kind) {
  const [major, minor, patch] = String(version)
    .split('.')
    .map((part) => Number(part));
  if (![major, minor, patch].every(Number.isFinite)) {
    throw new Error(`Invalid semver: ${version}`);
  }
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function parseVersionConfig(text) {
  const versionMatch = text.match(/APP_VERSION = '([^']+)'/);
  const buildMatch = text.match(/APP_BUILD_NUMBER = (\d+)/);
  return {
    version: versionMatch?.[1] || '0.1.0',
    build: Number(buildMatch?.[1] || 0)
  };
}

function writeVersionConfig(version, build) {
  const content = [
    `export const APP_VERSION = '${version}';`,
    `export const APP_BUILD_NUMBER = ${build};`,
    "export const APP_VERSION_LABEL = `v${APP_VERSION}`;"
  ].join('\n');
  fs.writeFileSync(versionConfigPath, `${content}\n`);
}

function ensureChangelog() {
  if (fs.existsSync(changelogPath)) return;
  fs.writeFileSync(
    changelogPath,
    '# CHANGELOG\n\nAll notable changes to NovaQuant are recorded here.\n'
  );
}

function prependChangelog(version, kind, summaryLines) {
  ensureChangelog();
  const current = fs.readFileSync(changelogPath, 'utf8');
  const date = new Date().toISOString().slice(0, 10);
  const entry = [
    '',
    `## ${version} (${date})`,
    `- Release type: ${kind}`,
    ...summaryLines.map((line) => `- ${line}`),
    ''
  ].join('\n');
  const next = current.includes('All notable changes')
    ? current.replace('All notable changes to NovaQuant are recorded here.\n', `All notable changes to NovaQuant are recorded here.\n${entry}`)
    : `${current.trimEnd()}\n${entry}`;
  fs.writeFileSync(changelogPath, next);
}

function main() {
  const kind = process.argv[2] || 'patch';
  if (!['major', 'minor', 'patch'].includes(kind)) {
    throw new Error(`Unsupported bump type: ${kind}`);
  }

  const pkg = readJson(packageJsonPath);
  const lock = fs.existsSync(packageLockPath) ? readJson(packageLockPath) : null;
  const versionConfig = parseVersionConfig(fs.readFileSync(versionConfigPath, 'utf8'));
  const currentVersion = pkg.version || versionConfig.version;
  const nextVersion = bumpSemver(currentVersion, kind);
  const nextBuild = Math.max(versionConfig.build || 0, 0) + 1;

  pkg.version = nextVersion;
  writeJson(packageJsonPath, pkg);

  if (lock) {
    lock.version = nextVersion;
    if (lock.packages?.['']) {
      lock.packages[''].version = nextVersion;
    }
    writeJson(packageLockPath, lock);
  }

  writeVersionConfig(nextVersion, nextBuild);
  prependChangelog(nextVersion, kind, [
    'Automated version bump via version-manager.',
    'Update release metadata, build number, and changelog entry.'
  ]);

  process.stdout.write(`${currentVersion} -> ${nextVersion} (build ${nextBuild})\n`);
}

main();
