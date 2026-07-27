import { NAV_ITEMS, PERMISSIONS, sortNavKeys } from './rolePermissions';

/** Categorized access catalog for role & user permission management */
export const ACCESS_CATALOG = [
  {
    id: 'navigation',
    label: 'Navigation',
    description: 'Sidebar pages visible to this role or user',
    items: [
      { type: 'nav', navKey: 'dashboard', label: 'Dashboard', description: 'Home dashboard overview' },
      { type: 'nav', navKey: 'systemAdmin', label: 'User Management', description: 'Manage users and roles', requiresPermission: PERMISSIONS.SYSTEM_ADMIN },
      { type: 'nav', navKey: 'buildings', label: 'Buildings', description: 'Building and room directory', requiresPermission: PERMISSIONS.ROOM_AVAILABILITY_VIEW },
      { type: 'nav', navKey: 'roomFinder', label: 'Room Finder', description: 'Search for available rooms', requiresPermission: PERMISSIONS.ROOM_AVAILABILITY_VIEW },
      { type: 'nav', navKey: 'academicCalendar', label: 'Academic Calendar', description: 'School year and calendar settings', requiresPermission: PERMISSIONS.ACADEMIC_CALENDAR_VIEW },
      { type: 'nav', navKey: 'courseScheduling', label: 'Course Scheduling', description: 'Plot and manage course schedules', requiresPermission: PERMISSIONS.SCHEDULING_SUBMIT },
      { type: 'nav', navKey: 'collegeInventory', label: 'College Inventory', description: 'Manage colleges and departments', requiresPermission: PERMISSIONS.SYSTEM_ADMIN },
      { type: 'nav', navKey: 'approvalWorkflow', label: 'Approval Workflow', description: 'Configure approval workflows', requiresPermission: PERMISSIONS.APPROVAL_WORKFLOW_MANAGE },
      { type: 'nav', navKey: 'approvals', label: 'Request Management', description: 'View and manage requests' },
      { type: 'nav', navKey: 'reports', label: 'Reports & Analytics', description: 'System reports', requiresPermission: PERMISSIONS.REPORTS_VIEW },
      { type: 'nav', navKey: 'maintenanceDashboard', label: 'Maintenance Dashboard', description: 'Manage room maintenance', requiresPermission: PERMISSIONS.ROOMS_MAINTENANCE_MANAGE },
    ],
  },
  {
    id: 'scheduling',
    label: 'Scheduling & Calendar',
    description: 'Course plotting, schedules, and academic calendar',
    items: [
      { type: 'permission', permission: PERMISSIONS.ROOM_AVAILABILITY_VIEW, label: 'View room availability', description: 'See room availability and schedules' },
      { type: 'permission', permission: PERMISSIONS.ROOM_SCHEDULES_VIEW, label: 'View schedule history', description: 'Access schedule history records' },
      { type: 'permission', permission: PERMISSIONS.ACADEMIC_CALENDAR_VIEW, label: 'View academic calendar', description: 'Read academic calendar data' },
      { type: 'permission', permission: PERMISSIONS.SCHEDULING_SUBMIT, label: 'Submit course schedules', description: 'Plot and submit course schedules' },
      { type: 'permission', permission: PERMISSIONS.SCHEDULING_MANAGE, label: 'Manage scheduling operations', description: 'Advanced scheduling management' },
      { type: 'permission', permission: PERMISSIONS.CALENDAR_MANAGE, label: 'Manage academic calendar', description: 'Edit holidays, no-class periods, and exam dates' },
    ],
  },
  {
    id: 'reservations',
    label: 'Reservations',
    description: 'Room booking and reservation requests',
    items: [
      { type: 'permission', permission: PERMISSIONS.RESERVATION_SUBMIT, label: 'Submit room reservations', description: 'Create room reservation requests' },
    ],
  },
  {
    id: 'approvals',
    label: 'Approvals & Requests',
    description: 'Endorse, review, and configure approval flows',
    items: [
      { type: 'permission', permission: PERMISSIONS.APPROVAL_ENDORSE_ACTIVITY, label: 'Endorse activities', description: 'Endorse academic and non-academic requests' },
      { type: 'permission', permission: PERMISSIONS.APPROVAL_MANAGE_ROOM_ACTIVITY, label: 'Manage room activity approvals', description: 'Approve GSD room activity requests' },
      { type: 'permission', permission: PERMISSIONS.APPROVAL_MANAGE_STUDENT_ACTIVITY, label: 'Manage student activity approvals', description: 'Approve student life activity requests' },
      { type: 'permission', permission: PERMISSIONS.APPROVAL_WORKFLOW_MANAGE, label: 'Manage approval workflows', description: 'Configure multi-level approval workflows' },
    ],
  },
  {
    id: 'facilities',
    label: 'Facilities & Rooms',
    description: 'Building, room, and maintenance access',
    items: [
      { type: 'permission', permission: PERMISSIONS.ROOMS_MANAGE_ASSIGNED, label: 'Manage assigned rooms', description: 'Edit rooms assigned to this user' },
      { type: 'permission', permission: PERMISSIONS.ROOMS_MAINTENANCE_MANAGE, label: 'Manage room maintenance', description: 'Update maintenance status on rooms' },
      { type: 'permission', permission: PERMISSIONS.BUILDINGS_MANAGE, label: 'Manage buildings', description: 'Add and edit buildings, floors, and rooms' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    description: 'System configuration and user management',
    items: [
      { type: 'permission', permission: PERMISSIONS.SYSTEM_ADMIN, label: 'System administration', description: 'Manage users, roles, and system settings' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Analytics and reporting',
    items: [
      { type: 'permission', permission: PERMISSIONS.REPORTS_VIEW, label: 'View reports & analytics', description: 'Access reports dashboard' },
    ],
  },
];

export function getAllCatalogPermissionKeys() {
  const keys = new Set();
  ACCESS_CATALOG.forEach((cat) => {
    cat.items.forEach((item) => {
      if (item.type === 'permission' && item.permission) keys.add(item.permission);
    });
  });
  return [...keys];
}

export function getAllCatalogNavKeys() {
  const keys = new Set();
  ACCESS_CATALOG.forEach((cat) => {
    cat.items.forEach((item) => {
      if (item.type === 'nav' && item.navKey) keys.add(item.navKey);
    });
  });
  return [...keys];
}

/** Permissions required for selected nav keys */
export function permissionsForNavKeys(navKeys = []) {
  const perms = new Set();
  navKeys.forEach((navKey) => {
    const nav = NAV_ITEMS[navKey];
    if (nav?.permission) perms.add(nav.permission);
    const catalogItem = ACCESS_CATALOG[0].items.find((i) => i.navKey === navKey);
    if (catalogItem?.requiresPermission) perms.add(catalogItem.requiresPermission);
  });
  return [...perms];
}

export function toggleNavKey(navKeys, navKey, enabled) {
  const set = new Set(navKeys);
  if (enabled) set.add(navKey);
  else set.delete(navKey);
  return sortNavKeys([...set]);
}

export function togglePermission(permissions, permission, enabled) {
  const set = new Set(permissions);
  if (enabled) set.add(permission);
  else set.delete(permission);
  return [...set];
}

/** When enabling a nav item, also enable its required permissions */
export function applyNavToggle(navKeys, permissions, navKey, enabled) {
  const nextNav = toggleNavKey(navKeys, navKey, enabled);
  let nextPerms = [...permissions];
  if (enabled) {
    const required = permissionsForNavKeys([navKey]);
    required.forEach((p) => {
      if (!nextPerms.includes(p)) nextPerms = togglePermission(nextPerms, p, true);
    });
  }
  return { navKeys: nextNav, permissions: nextPerms };
}
