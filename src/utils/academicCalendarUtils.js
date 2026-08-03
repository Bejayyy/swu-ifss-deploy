/** Parse YYYY-MM-DD to local Date at midnight */
export function parseDateOnly(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
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
  if (!semester && (config?.semester1Start || config?.semester2Start)) {
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

export const EMPTY_EXAM_PERIODS = {
  1: {
    p1: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
    p2: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
    p3: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
    rbe: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
  },
  2: {
    p1: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
    p2: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
    p3: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
    rbe: { fr: { start: '', end: '' }, up: { start: '', end: '' } },
  },
};

export function normalizeExamPeriods(raw) {
  const base = EMPTY_EXAM_PERIODS;
  if (!raw) return base;
  const mergeLevel = (fallback, value) => ({
    fr: { ...fallback.fr, ...(value?.fr || {}) },
    up: { ...fallback.up, ...(value?.up || {}) },
  });
  const mergeSem = (semKey) => ({
    p1: mergeLevel(base[semKey].p1, raw[semKey]?.p1 || raw[Number(semKey)]?.p1),
    p2: mergeLevel(base[semKey].p2, raw[semKey]?.p2 || raw[Number(semKey)]?.p2),
    p3: mergeLevel(base[semKey].p3, raw[semKey]?.p3 || raw[Number(semKey)]?.p3),
    rbe: mergeLevel(base[semKey].rbe, raw[semKey]?.rbe || raw[Number(semKey)]?.rbe),
  });
  return { 1: mergeSem('1'), 2: mergeSem('2') };
}

export function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getSemesterBounds(config, semester) {
  if (!config) return { start: null, end: null };
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
  
  if (modality === 'odd-weeks') {
    // Active if week number is odd (1, 3, 5...)
    return weekNumber % 2 !== 0;
  }
  
  if (modality === 'even-weeks') {
    // Active if week number is even (2, 4, 6...)
    return weekNumber % 2 === 0;
  }
  
  if (modality === 'custom-ojt') {
    // Inactive if current week number is in customOjtWeeks
    const ojtList = Array.isArray(customOjtWeeks) ? customOjtWeeks.map(Number) : [];
    return !ojtList.includes(Number(weekNumber));
  }
  
  return true;
}

