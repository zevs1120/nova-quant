function pad(n) {
  return String(n).padStart(2, '0');
}

export function localDateKey(input = new Date()) {
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function keyToDate(key) {
  const [y, m, d] = String(key || '')
    .split('-')
    .map((value) => Number(value));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function shiftDateKey(key, deltaDays) {
  const base = keyToDate(key);
  if (!base) return '';
  base.setDate(base.getDate() + deltaDays);
  return localDateKey(base);
}

export function weekStartKey(input = new Date()) {
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return '';
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return localDateKey(d);
}

export function addUniqueKey(rows = [], key) {
  if (!key) return rows;
  if (rows.includes(key)) return rows;
  return [...rows, key].sort();
}

export function calcStreak(rows = [], anchorKey, stepDays = 1) {
  if (!anchorKey) return 0;
  const set = new Set(rows || []);
  let cursor = anchorKey;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -stepDays);
  }
  return streak;
}
