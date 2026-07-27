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
