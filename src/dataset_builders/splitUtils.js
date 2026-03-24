import { groupBy } from '../normalizers/utils.js';

export function buildDateSplits(rows, dateField = 'date') {
  const allDates = [...new Set((rows || []).map((row) => row[dateField]).filter(Boolean))].sort();
  if (!allDates.length) {
    return {
      train: new Set(),
      valid: new Set(),
      test: new Set(),
      paper: new Set(),
    };
  }

  const n = allDates.length;
  const trainEnd = Math.max(1, Math.floor(n * 0.55));
  const validEnd = Math.max(trainEnd + 1, Math.floor(n * 0.7));
  const testEnd = Math.max(validEnd + 1, Math.floor(n * 0.85));

  return {
    train: new Set(allDates.slice(0, trainEnd)),
    valid: new Set(allDates.slice(trainEnd, validEnd)),
    test: new Set(allDates.slice(validEnd, testEnd)),
    paper: new Set(allDates.slice(testEnd)),
  };
}

export function assignSplitByDate(row, splitMap, dateField = 'date') {
  const date = row[dateField];
  if (splitMap.train.has(date)) return 'train';
  if (splitMap.valid.has(date)) return 'valid';
  if (splitMap.test.has(date)) return 'test';
  if (splitMap.paper.has(date)) return 'paper';
  return 'train';
}

export function splitCounts(rows) {
  const grouped = groupBy(rows, (row) => row.split);
  return {
    train: grouped.get('train')?.length || 0,
    valid: grouped.get('valid')?.length || 0,
    test: grouped.get('test')?.length || 0,
    paper: grouped.get('paper')?.length || 0,
  };
}

export function dateRange(rows, field = 'date') {
  if (!rows?.length) return { start: null, end: null };
  const dates = rows
    .map((row) => row[field])
    .filter(Boolean)
    .sort();
  return {
    start: dates[0] || null,
    end: dates[dates.length - 1] || null,
  };
}
