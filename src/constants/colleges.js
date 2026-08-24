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

export const COLLEGE_ACRONYM_MAP = {
  // Medical Technology & Medical Laboratory Science
  bsmt: 'College of Medical Technology',
  mt: 'College of Medical Technology',
  mls: 'College of Medical Laboratory Science',
  bsmls: 'College of Medical Laboratory Science',
  'medical technology': 'College of Medical Technology',
  'medical lab': 'College of Medical Laboratory Science',
  'medical laboratory science': 'College of Medical Laboratory Science',

  // Nursing
  bsn: 'College of Nursing',
  con: 'College of Nursing',
  nursing: 'College of Nursing',

  // Medicine
  med: 'College of Medicine',
  cmed: 'College of Medicine',
  medicine: 'College of Medicine',
  som: 'School of Medicine',

  // Dentistry
  dent: 'College of Dentistry',
  dentistry: 'College of Dentistry',
  dmd: 'College of Dentistry',
  cod: 'College of Dentistry',

  // Pharmacy
  pharma: 'College of Pharmacy',
  pharmacy: 'College of Pharmacy',
  bspharm: 'College of Pharmacy',
  bspharma: 'College of Pharmacy',
  cop: 'College of Pharmacy',

  // Optometry
  optom: 'College of Optometry',
  optometry: 'College of Optometry',
  od: 'College of Optometry',
  coo: 'College of Optometry',

  // Physical Therapy & Rehab
  bspt: 'College of Physical Therapy',
  pt: 'College of Physical Therapy',
  'physical therapy': 'College of Physical Therapy',
  bsot: 'College of Occupational Therapy',
  ot: 'College of Occupational Therapy',
  'occupational therapy': 'College of Occupational Therapy',

  // Radiologic Technology
  bsrt: 'College of Radiologic Technology',
  rt: 'College of Radiologic Technology',
  radtech: 'College of Radiologic Technology',
  'radiologic technology': 'College of Radiologic Technology',

  // Veterinary Medicine
  vetmed: 'College of Veterinary Medicine',
  vet: 'College of Veterinary Medicine',
  dvm: 'College of Veterinary Medicine',
  cvm: 'College of Veterinary Medicine',

  // IT & Computer Studies & Engineering
  bsit: 'College of Information Technology',
  it: 'College of Information Technology',
  cit: 'College of Information Technology',
  cite: 'College of Information Technology and Engineering',
  infotech: 'College of Information Technology',
  'information technology': 'College of Information Technology',
  cs: 'College of Computer Studies',
  bscs: 'College of Computer Studies',
  'computer science': 'College of Computer Studies',
  ccs: 'College of Computer Studies',
  sea: 'School of Engineering and Architecture',
  engineering: 'College of Engineering',
  bsce: 'College of Civil Engineering',
  bsee: 'College of Electrical Engineering',
  bsme: 'College of Mechanical Engineering',
  bsece: 'College of Electronics Engineering',
  bscpe: 'College of Computer Engineering',
  architecture: 'College of Architecture',
  bsarch: 'College of Architecture',

  // Arts and Sciences
  cas: 'College of Arts and Sciences',
  coas: 'College of Arts and Sciences',
  arts: 'College of Arts and Sciences',
  sciences: 'College of Arts and Sciences',
  'arts and sciences': 'College of Arts and Sciences',
  psych: 'College of Arts and Sciences - Department of Psychology',
  bspsych: 'College of Arts and Sciences - Department of Psychology',
  psychology: 'College of Arts and Sciences - Department of Psychology',
  comm: 'College of Arts and Sciences - Department of Communication',
  communication: 'College of Arts and Sciences - Department of Communication',
  polsci: 'College of Arts and Sciences - Department of Political Science',

  // Business & Management & Accountancy
  cba: 'College of Business Administration',
  business: 'College of Business Administration',
  bsba: 'College of Business Administration',
  cma: 'College of Management and Accountancy',
  bsa: 'College of Accountancy',
  accountancy: 'College of Accountancy',
  accounting: 'College of Accountancy',
  bma: 'College of Business and Management',
  management: 'College of Business Administration',
  marketing: 'College of Business Administration',
  finance: 'College of Business Administration',

  // Hospitality & Tourism
  bstm: 'College of Tourism and Hospitality Management',
  tourism: 'College of Tourism and Hospitality Management',
  bshm: 'College of Hospitality Management',
  hospitality: 'College of Hospitality Management',
  hrm: 'College of Hospitality Management',
  cthm: 'College of Tourism and Hospitality Management',

  // Criminology & Criminal Justice
  crim: 'College of Criminology',
  bscrim: 'College of Criminology',
  criminology: 'College of Criminology',
  coc: 'College of Criminology',
  ccj: 'College of Criminal Justice',

  // Education
  educ: 'College of Education',
  education: 'College of Education',
  bsed: 'College of Education',
  beed: 'College of Elementary Education',
  coe: 'College of Education',

  // Law
  law: 'College of Law',
  juris: 'College of Law',
  jd: 'College of Law',
  col: 'College of Law',

  // Senior High School & Basic Ed
  shs: 'Senior High School',
  shahs: 'School of Health and Allied Health Sciences',
  'senior high': 'Senior High School',
  'senior high school': 'Senior High School',
  basic: 'Basic Education Department',
  jhs: 'Junior High School',

  // Administrative & Non-Academic Offices
  gsd: 'General Services Department',
  'general services': 'General Services Department',
  student_life: 'Student Life Office',
  'student life': 'Student Life Office',
  slo: 'Student Life Office',
  registrar: 'Office of the University Registrar',
  'office of the registrar': 'Office of the University Registrar',
  property_office: 'Property and Facilities Management Office',
  property: 'Property and Facilities Management Office',
  vp_academics: 'Office of the Vice President for Academic Affairs',
  vpaa: 'Office of the Vice President for Academic Affairs',
  chancellor: 'Office of the Chancellor',
  developer: 'System Administration',
};

export function formatCollegeName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();

  // If already formal full name
  if (
    lower.startsWith('college of') ||
    lower.startsWith('school of') ||
    lower.startsWith('department of') ||
    lower.startsWith('office of')
  ) {
    return trimmed;
  }

  // Exact acronym lookup
  if (COLLEGE_ACRONYM_MAP[lower]) {
    return COLLEGE_ACRONYM_MAP[lower];
  }

  // Stripped alphanumeric lookup (e.g. "BS-MT" -> "bsmt")
  const stripped = lower.replace(/[^a-z0-9]/g, '');
  if (COLLEGE_ACRONYM_MAP[stripped]) {
    return COLLEGE_ACRONYM_MAP[stripped];
  }

  // Token-based matching (e.g. "BSMT Department")
  const tokens = lower.split(/[\s\-_\/]+/);
  for (const token of tokens) {
    if (COLLEGE_ACRONYM_MAP[token]) {
      return COLLEGE_ACRONYM_MAP[token];
    }
  }

  // Substring match
  for (const [key, full] of Object.entries(COLLEGE_ACRONYM_MAP)) {
    if (key.length > 2 && lower.includes(key)) {
      return full;
    }
  }

  return trimmed;
}
