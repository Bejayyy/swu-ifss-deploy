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
 * Roles that require college assignment
 * GSD and Student Life are administrative offices, not part of any college
 */
export function requiresCollege(roleValue) {
  if (!roleValue) return false;
  return roleValue !== 'gsd' && roleValue !== 'student-life';
}

/**
 * Roles that require department assignment
 * GSD and Student Life are standalone administrative offices
 */
export const DEPARTMENT_REQUIRED_ROLES = ['teacher', 'organization_head', 'dean', 'registrar'];

export function requiresDepartment(roleValue) {
  return DEPARTMENT_REQUIRED_ROLES.includes(roleValue);
}
