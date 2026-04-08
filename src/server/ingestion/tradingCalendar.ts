export type TradingCalendarSeed = {
  dayKey: string;
  status: 'CLOSED' | 'HALF_DAY';
  reason: string;
  source: string;
};

const US_EXCEPTIONAL_CLOSURE_SEEDS: TradingCalendarSeed[] = [
  {
    dayKey: '2001-09-11',
    status: 'CLOSED',
    reason: 'NYSE/Nasdaq closed after September 11 attacks',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2001-09-12',
    status: 'CLOSED',
    reason: 'NYSE/Nasdaq closed after September 11 attacks',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2001-09-13',
    status: 'CLOSED',
    reason: 'NYSE/Nasdaq closed after September 11 attacks',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2001-09-14',
    status: 'CLOSED',
    reason: 'NYSE/Nasdaq closed after September 11 attacks',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2004-06-11',
    status: 'CLOSED',
    reason: 'National Day of Mourning for President Reagan',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2007-01-02',
    status: 'CLOSED',
    reason: 'National Day of Mourning for President Ford',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2012-10-29',
    status: 'CLOSED',
    reason: 'NYSE/Nasdaq closed due to Hurricane Sandy',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2012-10-30',
    status: 'CLOSED',
    reason: 'NYSE/Nasdaq closed due to Hurricane Sandy',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2018-12-05',
    status: 'CLOSED',
    reason: 'National Day of Mourning for President George H. W. Bush',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
  {
    dayKey: '2025-01-09',
    status: 'CLOSED',
    reason: 'National Day of Mourning for President Jimmy Carter',
    source: 'STATIC_US_TRADING_CALENDAR_EXCEPTION',
  },
];

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nthWeekdayOfMonth(year: number, monthZeroBased: number, weekday: number, nth: number): Date {
  const date = new Date(Date.UTC(year, monthZeroBased, 1));
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  date.setUTCDate(date.getUTCDate() + (nth - 1) * 7);
  return date;
}

function lastWeekdayOfMonth(year: number, monthZeroBased: number, weekday: number): Date {
  const date = new Date(Date.UTC(year, monthZeroBased + 1, 0));
  while (date.getUTCDay() !== weekday) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date;
}

function observedFixedHoliday(year: number, monthZeroBased: number, day: number): Date {
  const date = new Date(Date.UTC(year, monthZeroBased, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function easterSundayUtc(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function buildUsTradingCalendarSeeds(years: number[]): TradingCalendarSeed[] {
  const rows = new Map<string, TradingCalendarSeed>();

  function push(row: TradingCalendarSeed) {
    rows.set(`${row.dayKey}:${row.status}`, row);
  }

  for (const year of years) {
    push({
      dayKey: toDayKey(observedFixedHoliday(year, 0, 1)),
      status: 'CLOSED',
      reason: "New Year's Day",
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(nthWeekdayOfMonth(year, 0, 1, 3)),
      status: 'CLOSED',
      reason: 'Martin Luther King Jr. Day',
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(nthWeekdayOfMonth(year, 1, 1, 3)),
      status: 'CLOSED',
      reason: "Presidents' Day",
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(addDays(easterSundayUtc(year), -2)),
      status: 'CLOSED',
      reason: 'Good Friday',
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(lastWeekdayOfMonth(year, 4, 1)),
      status: 'CLOSED',
      reason: 'Memorial Day',
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(observedFixedHoliday(year, 5, 19)),
      status: 'CLOSED',
      reason: 'Juneteenth',
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(observedFixedHoliday(year, 6, 4)),
      status: 'CLOSED',
      reason: 'Independence Day',
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(nthWeekdayOfMonth(year, 8, 1, 1)),
      status: 'CLOSED',
      reason: 'Labor Day',
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    const thanksgiving = nthWeekdayOfMonth(year, 10, 4, 4);
    push({
      dayKey: toDayKey(thanksgiving),
      status: 'CLOSED',
      reason: 'Thanksgiving',
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(addDays(thanksgiving, 1)),
      status: 'HALF_DAY',
      reason: 'Black Friday early close',
      source: 'STATIC_US_TRADING_CALENDAR',
    });
    push({
      dayKey: toDayKey(observedFixedHoliday(year, 11, 25)),
      status: 'CLOSED',
      reason: 'Christmas Day',
      source: 'STATIC_US_TRADING_CALENDAR',
    });

    const christmasEve = new Date(Date.UTC(year, 11, 24));
    if (christmasEve.getUTCDay() >= 1 && christmasEve.getUTCDay() <= 5) {
      push({
        dayKey: toDayKey(christmasEve),
        status: 'HALF_DAY',
        reason: 'Christmas Eve early close',
        source: 'STATIC_US_TRADING_CALENDAR',
      });
    }

    const julyThird = new Date(Date.UTC(year, 6, 3));
    if (julyThird.getUTCDay() >= 1 && julyThird.getUTCDay() <= 5) {
      push({
        dayKey: toDayKey(julyThird),
        status: 'HALF_DAY',
        reason: 'Pre-Independence Day early close',
        source: 'STATIC_US_TRADING_CALENDAR',
      });
    }
  }

  const yearSet = new Set(years);
  for (const seed of US_EXCEPTIONAL_CLOSURE_SEEDS) {
    const year = Number(seed.dayKey.slice(0, 4));
    if (yearSet.has(year)) push(seed);
  }

  return [...rows.values()].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}
