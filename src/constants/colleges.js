/**
 * College definitions for the university
 * Used for dean assignments, teacher assignments, and reservation routing
 */

export const COLLEGES = {
  CAS: 'CAS',
  MEDICINE: 'Medicine',
  IT_ENGINEERING: 'IT',
  BUSINESS: 'Business',
  NURSING: 'Nursing',
  EDUCATION: 'Education',
  LAW: 'Law',
};

export const COLLEGE_OPTIONS = [
  { value: COLLEGES.CAS, label: 'College of Arts and Sciences (CAS)' },
  { value: COLLEGES.MEDICINE, label: 'College of Medicine' },
  { value: COLLEGES.IT_ENGINEERING, label: 'College of IT / Engineering' },
  { value: COLLEGES.BUSINESS, label: 'College of Business' },
  { value: COLLEGES.NURSING, label: 'College of Nursing' },
  { value: COLLEGES.EDUCATION, label: 'College of Education' },
  { value: COLLEGES.LAW, label: 'College of Law' },
];

export function getCollegeLabel(value) {
  const college = COLLEGE_OPTIONS.find((c) => c.value === value);
  return college?.label || value;
}

export function normalizeCollegeValue(input) {
  if (!input) return '';
  const normalized = input.trim();
  const found = COLLEGE_OPTIONS.find(
    (c) => c.value === normalized || c.label.toLowerCase() === normalized.toLowerCase()
  );
  return found?.value || normalized;
}

/**
 * Roles that belong to / require a college assignment (e.g. Dean, Teacher, Organization Head)
 * Non-college roles (e.g. Guard, GSD, Student Life, Registrar) return false
 */
export function requiresCollege(roleValue, roleDefinitions = {}) {
  if (!roleValue) return false;
  const normalized = roleValue.toLowerCase();

  // Check if defined in roleDefinitions
  const def = roleDefinitions[roleValue] || roleDefinitions[normalized];
  if (def && typeof def.requiresCollege === 'boolean') {
    return def.requiresCollege;
  }

  // Built-in college roles
  const COLLEGE_ROLES = ['dean', 'teacher', 'organization_head'];
  return COLLEGE_ROLES.includes(normalized);
}

/** Department has been removed; College is the sole basis */
export function requiresDepartment() {
  return false;
}

const COLLEGE_ACRONYM_MAP = {
  bsit: 'College of Information Technology',
  it: 'College of Information Technology',
  cit: 'College of Information Technology',
  infotech: 'College of Information Technology',
  'information technology': 'College of Information Technology',
  cs: 'College of Computer Studies',

  cas: 'College of Arts and Sciences',
  arts: 'College of Arts and Sciences',
  sciences: 'College of Arts and Sciences',

  med: 'College of Medicine',
  cmed: 'College of Medicine',
  medicine: 'College of Medicine',

  con: 'College of Nursing',
  bsn: 'College of Nursing',
  nursing: 'College of Nursing',

  cba: 'College of Business Administration',
  business: 'College of Business Administration',
  accountancy: 'College of Business Administration',

  sea: 'School of Engineering and Architecture',
  engineering: 'School of Engineering and Architecture',
  architecture: 'School of Engineering and Architecture',

  educ: 'College of Education',
  education: 'College of Education',

  law: 'College of Law',
  juris: 'College of Law',
  pharma: 'College of Pharmacy',
  pharmacy: 'College of Pharmacy',
  dentistry: 'College of Dentistry',
  optometry: 'College of Optometry',
};

export function formatCollegeName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();

  // If already formal full name
  if (lower.startsWith('college of') || lower.startsWith('school of') || lower.startsWith('department of')) {
    return trimmed;
  }

  // Exact acronym lookup
  if (COLLEGE_ACRONYM_MAP[lower]) {
    return COLLEGE_ACRONYM_MAP[lower];
  }

  // Substring match
  for (const [key, full] of Object.entries(COLLEGE_ACRONYM_MAP)) {
    if (key.length > 2 && lower.includes(key)) {
      return full;
    }
  }

  return trimmed;
}
