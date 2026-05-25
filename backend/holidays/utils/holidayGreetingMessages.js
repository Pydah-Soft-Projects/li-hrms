/**
 * Chill, friendly greeting copy for holiday & week-off push/in-app notifications.
 * Index rotates by day + employee so messages feel fresh but stable per day.
 */

const HOLIDAY_GREETINGS = [
  {
    title: (name, hol) => `Hey ${name} — it's ${hol || 'holiday'} time!`,
    message: () =>
      'No alarms, no rush. Put your feet up, steal an extra chai, and let today be ridiculously good.',
  },
  {
    title: (name) => `${name}, today's on pause mode`,
    message: (hol) =>
      `${hol || 'Holiday'} just dropped — office can wait. Go make a memory (or a nap).`,
  },
  {
    title: () => "Plot twist: you're off today",
    message: (hol) =>
      `Happy ${hol || 'holiday'}! Tell your to-do list we'll circle back tomorrow.`,
  },
  {
    title: (name) => `Good vibes only, ${name}`,
    message: (hol) =>
      `${hol || 'Holiday'} energy activated. Smile a little — you earned this break.`,
  },
  {
    title: () => 'Official chill day unlocked',
    message: (hol) =>
      `It's ${hol || 'a holiday'} — dress code: comfortable. Mood: peaceful chaos.`,
  },
  {
    title: (name, hol) => `${name}, ${hol || 'holiday'} says hi`,
    message: () =>
      'Calendar cleared. Heart full. Go be human for a day — we\'re cheering for you.',
  },
  {
    title: () => 'Happy holiday, legend',
    message: (hol) =>
      `${hol || 'Today'} is yours. Snacks, sunshine, and zero guilt — enjoy every bit.`,
  },
  {
    title: (name) => `Off-duty mode: ${name}`,
    message: (hol) =>
      `${hol || 'Holiday'} mode ON. Reply to emails? Maybe next week. Maybe never. 😄`,
  },
];

const WEEK_OFF_GREETINGS = [
  {
    title: (name) => `${name}, week off vibes`,
    message: () =>
      'Roster says relax — no shift today. Couch, playlist, and peace. You deserve it.',
  },
  {
    title: () => 'Week off — no cap',
    message: () =>
      'Today\'s your reset button. Slow mornings, loud music, quiet mind — all approved.',
  },
  {
    title: (name) => `Hey ${name}, you're free today`,
    message: () =>
      'Week off on the board. Tell productivity we\'ll catch up later (or not).',
  },
  {
    title: () => 'Chill day certified',
    message: () =>
      'No clock-in drama today. Breathe out, stretch out, zone out — fully allowed.',
  },
  {
    title: (name) => `${name}'s weekly breather`,
    message: () =>
      'Week off unlocked. Go wander, nap, or do absolutely nothing — all valid life choices.',
  },
  {
    title: () => 'Soft life day',
    message: () =>
      'Your roster marked today as week off. Treat yourself like a friend would — kindly.',
  },
  {
    title: (name) => `Reset day, ${name}`,
    message: () =>
      'Week off = permission to unplug. Hydrate, laugh, and come back softer tomorrow.',
  },
  {
    title: () => 'Zero meetings, max peace',
    message: () =>
      'It\'s week off — the only KPI today is how good you feel. Spoiler: aim high.',
  },
];

function hashPick(seed, length) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % length;
}

function firstName(fullName) {
  const n = String(fullName || 'there').trim();
  if (!n) return 'there';
  return n.split(/\s+/)[0];
}

/**
 * @param {'HOLIDAY'|'WEEK_OFF'} dayType
 * @param {{ employeeName?: string, holidayName?: string|null, empNo?: string, dateStr?: string }} ctx
 */
function pickHolidayWeekOffGreeting(dayType, ctx = {}) {
  const pool = dayType === 'HOLIDAY' ? HOLIDAY_GREETINGS : WEEK_OFF_GREETINGS;
  const seed = `${ctx.dateStr || ''}:${ctx.empNo || ''}:${dayType}`;
  const row = pool[hashPick(seed, pool.length)];
  const name = firstName(ctx.employeeName);
  const hol = ctx.holidayName ? String(ctx.holidayName).trim() : null;

  const title = typeof row.title === 'function' ? row.title(name, hol) : row.title;
  const message = typeof row.message === 'function' ? row.message(hol, name) : row.message;

  return {
    title: String(title).slice(0, 120),
    message: String(message).slice(0, 280),
    tagLine: dayType === 'HOLIDAY' ? 'Happy holiday' : 'Happy week off',
  };
}

module.exports = {
  pickHolidayWeekOffGreeting,
  HOLIDAY_GREETINGS,
  WEEK_OFF_GREETINGS,
};
