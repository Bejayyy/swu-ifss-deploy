import { NAV_ITEMS, PERMISSIONS, sortNavKeys } from './rolePermissions';

/** Navigation-centric access catalog mapping each page directly to its action permissions */
export const NAV_PERMISSIONS_CATALOG = [
  {
    navKey: 'dashboard',
    label: 'Dashboard',
    description: 'Home overview dashboard',
    actions: [],
  },
  {
    navKey: 'systemAdmin',
    label: 'User Management',
    description: 'Manage users, staff, and role definitions',
    actions: [
      { permission: PERMISSIONS.SYSTEM_ADMIN, label: 'System administration', description: 'Create, edit, and deactivate user accounts and manage custom roles' },
    ],
  },
  {
    navKey: 'buildings',
    label: 'Buildings',
    description: 'Building and room directory',
    actions: [
      { permission: PERMISSIONS.ROOM_AVAILABILITY_VIEW, label: 'View room availability', description: 'See room schedules and availability calendars' },
      { permission: PERMISSIONS.ROOMS_MANAGE_ASSIGNED, label: 'Manage assigned rooms', description: 'Edit room details and capacity for assigned rooms' },
      { permission: PERMISSIONS.BUILDINGS_MANAGE, label: 'Manage & delete buildings', description: 'Add new buildings, set room prefixes, edit floors, and delete buildings' },
    ],
  },
  {
    navKey: 'roomFinder',
    label: 'Room Finder',
    description: 'Search for available rooms across buildings',
    actions: [
      { permission: PERMISSIONS.ROOM_AVAILABILITY_VIEW, label: 'Search & filter rooms', description: 'Access Room Finder search list and filters' },
      { permission: PERMISSIONS.RESERVATION_SUBMIT, label: 'Submit room reservations', description: 'Book and submit room reservation requests' },
    ],
  },
  {
    navKey: 'academicCalendar',
    label: 'Academic Calendar',
    description: 'School year, holidays, and exam periods',
    actions: [
      { permission: PERMISSIONS.ACADEMIC_CALENDAR_VIEW, label: 'View academic calendar', description: 'Read official school year events and dates' },
      { permission: PERMISSIONS.CALENDAR_MANAGE, label: 'Manage academic calendar', description: 'Add/edit school year dates, holidays, no-class periods, and exam ranges' },
    ],
  },
  {
    navKey: 'courseScheduling',
    label: 'Course Scheduling',
    description: 'Plot and manage course schedules',
    actions: [
      { permission: PERMISSIONS.SCHEDULING_SUBMIT, label: 'Submit course schedules', description: 'Plot and submit class schedules for a college/department' },
      { permission: PERMISSIONS.ROOM_SCHEDULES_VIEW, label: 'View schedule history', description: 'Access historical course schedule records' },
      { permission: PERMISSIONS.SCHEDULING_MANAGE, label: 'Manage scheduling operations', description: 'Lock schedule batches, resolve room conflicts, and override schedules' },
    ],
  },
  {
    navKey: 'teachers',
    label: 'Teachers Directory',
    description: 'View teachers and manage course schedules & weekly timetables',
    actions: [],
  },
  {
    navKey: 'collegeInventory',
    label: 'College Inventory',
    description: 'Manage colleges and department catalogs',
    actions: [
      { permission: PERMISSIONS.SYSTEM_ADMIN, label: 'Manage college inventory', description: 'Add/edit colleges, departments, and course inventory' },
    ],
  },
  {
    navKey: 'approvalWorkflow',
    label: 'Approval Workflow',
    description: 'Configure approval chains',
    actions: [
      { permission: PERMISSIONS.APPROVAL_WORKFLOW_MANAGE, label: 'Manage approval workflows', description: 'Create, edit, and re-order dynamic multi-level approval steps' },
    ],
  },
  {
    navKey: 'approvals',
    label: 'Request Management',
    description: 'View, endorse, and approve room requests',
    actions: [
      { permission: PERMISSIONS.RESERVATION_SUBMIT, label: 'Submit room reservations', description: 'Create room reservation requests' },
      { permission: PERMISSIONS.APPROVAL_ENDORSE_ACTIVITY, label: 'Endorse activities', description: 'Endorse academic & non-academic requests for your college' },
      { permission: PERMISSIONS.APPROVAL_MANAGE_ROOM_ACTIVITY, label: 'Manage room activity approvals', description: 'Review and approve room usage requests (GSD)' },
      { permission: PERMISSIONS.APPROVAL_MANAGE_STUDENT_ACTIVITY, label: 'Manage student activity approvals', description: 'Review and approve student organization activities (Student Life)' },
    ],
  },
  {
    navKey: 'reports',
    label: 'Reports & Analytics',
    description: 'System reports and utilization metrics',
    actions: [
      { permission: PERMISSIONS.REPORTS_VIEW, label: 'View reports & analytics', description: 'Access utilization metrics and analytics reports' },
    ],
  },
  {
    navKey: 'maintenanceDashboard',
    label: 'Maintenance Dashboard',
    description: 'Manage room maintenance',
    actions: [
      { permission: PERMISSIONS.ROOMS_MAINTENANCE_MANAGE, label: 'Manage room maintenance', description: 'Flag rooms under maintenance, set repair dates and notes' },
    ],
  },
];

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
      { type: 'nav', navKey: 'teachers', label: 'Teachers Directory', description: 'View teachers directory and schedules' },
      { type: 'nav', navKey: 'collegeInventory', label: 'College Inventory', description: 'Manage colleges and departments', requiresPermission: PERMISSIONS.SYSTEM_ADMIN },
      { type: 'nav', navKey: 'courseScheduling', label: 'Course Scheduling', description: 'Plot and manage course schedules', requiresPermission: PERMISSIONS.SCHEDULING_SUBMIT },
      { type: 'nav', navKey: 'approvalWorkflow', label: 'Approval Workflow', description: 'Configure approval workflows', requiresPermission: PERMISSIONS.APPROVAL_WORKFLOW_MANAGE },
      { type: 'nav', navKey: 'roomFinder', label: 'Room Finder', description: 'Search for available rooms', requiresPermission: PERMISSIONS.ROOM_AVAILABILITY_VIEW },
      { type: 'nav', navKey: 'academicCalendar', label: 'Academic Calendar', description: 'School year and calendar settings', requiresPermission: PERMISSIONS.ACADEMIC_CALENDAR_VIEW },
      { type: 'nav', navKey: 'approvals', label: 'Request Management', description: 'View and manage requests' },
      { type: 'nav', navKey: 'maintenanceDashboard', label: 'Maintenance Dashboard', description: 'Manage room maintenance', requiresPermission: PERMISSIONS.ROOMS_MAINTENANCE_MANAGE },
      { type: 'nav', navKey: 'systemSettings', label: 'System Settings', description: 'System configuration settings' },
    ],
  },
  {
    id: 'scheduling',
    label: 'Scheduling & Calendar',
    description: 'Course plotting, schedules, and academic calendar',
    items: [
      { type: 'permission', permission: PERMISSIONS.ROOM_AVAILABILITY_VIEW, label: 'View room availability', description: 'See room availability and schedules', requiredNavKey: 'buildings', requiredNavLabel: 'Buildings or Room Finder' },
      { type: 'permission', permission: PERMISSIONS.ROOM_SCHEDULES_VIEW, label: 'View schedule history', description: 'Access schedule history records', requiredNavKey: 'courseScheduling', requiredNavLabel: 'Course Scheduling' },
      { type: 'permission', permission: PERMISSIONS.ACADEMIC_CALENDAR_VIEW, label: 'View academic calendar', description: 'Read academic calendar data', requiredNavKey: 'academicCalendar', requiredNavLabel: 'Academic Calendar' },
      { type: 'permission', permission: PERMISSIONS.SCHEDULING_SUBMIT, label: 'Submit course schedules', description: 'Plot and submit course schedules', requiredNavKey: 'courseScheduling', requiredNavLabel: 'Course Scheduling' },
      { type: 'permission', permission: PERMISSIONS.SCHEDULING_MANAGE, label: 'Manage scheduling operations', description: 'Advanced scheduling management', requiredNavKey: 'courseScheduling', requiredNavLabel: 'Course Scheduling' },
      { type: 'permission', permission: PERMISSIONS.CALENDAR_MANAGE, label: 'Manage academic calendar', description: 'Edit holidays, no-class periods, and exam dates', requiredNavKey: 'academicCalendar', requiredNavLabel: 'Academic Calendar' },
    ],
  },
  {
    id: 'reservations',
    label: 'Reservations',
    description: 'Room booking and reservation requests',
    items: [
      { type: 'permission', permission: PERMISSIONS.RESERVATION_SUBMIT, label: 'Submit room reservations', description: 'Create room reservation requests', requiredNavKey: 'approvals', requiredNavLabel: 'Request Management' },
    ],
  },
  {
    id: 'approvals',
    label: 'Approvals & Requests',
    description: 'Endorse, review, and configure approval flows',
    items: [
      { type: 'permission', permission: PERMISSIONS.APPROVAL_ENDORSE_ACTIVITY, label: 'Endorse activities', description: 'Endorse academic and non-academic requests', requiredNavKey: 'approvals', requiredNavLabel: 'Request Management' },
      { type: 'permission', permission: PERMISSIONS.APPROVAL_MANAGE_ROOM_ACTIVITY, label: 'Manage room activity approvals', description: 'Approve GSD room activity requests', requiredNavKey: 'approvals', requiredNavLabel: 'Request Management' },
      { type: 'permission', permission: PERMISSIONS.APPROVAL_MANAGE_STUDENT_ACTIVITY, label: 'Manage student activity approvals', description: 'Approve student life activity requests', requiredNavKey: 'approvals', requiredNavLabel: 'Request Management' },
      { type: 'permission', permission: PERMISSIONS.APPROVAL_WORKFLOW_MANAGE, label: 'Manage approval workflows', description: 'Configure multi-level approval workflows', requiredNavKey: 'approvalWorkflow', requiredNavLabel: 'Approval Workflow' },
    ],
  },
  {
    id: 'facilities',
    label: 'Facilities & Rooms',
    description: 'Building, room, and maintenance access',
    items: [
      { type: 'permission', permission: PERMISSIONS.ROOMS_MANAGE_ASSIGNED, label: 'Manage assigned rooms', description: 'Edit rooms assigned to this user', requiredNavKey: 'buildings', requiredNavLabel: 'Buildings' },
      { type: 'permission', permission: PERMISSIONS.ROOMS_MAINTENANCE_MANAGE, label: 'Manage room maintenance', description: 'Update maintenance status on rooms', requiredNavKey: 'maintenanceDashboard', requiredNavLabel: 'Maintenance Dashboard' },
      { type: 'permission', permission: PERMISSIONS.BUILDINGS_MANAGE, label: 'Manage buildings', description: 'Add and edit buildings, floors, and rooms', requiredNavKey: 'buildings', requiredNavLabel: 'Buildings' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    description: 'System configuration and user management',
    items: [
      { type: 'permission', permission: PERMISSIONS.SYSTEM_ADMIN, label: 'System administration', description: 'Manage users, roles, and system settings', requiredNavKey: 'systemAdmin', requiredNavLabel: 'User Management' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Analytics and reporting',
    items: [
      { type: 'permission', permission: PERMISSIONS.REPORTS_VIEW, label: 'View reports & analytics', description: 'Access reports dashboard', requiredNavKey: 'reports', requiredNavLabel: 'Reports & Analytics' },
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
  } else {
    // When disabling a navigation item, prune any permissions that require this nav item
    ACCESS_CATALOG.forEach((cat) => {
      cat.items.forEach((item) => {
        if (item.type === 'permission' && item.requiredNavKey === navKey) {
          nextPerms = togglePermission(nextPerms, item.permission, false);
        }
      });
    });
  }
  return { navKeys: nextNav, permissions: nextPerms };
}
