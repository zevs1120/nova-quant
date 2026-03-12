export function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export function sortByDate(rows, key = 'date') {
  return [...(rows || [])].sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')));
}

export function dateRangeFromRows(rows, field = 'date') {
  if (!rows?.length) return { start: null, end: null };
  const sorted = sortByDate(rows, field);
  return {
    start: sorted[0]?.[field] || null,
    end: sorted[sorted.length - 1]?.[field] || null
  };
}

export function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
