import { ROLES } from '../firebase/constants';
import { filterReservationsForRole, filterMyReservations } from './approvalWorkflow';

/** Permission keys used across routes, nav, and page actions */
export const PERMISSIONS = {
  ROOM_AVAILABILITY_VIEW: 'room.availability.view',
  ROOM_SCHEDULES_VIEW: 'room.schedules.view',
  ACADEMIC_CALENDAR_VIEW: 'academic.calendar.view',
  SCHEDULING_SUBMIT: 'scheduling.submit',
  RESERVATION_SUBMIT: 'reservation.submit',
  APPROVAL_ENDORSE_ACTIVITY: 'approval.endorse.activity',
  ROOMS_MANAGE_ASSIGNED: 'rooms.manage.assigned',
  ROOMS_MAINTENANCE_MANAGE: 'rooms.maintenance.manage',
  APPROVAL_MANAGE_ROOM_ACTIVITY: 'approval.manage.room.activity',
  APPROVAL_MANAGE_STUDENT_ACTIVITY: 'approval.manage.student.activity',
  BUILDINGS_MANAGE: 'buildings.manage',
  REPORTS_VIEW: 'reports.view',
  SYSTEM_ADMIN: 'system.admin',
  SCHEDULING_MANAGE: 'scheduling.manage',
  CALENDAR_MANAGE: 'calendar.manage',
  APPROVAL_WORKFLOW_MANAGE: 'approval.workflow.manage',
};

const GENERAL_PERMISSIONS = [
  PERMISSIONS.ROOM_AVAILABILITY_VIEW,
  PERMISSIONS.ROOM_SCHEDULES_VIEW,
  PERMISSIONS.ACADEMIC_CALENDAR_VIEW,
];

const ROLE_PERMISSIONS = {
  [ROLES.REGISTRAR]: Object.values(PERMISSIONS).filter(
    (p) => p !== PERMISSIONS.ROOMS_MAINTENANCE_MANAGE
  ),
  [ROLES.DEAN]: [
    ...GENERAL_PERMISSIONS,
    PERMISSIONS.SCHEDULING_SUBMIT,
    PERMISSIONS.RESERVATION_SUBMIT,
    PERMISSIONS.APPROVAL_ENDORSE_ACTIVITY,
    PERMISSIONS.ROOMS_MANAGE_ASSIGNED,
    PERMISSIONS.SCHEDULING_MANAGE,
  ],
  [ROLES.GSD]: [
    ...GENERAL_PERMISSIONS,
    PERMISSIONS.ROOMS_MAINTENANCE_MANAGE,
    PERMISSIONS.APPROVAL_MANAGE_ROOM_ACTIVITY,
    PERMISSIONS.BUILDINGS_MANAGE,
  ],
  [ROLES.STUDENT_LIFE]: [
    ...GENERAL_PERMISSIONS,
    PERMISSIONS.APPROVAL_MANAGE_STUDENT_ACTIVITY,
    PERMISSIONS.RESERVATION_SUBMIT,
  ],
  [ROLES.TEACHER]: [
    ...GENERAL_PERMISSIONS,
    PERMISSIONS.RESERVATION_SUBMIT,
  ],
  [ROLES.ORGANIZATION_HEAD]: [
    ...GENERAL_PERMISSIONS,
    PERMISSIONS.RESERVATION_SUBMIT,
  ],
};

/** Route → required permission (registrar bypasses via full access) */
export const ROUTE_PERMISSIONS = {
  '/dashboard': null,
  '/approvals': null,
  '/course-scheduling': PERMISSIONS.SCHEDULING_SUBMIT,
  '/teachers': null,
  '/courses': null,
  '/room-availability': null,
  '/room-finder': null,
  '/schedule-history': null,
  '/building-management': null,
  '/assigned-rooms': null,
  '/academic-calendar': PERMISSIONS.ACADEMIC_CALENDAR_VIEW,
  '/system-settings': null,

  '/college-inventory': null,
  '/system-administration': PERMISSIONS.SYSTEM_ADMIN,
  '/approval-workflow': PERMISSIONS.APPROVAL_WORKFLOW_MANAGE,
  '/maintenance-dashboard': PERMISSIONS.ROOMS_MAINTENANCE_MANAGE,
};

export const NAV_ITEMS = {
  dashboard: { label: 'Dashboard', path: '/dashboard', permission: null },
  systemAdmin: { label: 'User Management', path: '/system-administration', permission: PERMISSIONS.SYSTEM_ADMIN },
  buildings: { label: 'Buildings', path: '/building-management', permission: null },
  assignedRooms: { label: 'Assigned Rooms', path: '/assigned-rooms', permission: PERMISSIONS.ROOMS_MANAGE_ASSIGNED },
  teachers: { label: 'Teachers', path: '/teachers', permission: null },
  collegeInventory: { label: 'College Inventory', path: '/college-inventory', permission: null },
  courseScheduling: { label: 'Course Scheduling', path: '/course-scheduling', permission: PERMISSIONS.SCHEDULING_SUBMIT },
  approvalWorkflow: { label: 'Approval Workflow', path: '/approval-workflow', permission: PERMISSIONS.APPROVAL_WORKFLOW_MANAGE },
  roomFinder: { label: 'Room Finder', path: '/room-finder', permission: null },
  academicCalendar: { label: 'School Calendar', path: '/academic-calendar', permission: PERMISSIONS.ACADEMIC_CALENDAR_VIEW },
  approvals: { label: 'Request Management', path: '/approvals', permission: null },
  maintenanceDashboard: { label: 'Maintenance Dashboard', path: '/maintenance-dashboard', permission: PERMISSIONS.ROOMS_MAINTENANCE_MANAGE },
  systemSettings: { label: 'System Settings', path: '/system-settings', permission: null },
};

const ROLE_NAV_KEYS = {
  [ROLES.REGISTRAR]: [
    'dashboard',
    'systemAdmin',
    'buildings',
    'teachers',
    'collegeInventory',
    'courseScheduling',
    'approvalWorkflow',
    'roomFinder',
    'approvals',
    'systemSettings',
  ],
  [ROLES.DEAN]: [
    'dashboard',
    'buildings',
    'assignedRooms',
    'teachers',
    'courseScheduling',
    'approvalWorkflow',
    'roomFinder',
    'academicCalendar',
    'approvals',
  ],
  [ROLES.GSD]: [
    'dashboard',
    'buildings',
    'roomFinder',
    'academicCalendar',
    'approvals',
    'maintenanceDashboard',
  ],
  [ROLES.STUDENT_LIFE]: [
    'dashboard',
    'buildings',
    'roomFinder',
    'academicCalendar',
    'approvals',
  ],
  [ROLES.TEACHER]: [
    'dashboard',
    'buildings',
    'roomFinder',
    'academicCalendar',
    'approvals',
  ],
  [ROLES.ORGANIZATION_HEAD]: [
    'dashboard',
    'buildings',
    'roomFinder',
    'academicCalendar',
    'approvals',
  ],
};

const ROLE_LABELS = {
  [ROLES.DEAN]: 'Dean',
  [ROLES.GSD]: 'GSD',
  [ROLES.STUDENT_LIFE]: 'Student Life',
  [ROLES.TEACHER]: 'Teacher',
  [ROLES.ORGANIZATION_HEAD]: 'Organization Head',
  [ROLES.REGISTRAR]: 'Registrar',
};

/** Static defaults used to seed Firestore role definitions */
export const DEFAULT_ROLE_DEFINITIONS = Object.entries(ROLE_NAV_KEYS)
  .filter(([role]) => role !== ROLES.REGISTRAR && role !== ROLES.DEVELOPER)
  .map(([role]) => ({
    id: role,
    label: ROLE_LABELS[role] || role,
    isSystem: true,
    permissions: ROLE_PERMISSIONS[role] || [],
    navKeys: ROLE_NAV_KEYS[role] || [],
  }));

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || role;
}

export function getRoleDefinition(role, roleDefinitions = {}) {
  if (roleDefinitions[role]) return roleDefinitions[role];
  return {
    id: role,
    label: getRoleLabel(role),
    permissions: ROLE_PERMISSIONS[role] || [],
    navKeys: ROLE_NAV_KEYS[role] || ROLE_NAV_KEYS[ROLES.TEACHER] || [],
    isSystem: Boolean(ROLE_PERMISSIONS[role]),
  };
}

export function getEffectivePermissions(profile, roleDefinitions = {}) {
  if (!profile?.role) return [];
  if (profile.role === ROLES.REGISTRAR) return Object.values(PERMISSIONS);
  if (Array.isArray(profile.permissions) && profile.permissions.length > 0) {
    return profile.permissions;
  }
  return getRoleDefinition(profile.role, roleDefinitions).permissions || [];
}

export const REGISTRAR_NAV_ORDER = [
  'dashboard',
  'systemAdmin',
  'buildings',
  'assignedRooms',
  'teachers',
  'collegeInventory',
  'courseScheduling',
  'approvalWorkflow',
  'roomFinder',
  'academicCalendar',
  'approvals',
  'maintenanceDashboard',
  'systemSettings',
];

export function sortNavKeys(navKeys = []) {
  if (!Array.isArray(navKeys)) return [];
  const orderMap = new Map(REGISTRAR_NAV_ORDER.map((key, index) => [key, index]));
  return [...navKeys].sort((a, b) => {
    const orderA = orderMap.has(a) ? orderMap.get(a) : 999;
    const orderB = orderMap.has(b) ? orderMap.get(b) : 999;
    return orderA - orderB;
  });
}

export function getEffectiveNavKeys(profile, roleDefinitions = {}) {
  if (!profile?.role) return [];
  let keys = [];
  if (profile.role === ROLES.REGISTRAR) {
    keys = ROLE_NAV_KEYS[ROLES.REGISTRAR] || [];
  } else if (Array.isArray(profile.navKeys) && profile.navKeys.length > 0) {
    keys = profile.navKeys;
  } else {
    keys = getRoleDefinition(profile.role, roleDefinitions).navKeys || [];
  }

  const sorted = sortNavKeys(keys);
  const canMaintenance = profile.role === ROLES.GSD || (profile.role !== ROLES.REGISTRAR && hasEffectivePermission(profile, PERMISSIONS.ROOMS_MAINTENANCE_MANAGE, roleDefinitions));
  if (canMaintenance && !sorted.includes('maintenanceDashboard')) {
    sorted.push('maintenanceDashboard');
    return sortNavKeys(sorted);
  }
  return sorted;
}

export function hasEffectivePermission(profile, permission, roleDefinitions = {}) {
  if (!profile?.role || !permission) return false;
  if (profile.role === ROLES.REGISTRAR) {
    if (permission === PERMISSIONS.ROOMS_MAINTENANCE_MANAGE) return false;
    return true;
  }
  return getEffectivePermissions(profile, roleDefinitions).includes(permission);
}

export function getEffectiveNavItems(profile, roleDefinitions = {}) {
  const keys = getEffectiveNavKeys(profile, roleDefinitions);
  const perms = getEffectivePermissions(profile, roleDefinitions);
  return keys
    .map((key) => NAV_ITEMS[key])
    .filter(Boolean)
    .filter((item) => !item.permission || perms.includes(item.permission));
}

export function canAccessRouteForProfile(profile, pathname, roleDefinitions = {}) {
  if (!profile?.role) return false;
  if (pathname.startsWith('/maintenance-dashboard') && profile.role === ROLES.REGISTRAR) {
    return false;
  }
  if (profile.role === ROLES.REGISTRAR) return true;

  const basePath = pathname.split('/').slice(0, 2).join('/') || pathname;
  const normalized = basePath.startsWith('/building') || basePath.startsWith('/room')
    ? '/building-management'
    : basePath.startsWith('/request') || basePath.startsWith('/academic-request')
      ? '/approvals'
      : pathname;

  const required = ROUTE_PERMISSIONS[normalized];
  if (required === undefined) return true;
  if (required === null) return getEffectivePermissions(profile, roleDefinitions).length > 0;
  return hasEffectivePermission(profile, required, roleDefinitions);
}

export function getPermissionsForRole(role, roleDefinitions = {}) {
  return getRoleDefinition(role, roleDefinitions).permissions || [];
}

export function hasPermission(role, permission, roleDefinitions = {}) {
  if (!role || !permission) return false;
  if (role === ROLES.REGISTRAR) {
    if (permission === PERMISSIONS.ROOMS_MAINTENANCE_MANAGE) return false;
    return true;
  }
  return getPermissionsForRole(role, roleDefinitions).includes(permission);
}

export function canAccessRoute(role, pathname, roleDefinitions = {}) {
  if (!role) return false;
  if (role === ROLES.REGISTRAR && pathname.startsWith('/maintenance-dashboard')) return false;
  if (role === ROLES.REGISTRAR) return true;
  return canAccessRouteForProfile({ role }, pathname, roleDefinitions);
}

export function getNavItemsForRole(role, roleDefinitions = {}) {
  const rawKeys = getRoleDefinition(role, roleDefinitions).navKeys || ROLE_NAV_KEYS[role] || ROLE_NAV_KEYS[ROLES.TEACHER] || [];
  const perms = getPermissionsForRole(role, roleDefinitions);
  let keys = sortNavKeys(rawKeys);
  if ((role === ROLES.GSD || (role !== ROLES.REGISTRAR && perms.includes(PERMISSIONS.ROOMS_MAINTENANCE_MANAGE))) && !keys.includes('maintenanceDashboard')) {
    keys = sortNavKeys([...keys, 'maintenanceDashboard']);
  }

  return keys
    .map((key) => NAV_ITEMS[key])
    .filter(Boolean)
    .filter((item) => !item.permission || perms.includes(item.permission));
}

export function canSubmitReservation(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.RESERVATION_SUBMIT, roleDefinitions);
  return hasPermission(role, PERMISSIONS.RESERVATION_SUBMIT, roleDefinitions);
}

export function canSubmitCourseSchedule(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.SCHEDULING_SUBMIT, roleDefinitions);
  return hasPermission(role, PERMISSIONS.SCHEDULING_SUBMIT, roleDefinitions);
}

export function canEndorseActivity(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.APPROVAL_ENDORSE_ACTIVITY, roleDefinitions);
  return hasPermission(role, PERMISSIONS.APPROVAL_ENDORSE_ACTIVITY, roleDefinitions);
}

export function canManageRoomActivityApproval(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.APPROVAL_MANAGE_ROOM_ACTIVITY, roleDefinitions);
  return hasPermission(role, PERMISSIONS.APPROVAL_MANAGE_ROOM_ACTIVITY, roleDefinitions);
}

export function canManageStudentActivityApproval(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.APPROVAL_MANAGE_STUDENT_ACTIVITY, roleDefinitions);
  return hasPermission(role, PERMISSIONS.APPROVAL_MANAGE_STUDENT_ACTIVITY, roleDefinitions);
}

export function canManageRoomMaintenance(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.ROOMS_MAINTENANCE_MANAGE, roleDefinitions);
  return hasPermission(role, PERMISSIONS.ROOMS_MAINTENANCE_MANAGE, roleDefinitions);
}

export function canManageAssignedRooms(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.ROOMS_MANAGE_ASSIGNED, roleDefinitions);
  return hasPermission(role, PERMISSIONS.ROOMS_MANAGE_ASSIGNED, roleDefinitions);
}

export function canManageBuildings(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.BUILDINGS_MANAGE, roleDefinitions);
  return hasPermission(role, PERMISSIONS.BUILDINGS_MANAGE, roleDefinitions);
}

export function canManageApprovalWorkflow(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.APPROVAL_WORKFLOW_MANAGE, roleDefinitions);
  return hasPermission(role, PERMISSIONS.APPROVAL_WORKFLOW_MANAGE, roleDefinitions);
}

export function canManageCalendar(role, roleDefinitions = {}, profile = null) {
  if (profile) return hasEffectivePermission(profile, PERMISSIONS.CALENDAR_MANAGE, roleDefinitions);
  return hasPermission(role, PERMISSIONS.CALENDAR_MANAGE, roleDefinitions);
}

export function canManageAllRooms(role) {
  return role === ROLES.REGISTRAR;
}

export function canEditRoom(profile, room, roleDefinitions = {}) {
  if (!profile || !room) return false;
  if (canManageAllRooms(profile.role)) return true; // Registrar can edit all rooms

  const uid = profile.uid || profile.id;
  const profileName = (profile.name || profile.displayName || '').toLowerCase();
  const roomId = room.docId || room.id || room.roomCode;
  const assignedRooms = profile.assignedRoomIds || [];
  const assignedBuildings = (profile.assignedBuildingIds || []).map(String);

  // Check direct assignment on room doc
  if (room.managedBy && (room.managedBy === uid || String(room.managedBy) === String(uid))) return true;
  if (profileName && room.managedByName && room.managedByName.toLowerCase() === profileName) return true;

  // Check profile's explicit assigned rooms or buildings
  if (assignedRooms.includes(roomId) || (room.docId && assignedRooms.includes(room.docId)) || (room.roomCode && assignedRooms.includes(room.roomCode))) return true;
  if (room.buildingId && assignedBuildings.includes(String(room.buildingId))) return true;

  return false;
}

export function canApproveAnyRequest(role, roleDefinitions = {}, profile = null) {
  if (role === ROLES.REGISTRAR) return true;
  return (
    canEndorseActivity(role, roleDefinitions, profile) ||
    canManageRoomActivityApproval(role, roleDefinitions, profile) ||
    canManageStudentActivityApproval(role, roleDefinitions, profile)
  );
}

export function getApprovalsNavLabel(role, profile = null, roleDefinitions = {}) {
  const canApprove = canApproveAnyRequest(role, roleDefinitions, profile);
  if (!canApprove) return 'My Reservations';

  if (role === ROLES.TEACHER || role === ROLES.ORGANIZATION_HEAD) return 'Room Reservations';
  if (role === ROLES.GSD) return 'Room Activity Requests';
  if (role === ROLES.STUDENT_LIFE) return 'Activity Requests';
  if (role === ROLES.DEAN) return 'Endorsement & Requests';
  return 'Request Management';
}

export function filterRequestsForRole(requests, role, profile, roleDefinitions = {}) {
  if (!requests?.length || !role) return [];
  if (profile && !canApproveAnyRequest(role, roleDefinitions, profile)) return [];

  const hasDynamicWorkflow = requests.some((r) => Array.isArray(r.approvalRecords) && r.approvalRecords.length);
  if (hasDynamicWorkflow) {
    return filterReservationsForRole(requests, role, profile);
  }

  if (role === ROLES.REGISTRAR) return requests;
  if (role === ROLES.DEAN) {
    return requests.filter(
      (r) => r.type === 'academic' || r.type === 'non-academic',
    );
  }
  if (role === ROLES.GSD) {
    return requests.filter((r) => r.type === 'non-academic' || r.gsdApplicable !== false);
  }
  if (role === ROLES.STUDENT_LIFE) {
    return requests.filter(
      (r) => r.type === 'non-academic' && (r.category === 'student-activity' || r.reqType?.toLowerCase?.().includes('activity')),
    );
  }
  if (role === ROLES.TEACHER || role === ROLES.ORGANIZATION_HEAD) {
    const email = (profile?.email || '').toLowerCase();
    return requests.filter((r) => (r.requestorEmail || r.requestor || '').toLowerCase().includes(email.split('@')[0]));
  }
  return requests;
}

export function filterMyRequests(requests, profile) {
  if (!requests?.length || !profile) return [];
  
  const hasDynamicWorkflow = requests.some((r) => Array.isArray(r.approvalRecords) && r.approvalRecords.length);
  if (hasDynamicWorkflow) {
    return filterMyReservations(requests, profile);
  }
  
  // Fallback for legacy requests
  return requests.filter((r) => r.createdByUid === profile.uid);
}

export function canCreateRequestType(role, requestType, roleDefinitions = {}, profile = null) {
  if (role === ROLES.REGISTRAR) return true;
  if (requestType === 'academic') {
    return canSubmitCourseSchedule(role, roleDefinitions, profile) || canEndorseActivity(role, roleDefinitions, profile);
  }
  return canSubmitReservation(role, roleDefinitions, profile);
}
