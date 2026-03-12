import fs from 'fs';
import path from 'path';

export function writeWeeklyResearchReport({ report, filepath = 'docs/research_reports/WEEKLY_RESEARCH_REPORT.md' } = {}) {
  const content = typeof report === 'string' ? report : report?.markdown || '';
  const absolute = path.isAbsolute(filepath) ? filepath : path.join(process.cwd(), filepath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, 'utf8');
  return {
    written: true,
    path: absolute,
    bytes: Buffer.byteLength(content, 'utf8')
  };
}
