import {
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  doc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS, ROLES, USER_STATUS } from '../firebase/constants';
import { collegePriorityFromValue, isCasDepartment } from '../constants/plotScheduling';
import { getInitials, normalizeEmail, validateInstitutionalEmail } from '../firebase/authHelpers';
import { getRoleDefinition } from '../constants/rolePermissions';

export const STAFF_ROLE_OPTIONS = [
  { value: 'dean', label: 'Dean' },
  { value: 'organization_head', label: 'Organization Head' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'gsd', label: 'GSD' },
  { value: 'student_life', label: 'Student Life' },
];

export function roleLabelFromValue(role, roleDefinitions = {}) {
  const def = roleDefinitions[role];
  if (def?.label) return def.label;
  const hit = STAFF_ROLE_OPTIONS.find((r) => r.value === role);
  return hit?.label || role;
}

function mapStaffUserDoc(u, roleDefinitions = {}) {
  return {
    id: u.uid,
    uid: u.uid,
    name: u.displayName,
    email: u.email,
    role: roleLabelFromValue(u.role, roleDefinitions),
    roleValue: u.role,
    department: u.department || '',
    college: u.college || '', // Added college field
    status: u.status === USER_STATUS.ACTIVE ? 'Active' : 'Inactive',
    initials: u.initials || getInitials(u.displayName, u.email),
    permissions: u.permissions || [],
    navKeys: u.navKeys || [],
    useCustomAccess: Boolean(u.permissions?.length || u.navKeys?.length),
  };
}

export function subscribeStaffUsers(onData, onError, roleValues = null, roleDefinitions = {}) {
  const roles = roleValues?.length
    ? roleValues
    : STAFF_ROLE_OPTIONS.map((r) => r.value);

  const q = query(
    collection(db, COLLECTIONS.USERS),
    where('role', 'in', roles.slice(0, 30)),
  );

  return onSnapshot(
    q,
    (snap) => {
      const users = snap.docs
        .map((d) => ({ uid: d.id, ...d.data() }))
        .filter((u) => u.status !== 'migrated')
        .map((u) => mapStaffUserDoc(u, roleDefinitions));
      onData(users);
    },
    onError,
  );
}

export function getActiveDeans(staffUsers = []) {
  return staffUsers.filter((u) => u.roleValue === ROLES.DEAN && u.status === 'Active');
}

export function normalizeDepartmentKey(department) {
  return (department || '').trim().toLowerCase();
}

/** Unique dean departments from System Administration, with linked dean accounts */
export function getDeanDepartmentOptions(staffUsers = []) {
  const deans = getActiveDeans(staffUsers);
  const byDept = new Map();

  deans.forEach((dean) => {
    const department = (dean.department || '').trim();
    if (!department) return;
    const key = normalizeDepartmentKey(department);
    if (!byDept.has(key)) {
      byDept.set(key, {
        key,
        department,
        label: department,
        tier: isCasDepartment(department) ? 'cas' : 'college',
        priority: collegePriorityFromValue(department),
        deans: [],
      });
    }
    byDept.get(key).deans.push(dean);
  });

  return [...byDept.values()].sort((a, b) => {
    const priorityDiff = a.priority - b.priority;
    if (priorityDiff !== 0) return priorityDiff;
    return a.department.localeCompare(b.department);
  });
}

export function findDeansInDepartment(staffUsers, department) {
  const key = normalizeDepartmentKey(department);
  return getActiveDeans(staffUsers).filter(
    (u) => normalizeDepartmentKey(u.department) === key,
  );
}

export function formatDeanOptionLabel(dean) {
  const parts = [dean.name];
  if (dean.department) parts.push(dean.department);
  if (dean.email) parts.push(dean.email);
  return parts.join(' · ');
}

export async function createStaffUserByEmailInvite({
  name,
  email,
  department,
  college,
  roleValue,
  permissions = [],
  navKeys = [],
}, createdBy) {
  const validation = validateInstitutionalEmail(email);
  if (!validation.valid) throw new Error(validation.message);

  const normalized = normalizeEmail(email);
  
  // Generate a temporary password
  const tempPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);
  
  // Import required functions
  const { createAuthUserWithEmail } = await import('../firebase/secondaryAuth');
  const { httpsCallable } = await import('firebase/functions');
  const { functions } = await import('../firebase/firebase');
  
  // Create Firebase Auth user with temporary password
  let authUser;
  try {
    authUser = await createAuthUserWithEmail(normalized, tempPassword);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      throw new Error('This email is already registered in the system.');
    }
    throw error;
  }
  
  const uid = authUser.uid;
  
  // GSD and Student Life don't have departments or colleges
  const shouldIncludeDepartment = roleValue !== 'gsd' && roleValue !== 'student_life';
  const shouldIncludeCollege = roleValue === 'teacher' || roleValue === 'organization_head' || roleValue === 'dean';
  
  const payload = {
    email: normalized,
    displayName: name.trim(),
    role: roleValue,
    status: USER_STATUS.ACTIVE,
    department: shouldIncludeDepartment ? (department?.trim() || '') : '',
    college: shouldIncludeCollege ? (college?.trim() || '') : '',
    initials: getInitials(name, normalized),
    authProviders: ['password'],
    mustSetPassword: true,
    passwordEnabled: true,
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: null,
  };

  if (permissions?.length) payload.permissions = permissions;
  if (navKeys?.length) payload.navKeys = navKeys;

  await setDoc(doc(db, COLLECTIONS.USERS, uid), payload, { merge: true });
  
  // Send welcome email via Cloud Function
  try {
    const sendWelcomeEmail = httpsCallable(functions, 'sendStaffWelcomeEmail');
    await sendWelcomeEmail({
      email: normalized,
      displayName: name.trim(),
      role: roleValue,
      password: tempPassword,
    });
    console.log('Welcome email sent to:', normalized);
  } catch (emailError) {
    console.error('Failed to send welcome email:', emailError);
    // Don't throw error - account was created successfully, email is optional
  }
  
  return uid;
}

export async function updateStaffUser({
  uid,
  name,
  email,
  department,
  college,
  roleValue,
  status,
  permissions = [],
  navKeys = [],
}) {
  if (!uid) throw new Error('User id is required.');

  // GSD and Student Life don't have departments or colleges
  const shouldIncludeDepartment = roleValue !== 'gsd' && roleValue !== 'student_life';
  const shouldIncludeCollege = roleValue === 'teacher' || roleValue === 'organization_head' || roleValue === 'dean';

  const patch = {
    displayName: name?.trim() || '',
    email: email?.trim() ? normalizeEmail(email) : undefined, // Update email if provided
    department: shouldIncludeDepartment ? (department?.trim() || '') : '',
    college: shouldIncludeCollege ? (college?.trim() || '') : '',
    role: roleValue,
    status: status || USER_STATUS.ACTIVE,
    initials: getInitials(name, email || ''),
    permissions: permissions || [],
    navKeys: navKeys || [],
    updatedAt: serverTimestamp(),
  };

  // Remove undefined values
  Object.keys(patch).forEach(key => patch[key] === undefined && delete patch[key]);

  await updateDoc(doc(db, COLLECTIONS.USERS, uid), patch);
}

export function getDefaultAccessForRole(roleValue, roleDefinitions = {}) {
  const def = getRoleDefinition(roleValue, roleDefinitions);
  return {
    permissions: def.permissions || [],
    navKeys: def.navKeys || [],
  };
}

export async function deleteStaffUser(uid) {
  if (!uid) throw new Error('User id is required.');
  
  const userRef = doc(db, COLLECTIONS.USERS, uid);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    throw new Error('User not found.');
  }
  
  const userData = userSnap.data();
  
  // Call Cloud Function to delete Auth user and Firestore document
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../firebase/firebase');
    const deleteAuthUser = httpsCallable(functions, 'deleteStaffAuthUser');
    await deleteAuthUser({ uid });
    console.log('Successfully deleted staff user:', uid);
  } catch (error) {
    console.error('Error deleting staff user via Cloud Function:', error);
    throw new Error('Failed to delete user account: ' + error.message);
  }
}
