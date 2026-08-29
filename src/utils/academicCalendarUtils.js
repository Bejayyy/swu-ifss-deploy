/** Parse YYYY-MM-DD to local Date at midnight */
export function parseDateOnly(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Normalizes any school year string input (e.g. "AY 2026-2027", "SY AY 2026-2027", "A.Y. 2026-2027", "2026-2027")
 * to the clean canonical format "2026-2027".
 */
export function normalizeSchoolYearLabel(rawInput) {
  if (!rawInput) return '2026-2027';
  const str = String(rawInput).trim();
  
  // 1. Try extracting standard 4-digit year pair (e.g. 2026-2027 or 2026/2027 or 2026 - 2027)
  const matchPair = str.match(/(\d{4})\s*[-/–—]\s*(\d{4})/);
  if (matchPair) {
    return `${matchPair[1]}-${matchPair[2]}`;
  }

  // 2. Try extracting 4-digit and 2-digit year (e.g. 2026-27)
  const matchShortPair = str.match(/(\d{4})\s*[-/–—]\s*(\d{2})/);
  if (matchShortPair) {
    const century = matchShortPair[1].substring(0, 2);
    return `${matchShortPair[1]}-${century}${matchShortPair[2]}`;
  }

  // 3. Try single 4-digit year (e.g. 2026 -> 2026-2027)
  const matchSingle = str.match(/(\d{4})/);
  if (matchSingle) {
    const y1 = parseInt(matchSingle[1], 10);
    return `${y1}-${y1 + 1}`;
  }

  // Fallback: strip standard prefixes (SY, AY, A.Y., Academic Year) and clean up
  return str.replace(/^(?:sy\s+ay|ay\s+sy|sy|ay|a\.y\.|academic\s*year)\s+/i, '').replace(/\s+/g, '-').trim();
}

export function formatDisplayDate(value) {
  if (!value) return 'Month Day, Year';
  const dt = parseDateOnly(value);
  if (!dt) return value;
  // Format as "January 1, 2025"
  return dt.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

export function isDateInRange(dateStr, startStr, endStr) {
  const d = parseDateOnly(dateStr);
  const s = parseDateOnly(startStr);
  const e = parseDateOnly(endStr);
  if (!d || !s || !e) return false;
  return d >= s && d <= e;
}

export function getSemesterForDate(dateStr, config) {
  if (!config) return null;
  if (Array.isArray(config.semesters) && config.semesters.length > 0) {
    for (let i = 0; i < config.semesters.length; i++) {
      const sem = config.semesters[i];
      if (sem?.start && sem?.end && isDateInRange(dateStr, sem.start, sem.end)) {
        return i + 1;
      }
    }
  }
  if (config.semester1Start && config.semester1End && isDateInRange(dateStr, config.semester1Start, config.semester1End)) {
    return 1;
  }
  if (config.semester2Start && config.semester2End && isDateInRange(dateStr, config.semester2Start, config.semester2End)) {
    return 2;
  }
  return null;
}

export function findHolidayOnDate(dateStr, holidays = []) {
  return holidays.find((h) => h.date === dateStr) || null;
}

export function findNoClassOnDate(dateStr, periods = []) {
  return periods.find((p) => isDateInRange(dateStr, p.start, p.end)) || null;
}

export function getSchedulingBlockReason(dateStr, { config, holidays = [], noClassPeriods = [] }) {
  const holiday = findHolidayOnDate(dateStr, holidays);
  if (holiday) return `Holiday: ${holiday.name}`;

  const noClass = findNoClassOnDate(dateStr, noClassPeriods);
  if (noClass) return `No-class period: ${noClass.reason}`;

  const semester = getSemesterForDate(dateStr, config);
  const hasConfiguredSemesters =
    (Array.isArray(config?.semesters) && config.semesters.some((s) => s.start || s.end)) ||
    config?.semester1Start ||
    config?.semester2Start;

  if (!semester && hasConfiguredSemesters) {
    return 'Date is outside configured semester ranges';
  }

  return null;
}

export function canScheduleOnDate(dateStr, calendarData, expectedSemester = null) {
  const reason = getSchedulingBlockReason(dateStr, calendarData);
  if (reason) return { allowed: false, reason };

  if (expectedSemester) {
    const semester = getSemesterForDate(dateStr, calendarData.config);
    if (semester !== expectedSemester) {
      return {
        allowed: false,
        reason: `Date is not within Semester ${expectedSemester}`,
      };
    }
  }

  return { allowed: true, reason: null };
}

export function formatExamRange(range) {
  if (!range?.start || !range?.end) return '';
  return `${formatDisplayDate(range.start)} to ${formatDisplayDate(range.end)}`;
}

export const createEmptyExamPeriod = () => ({
  p1: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
  p2: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
  p3: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
  rbe: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
});

export const EMPTY_EXAM_PERIODS = {
  1: createEmptyExamPeriod(),
  2: createEmptyExamPeriod(),
};

export function normalizeExamPeriods(raw) {
  const result = { 1: createEmptyExamPeriod(), 2: createEmptyExamPeriod() };
  if (!raw) return result;
  const mergeLevel = (fallback, value) => ({
    fr: { ...fallback.fr, ...(value?.fr || {}) },
    up: { ...fallback.up, ...(value?.up || {}) },
  });
  const mergeSem = (fallback, val) => ({
    p1: mergeLevel(fallback.p1, val?.p1),
    p2: mergeLevel(fallback.p2, val?.p2),
    p3: mergeLevel(fallback.p3, val?.p3),
    rbe: mergeLevel(fallback.rbe, val?.rbe),
  });

  Object.keys(raw).forEach((semKey) => {
    const fallback = result[semKey] || createEmptyExamPeriod();
    result[semKey] = mergeSem(fallback, raw[semKey]);
  });

  return result;
}

export function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getSemesterBounds(config, semester) {
  if (!config) return { start: null, end: null };
  if (Array.isArray(config.semesters) && config.semesters.length > 0) {
    const sNum = Number(semester);
    if (!isNaN(sNum) && sNum >= 1 && config.semesters[sNum - 1]) {
      const sem = config.semesters[sNum - 1];
      return { start: sem.start || null, end: sem.end || null };
    }
    const found = config.semesters.find(
      (s) => s.id === semester || (s.name && s.name.toLowerCase() === String(semester).toLowerCase())
    );
    if (found) {
      return { start: found.start || null, end: found.end || null };
    }
  }
  const s = Number(semester);
  if (s === 1) return { start: config.semester1Start || null, end: config.semester1End || null };
  if (s === 2) return { start: config.semester2Start || null, end: config.semester2End || null };
  return { start: null, end: null };
}

export function getMondayOfWeek(date) {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function enumerateDatesInRange(startStr, endStr) {
  const start = parseDateOnly(startStr);
  const end = parseDateOnly(endStr);
  if (!start || !end) return [];
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(formatDateOnly(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function getAllExamDates(examPeriods, semester) {
  const sem = examPeriods?.[semester] || examPeriods?.[Number(semester)];
  if (!sem) return new Set();
  const dates = new Set();
  ['p1', 'p2', 'p3', 'rbe'].forEach((key) => {
    ['fr', 'up'].forEach((level) => {
      const range = sem[key]?.[level];
      if (range?.start && range?.end) {
        enumerateDatesInRange(range.start, range.end).forEach((d) => dates.add(d));
      }
    });
  });
  return dates;
}

/**
 * Get exam dates for a specific period and student category
 */
export function getExamDatesForPeriod(examPeriods, semester, period, studentCategory) {
  const sem = examPeriods?.[semester] || examPeriods?.[Number(semester)];
  if (!sem || !period) return new Set();
  
  const level = studentCategory === 'freshmen' ? 'fr' : 'up';
  const range = sem[period]?.[level];
  
  const dates = new Set();
  if (range?.start && range?.end) {
    enumerateDatesInRange(range.start, range.end).forEach((d) => dates.add(d));
  }
  return dates;
}

/** regular = class days; exam = exam-period days only */
export function getPlotDayStatus(dateStr, calendarData, semester, scheduleMode = 'regular', examPeriod = null, studentCategory = null) {
  const { config, holidays = [], noClassPeriods = [], examPeriods } = calendarData || {};
  
  // For exam mode with specific period, use exam period dates instead of semester bounds
  if (scheduleMode === 'exam' && examPeriod && studentCategory) {
    const examDates = getExamDatesForPeriod(examPeriods, semester, examPeriod, studentCategory);
    
    if (examDates.size === 0) {
      return { disabled: true, reason: `No dates configured for ${examPeriod.toUpperCase()}` };
    }
    
    if (!examDates.has(dateStr)) {
      return { disabled: true, reason: `Not in ${examPeriod.toUpperCase()} exam period` };
    }
    
    // Check holidays and no-class periods
    const holiday = findHolidayOnDate(dateStr, holidays);
    if (holiday) return { disabled: true, reason: `Holiday: ${holiday.name}` };

    const noClass = findNoClassOnDate(dateStr, noClassPeriods);
    if (noClass) return { disabled: true, reason: `No-class: ${noClass.reason}` };
    
    return { disabled: false, reason: null };
  }
  
  // Original logic for regular schedule or exam without specific period
  const bounds = getSemesterBounds(config, semester);

  if (bounds.start && bounds.end && !isDateInRange(dateStr, bounds.start, bounds.end)) {
    return { disabled: true, reason: 'Outside semester dates' };
  }

  const holiday = findHolidayOnDate(dateStr, holidays);
  if (holiday) return { disabled: true, reason: `Holiday: ${holiday.name}` };

  const noClass = findNoClassOnDate(dateStr, noClassPeriods);
  if (noClass) return { disabled: true, reason: `No-class: ${noClass.reason}` };

  const examDates = getAllExamDates(examPeriods, semester);
  const isExamDate = examDates.has(dateStr);

  if (scheduleMode === 'regular' && isExamDate) {
    return { disabled: true, reason: 'Exam period date' };
  }

  if (scheduleMode === 'exam' && examDates.size > 0 && !isExamDate) {
    return { disabled: true, reason: 'Not an exam period date' };
  }

  const sem = getSemesterForDate(dateStr, config);
  if (sem && Number(semester) && sem !== Number(semester)) {
    return { disabled: true, reason: `Not in Semester ${semester}` };
  }

  return { disabled: false, reason: null };
}

export function getWeekDates(weekStartDate) {
  return Array.from({ length: 7 }, (_, i) => formatDateOnly(addDaysLocal(weekStartDate, i)));
}

function addDaysLocal(date, daysToAdd) {
  const d = new Date(date);
  d.setDate(d.getDate() + daysToAdd);
  return d;
}

export function getInitialWeekStart(semesterStartStr) {
  if (!semesterStartStr) return getMondayOfWeek(new Date());
  const parsed = parseDateOnly(semesterStartStr);
  return parsed ? getMondayOfWeek(parsed) : getMondayOfWeek(new Date());
}

export function countConfiguredExamPeriods(examPeriods, semester) {
  const sem = examPeriods?.[semester] || examPeriods?.[Number(semester)];
  if (!sem) return 0;
  return ['p1', 'p2', 'p3', 'rbe'].filter((key) => {
    const period = sem[key];
    return period?.fr?.start || period?.up?.start;
  }).length;
}

/**
 * Calculate the 1-based semester week number for a given target date or week start date.
 * If no semester start date is provided, defaults to 1.
 */
export function getSemesterWeekNumber(targetDate, semesterStartStr) {
  if (!targetDate || !semesterStartStr) return 1;
  const targetDt = typeof targetDate === 'string' ? parseDateOnly(targetDate) : new Date(targetDate);
  const semStartDt = parseDateOnly(semesterStartStr);
  if (!targetDt || !semStartDt) return 1;

  const targetMon = getMondayOfWeek(targetDt);
  const semStartMon = getMondayOfWeek(semStartDt);

  const diffMs = targetMon.getTime() - semStartMon.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeeks + 1);
}

/**
 * Check if a schedule entry or section is active on a specific semester week number based on its modality.
 * Modality options:
 * - 'regular': Classroom every week (default)
 * - 'odd-weeks': Classroom on Odd Weeks (1, 3, 5...), OJT on Even Weeks
 * - 'even-weeks': Classroom on Even Weeks (2, 4, 6...), OJT on Odd Weeks
 * - 'custom-ojt': OJT on specific week numbers listed in customOjtWeeks array
 */
export function isScheduleActiveOnWeek(modality = 'regular', weekNumber = 1, customOjtWeeks = []) {
  if (!modality || modality === 'regular') return true;

  if (modality === 'odd-weeks' || modality === 'week_a') {
    // Active if week number is odd (1, 3, 5...)
    return Number(weekNumber) % 2 !== 0;
  }

  if (modality === 'even-weeks' || modality === 'week_b') {
    // Active if week number is even (2, 4, 6...)
    return Number(weekNumber) % 2 === 0;
  }

  if (modality === 'custom-ojt') {
    // Inactive if current week number is in customOjtWeeks
    const ojtList = Array.isArray(customOjtWeeks) ? customOjtWeeks.map(Number) : [];
    return !ojtList.includes(Number(weekNumber));
  }

  return true;
}

/**
 * Generate all semester academic weeks with date range and cycle tags (Week A vs Week B).
 */
export function getSemesterAcademicWeeks(semesterStartStr, totalWeeks = 18, startOnWeekA = true) {
  if (!semesterStartStr) {
    return Array.from({ length: totalWeeks }, (_, i) => {
      const wNum = i + 1;
      const isWeekA = startOnWeekA ? wNum % 2 !== 0 : wNum % 2 === 0;
      return {
        weekNumber: wNum,
        label: `Week ${wNum}`,
        dateRangeLabel: `Week ${wNum}`,
        cycleTag: isWeekA ? 'Week A' : 'Week B',
        isWeekA,
        isOdd: wNum % 2 !== 0,
      };
    });
  }

  const startDt = parseDateOnly(semesterStartStr);
  const baseMonday = startDt ? getMondayOfWeek(startDt) : new Date();

  return Array.from({ length: totalWeeks }, (_, i) => {
    const wNum = i + 1;
    const isWeekA = startOnWeekA ? wNum % 2 !== 0 : wNum % 2 === 0;

    const wStart = new Date(baseMonday);
    wStart.setDate(baseMonday.getDate() + i * 7);

    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 4); // Friday

    const startMonth = wStart.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = wEnd.toLocaleDateString('en-US', { month: 'short' });
    const startDay = wStart.getDate();
    const endDay = wEnd.getDate();

    const rangeStr = startMonth === endMonth
      ? `${startMonth} ${startDay}–${endDay}`
      : `${startMonth} ${startDay} – ${endMonth} ${endDay}`;

    return {
      weekNumber: wNum,
      label: `Week ${wNum} (${rangeStr})`,
      shortLabel: `Wk ${wNum}`,
      dateRangeLabel: rangeStr,
      startDate: wStart.toISOString().split('T')[0],
      endDate: wEnd.toISOString().split('T')[0],
      cycleTag: isWeekA ? 'Week A' : 'Week B',
      isWeekA,
      isOdd: wNum % 2 !== 0,
    };
  });
}

/**
 * Format cycle tag and week details for an entry or section
 */
export function getCycleDisplayInfo(rotationCycle = 'all', partnerSection = null) {
  if (rotationCycle === 'week_a') {
    return {
      tag: 'Week A (Odd Weeks)',
      shortTag: 'Week A',
      color: 'blue',
      badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      description: `In-Campus on Week A (Odd Weeks)${partnerSection ? ` | Partner: ${partnerSection} (Week B)` : ''}`,
    };
  }
  if (rotationCycle === 'week_b') {
    return {
      tag: 'Week B (Even Weeks)',
      shortTag: 'Week B',
      color: 'purple',
      badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
      description: `In-Campus on Week B (Even Weeks)${partnerSection ? ` | Partner: ${partnerSection} (Week A)` : ''}`,
    };
  }
  return {
    tag: 'All Weeks (Regular)',
    shortTag: 'Regular',
    color: 'gray',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    description: 'In-Campus every week',
  };
}

