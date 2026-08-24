/**
 * School Year Resolver Utility
 * Accurately determines the active school year based on current date matching
 * against AI-analyzed semester date boundaries.
 */

const STORAGE_KEY = 'swu_active_school_year_id';

/**
 * Safely parse date string YYYY-MM-DD to timestamp ms
 */
function parseDateMs(dStr) {
  if (!dStr || typeof dStr !== 'string') return null;
  const parts = dStr.split('-').map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
}

/**
 * Determine the active school year from a list of school years based on today's date
 * matching semester boundaries extracted from the school calendar.
 *
 * @param {Array} schoolYears - Array of school year objects from Firestore
 * @param {Date} [targetDate] - Target date to evaluate against (defaults to now)
 * @returns {string|null} - Resolved school year ID
 */
export function resolveActiveSchoolYearId(schoolYears = [], targetDate = new Date()) {
  if (!Array.isArray(schoolYears) || schoolYears.length === 0) return null;

  const validSchoolYears = schoolYears.filter((sy) => sy && sy.id && sy.id !== 'school_calendar_pdf');
  if (validSchoolYears.length === 0) return null;

  // 1. Check if user explicitly selected a valid school year stored in localStorage
  if (typeof window !== 'undefined') {
    try {
      const storedId = localStorage.getItem(STORAGE_KEY);
      if (storedId && validSchoolYears.some((sy) => sy.id === storedId)) {
        return storedId;
      }
    } catch {
      // localStorage may be unavailable or restricted
    }
  }

  const nowMs = targetDate.getTime();
  const currentYear = targetDate.getFullYear();

  // 2. Exact match: Today's date falls within a school year's semester dates (with 14-day buffer)
  const matchingDateSy = validSchoolYears.find((sy) => {
    const semesters = Array.isArray(sy.semesters) ? sy.semesters : [];
    let earliestStart = null;
    let latestEnd = null;

    semesters.forEach((sem) => {
      const s = parseDateMs(sem.start || sem.upperclassmenStart || sem.freshmenStart);
      const e = parseDateMs(sem.end || sem.upperclassmenEnd || sem.freshmenEnd);
      if (s !== null && (earliestStart === null || s < earliestStart)) earliestStart = s;
      if (e !== null && (latestEnd === null || e > latestEnd)) latestEnd = e;
    });

    // Check legacy fields
    const s1 = parseDateMs(sy.semester1Start);
    const s2 = parseDateMs(sy.semester2End);
    if (s1 !== null && (earliestStart === null || s1 < earliestStart)) earliestStart = s1;
    if (s2 !== null && (latestEnd === null || s2 > latestEnd)) latestEnd = s2;

    if (earliestStart !== null && latestEnd !== null) {
      const buffer = 14 * 24 * 60 * 60 * 1000; // 14-day buffer before start / after end
      return nowMs >= earliestStart - buffer && nowMs <= latestEnd + buffer;
    }
    return false;
  });

  if (matchingDateSy) {
    return matchingDateSy.id;
  }

  // 3. Year number match from label (e.g. "2026-2027" -> matches 2026 & 2027)
  const matchingYearLabel = validSchoolYears.find((sy) => {
    const label = String(sy.label || sy.displayLabel || sy.id);
    const matches = label.match(/\d{4}/g);
    if (matches && matches.length >= 1) {
      const startY = parseInt(matches[0], 10);
      const endY = matches.length >= 2 ? parseInt(matches[1], 10) : startY + 1;
      return currentYear >= startY && currentYear <= endY;
    }
    return false;
  });

  if (matchingYearLabel) {
    return matchingYearLabel.id;
  }

  // 4. Closest school year by start year
  let closest = validSchoolYears[0];
  let minDiff = Infinity;

  validSchoolYears.forEach((sy) => {
    const label = String(sy.label || sy.displayLabel || sy.id);
    const matches = label.match(/\d{4}/g);
    if (matches && matches.length >= 1) {
      const startY = parseInt(matches[0], 10);
      const diff = Math.abs(currentYear - startY);
      if (diff < minDiff) {
        minDiff = diff;
        closest = sy;
      }
    }
  });

  return closest.id;
}

/**
 * Persist user-selected active school year globally
 */
export function setStoredActiveSchoolYearId(id) {
  if (typeof window === 'undefined') return;
  try {
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent('swu_active_school_year_changed', { detail: id }));
  } catch (err) {
    console.warn('Error setting active school year storage:', err);
  }
}
