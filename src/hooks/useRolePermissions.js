import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRoleConfig } from '../context/RoleConfigContext';
import {
  canAccessRouteForProfile,
  canApproveAnyRequest,
  canCreateRequestType,
  canEditRoom,
  canEndorseActivity,
  canManageAllRooms,
  canManageAssignedRooms,
  canManageBuildings,
  canManageCalendar,
  canManageApprovalWorkflow,
  canManageRoomActivityApproval,
  canManageRoomMaintenance,
  canManageStudentActivityApproval,
  canSubmitCourseSchedule,
  canSubmitReservation,
  canAssignTeacherSubjects,
  canViewPersonalTeacherSchedule,
  filterRequestsForRole,
  filterMyRequests,
  getApprovalsNavLabel,
  getEffectiveNavItems,
  getEffectivePermissions,
  getRoleDefinition,
  getRoleLabel,
  hasEffectivePermission,
} from '../constants/rolePermissions';

export function useRolePermissions() {
  const { profile } = useAuth();
  const { roleDefinitions } = useRoleConfig();
  const role = profile?.role;

  return useMemo(
    () => ({
      role,
      roleLabel: getRoleLabel(role),
      permissions: getEffectivePermissions(profile, roleDefinitions),
      navItems: getEffectiveNavItems(profile, roleDefinitions),
      approvalsNavLabel: getApprovalsNavLabel(role, profile, roleDefinitions),
      hasPermission: (permission) => hasEffectivePermission(profile, permission, roleDefinitions),
      canAccessRoute: (pathname) => canAccessRouteForProfile(profile, pathname, roleDefinitions),
      canSubmitReservation: () => canSubmitReservation(role, roleDefinitions, profile),
      canSubmitCourseSchedule: () => canSubmitCourseSchedule(role, roleDefinitions, profile),
      canAssignTeacherSubjects: () => canAssignTeacherSubjects(role, roleDefinitions, profile),
      canViewPersonalTeacherSchedule: () => canViewPersonalTeacherSchedule(role, roleDefinitions, profile),
      canEndorseActivity: () => canEndorseActivity(role, roleDefinitions, profile),
      canManageRoomActivityApproval: () => canManageRoomActivityApproval(role, roleDefinitions, profile),
      canManageStudentActivityApproval: () => canManageStudentActivityApproval(role, roleDefinitions, profile),
      canApproveAny: () => canApproveAnyRequest(role, roleDefinitions, profile),
      canManageRoomMaintenance: () => canManageRoomMaintenance(role, roleDefinitions, profile),
      canManageAssignedRooms: () => canManageAssignedRooms(role, roleDefinitions, profile),
      canManageBuildings: () => canManageBuildings(role, roleDefinitions, profile),
      canManageCalendar: () => canManageCalendar(role, roleDefinitions, profile),
      canManageApprovalWorkflow: () => canManageApprovalWorkflow(role, roleDefinitions, profile),
      canManageAllRooms: () => canManageAllRooms(role),
      canEditRoom: (room) => canEditRoom(profile, room, roleDefinitions),
      canCreateRequestType: (type) => canCreateRequestType(role, type, roleDefinitions, profile),
      filterRequests: (requests) => filterRequestsForRole(requests, role, profile, roleDefinitions),
      filterMyRequests: (requests) => filterMyRequests(requests, profile),
      getRoleDefinition: (roleKey) => getRoleDefinition(roleKey, roleDefinitions),
      isRegistrar: role === 'registrar',
      isDean: role === 'dean',
      isGsd: role === 'gsd',
    }),
    [profile, role, roleDefinitions],
  );
}
