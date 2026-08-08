export const INSTITUTIONAL_EMAIL_DOMAIN = 'phinmaed.com';

export const ROLES = {
  DEVELOPER: 'developer',
  REGISTRAR: 'registrar',
  DEAN: 'dean',
  TEACHER: 'teacher',
  STUDENT: 'student',
  ORGANIZATION_HEAD: 'organization_head',
  GSD: 'gsd',
  STUDENT_LIFE: 'student_life',
};

export const STAFF_VIEWER_ROLES = [
  ROLES.DEAN,
  ROLES.ORGANIZATION_HEAD,
  ROLES.TEACHER,
  ROLES.GSD,
  ROLES.STUDENT_LIFE,
];

export const MAIN_APP_ROLES = [ROLES.REGISTRAR, ...STAFF_VIEWER_ROLES];

export const USER_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

export const COLLECTIONS = {
  USERS: 'users',
  PERMISSIONS: 'permissions',
  REGISTRAR_MANAGEMENT: 'registrar_management',
  BUILDINGS: 'buildings',
  FLOORS: 'floors',
  ROOMS: 'rooms',
  ACADEMIC_CALENDARS: 'academic_calendars',
  HOLIDAYS: 'holidays',
  NO_CLASS_PERIODS: 'no_class_periods',
  SCHEDULE_PLOT_REQUESTS: 'schedule_plot_requests',
  SCHEDULE_ENTRIES: 'schedule_entries',
  APPROVAL_WORKFLOWS: 'approval_workflows',
  ROOM_RESERVATIONS: 'room_reservations',
  ROLE_DEFINITIONS: 'role_definitions',
  MAINTENANCE_SCHEDULES: 'maintenance_schedules',
  MAINTENANCE_REPORTS: 'maintenance_reports',
  NO_CLASS_DAYS: 'no_class_days',
};

/** Default permission keys assignable to Registrar accounts by Developers */
export const REGISTRAR_PERMISSION_CATALOG = [
  { id: 'system.users', label: 'Manage system users', module: 'system' },
  { id: 'system.rooms', label: 'Room accessibility', module: 'facilities' },
  { id: 'system.facilities', label: 'Facility accessibility', module: 'facilities' },
  { id: 'scheduling.manage', label: 'Scheduling operations', module: 'scheduling' },
  { id: 'scheduling.approvals', label: 'Approval management', module: 'scheduling' },
  { id: 'scheduling.calendar', label: 'Academic calendar', module: 'scheduling' },
  { id: 'reports.view', label: 'Reports & analytics', module: 'reports' },
  { id: 'buildings.manage', label: 'Building management', module: 'facilities' },
];

export const DEVELOPER_ROUTE_PREFIX = '/developer';
export const DEVELOPER_SIGNUP_PATH = '/developer-signup';
export const REGISTRAR_HOME = '/dashboard';

/** Set VITE_ALLOW_DEV_SIGNUP=true in .env for temporary Developer self-registration */
export function isDevSignupEnabled() {
  return import.meta.env.VITE_ALLOW_DEV_SIGNUP === 'true';
}
