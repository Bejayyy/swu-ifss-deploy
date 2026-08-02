import { getRoleLabel } from '../constants/rolePermissions';
import { ROLES, USER_STATUS } from '../firebase/constants';
import { roleLabelFromValue, subscribeStaffUsers } from './systemUserService';
import { subscribeRegistrars } from './registrarService';

function mapUserToRoleEntry(user) {
  const roleValue = user.roleValue || user.role;
  if (!roleValue || roleValue === ROLES.DEVELOPER) return null;

  const isActive = user.status === 'Active'
    || user.status === USER_STATUS.ACTIVE
    || user.status === 'active';

  if (!isActive) return null;

  return {
    value: roleValue,
    label: user.role || roleLabelFromValue(roleValue) || getRoleLabel(roleValue) || roleValue,
  };
}

/** Unique roles from users provisioned in System Administration (and active registrars). */
export function distinctRolesFromUsers(users = []) {
  const byRole = new Map();

  users.forEach((user) => {
    const entry = mapUserToRoleEntry(user);
    if (!entry) return;

    const existing = byRole.get(entry.value);
    if (existing) {
      existing.userCount += 1;
      return;
    }

    byRole.set(entry.value, { ...entry, userCount: 1 });
  });

  return [...byRole.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function subscribeAssignableRoles(onData, onError) {
  let staffUsers = [];
  let registrarUsers = [];

  const publish = () => {
    const registrarsAsRows = registrarUsers.map((user) => ({
      roleValue: ROLES.REGISTRAR,
      role: getRoleLabel(ROLES.REGISTRAR),
      status: user.status === USER_STATUS.ACTIVE ? 'Active' : 'Inactive',
    }));
    onData(distinctRolesFromUsers([...staffUsers, ...registrarsAsRows]));
  };

  const unsubStaff = subscribeStaffUsers(
    (list) => {
      staffUsers = list;
      publish();
    },
    onError,
  );

  const unsubRegistrars = subscribeRegistrars(
    (list) => {
      registrarUsers = list;
      publish();
    },
    onError,
  );

  return () => {
    unsubStaff();
    unsubRegistrars();
  };
}

export function getRoleLabelById(roleId, fallbackLabel) {
  if (roleId === 'room-manager-dean') return 'Room Manager Dean';
  if (fallbackLabel) return fallbackLabel;
  return roleLabelFromValue(roleId) || getRoleLabel(roleId) || roleId;
}

export function formatRoleOptionLabel(role) {
  if (!role?.userCount) return role.label;
  return `${role.label} (${role.userCount} user${role.userCount === 1 ? '' : 's'})`;
}
