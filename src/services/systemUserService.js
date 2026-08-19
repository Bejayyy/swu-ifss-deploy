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
  { value: 'registrar', label: 'Registrar' },
  { value: 'dean', label: 'Dean' },
  { value: 'organization_head', label: 'Organization Head' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'gsd', label: 'GSD' },
  { value: 'student_life', label: 'Student Life' },
  { value: 'property_office', label: 'Property Office' },
  { value: 'vp_academics', label: 'VP Academics' },
  { value: 'chancellor', label: 'Chancellor' },
];

export function roleLabelFromValue(role, roleDefinitions = {}) {
  const def = roleDefinitions[role];
  if (def?.label) return def.label;
  const hit = STAFF_ROLE_OPTIONS.find((r) => r.value === role);
  if (hit?.label) return hit.label;
  if (role === 'registrar') return 'Registrar';
  if (role === 'developer') return 'Developer';
  return role ? (role.charAt(0).toUpperCase() + role.slice(1)).replace(/_/g, ' ') : 'User';
}

function mapStaffUserDoc(u, roleDefinitions = {}) {
  const resolvedUid = String(u.uid || u.id || u.email || '').trim();
  return {
    id: resolvedUid,
    uid: resolvedUid,
    name: u.displayName || u.name || u.email?.split('@')[0] || 'User',
    email: u.email || '',
    role: roleLabelFromValue(u.role, roleDefinitions),
    roleValue: u.role || 'user',
    department: u.department || u.college || '',
    college: u.college || '',
    status: u.status === USER_STATUS.ACTIVE ? 'Active' : 'Inactive',
    initials: u.initials || getInitials(u.displayName || u.name, u.email),
    permissions: u.permissions || [],
    navKeys: u.navKeys || [],
    useCustomAccess: Boolean(u.permissions?.length || u.navKeys?.length),
  };
}

export function subscribeStaffUsers(onData, onError, roleValues = null, roleDefinitions = {}) {
  const q = roleValues?.length
    ? query(collection(db, COLLECTIONS.USERS), where('role', 'in', roleValues.slice(0, 30)))
    : collection(db, COLLECTIONS.USERS);

  return onSnapshot(
    q,
    (snap) => {
      const users = snap.docs
        .map((d) => ({ id: d.id, uid: d.data().uid || d.id, ...d.data() }))
        .filter((u) => u.status !== 'migrated' && u.role !== ROLES.DEVELOPER)
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
  const userEmail = (userData.email || '').trim().toLowerCase();

  // ── 1. Delete all room reservations created by this user ──
  try {
    const { getDocs: fetchDocs, query: buildQuery, where: whereClause, writeBatch: createBatch, collection: col, collectionGroup: colGroup, updateDoc: patchDoc } = await import('firebase/firestore');
    
    // Delete reservations where createdByUid matches
    const reservationsRef = col(db, COLLECTIONS.ROOM_RESERVATIONS);
    const reservationsQuery = buildQuery(reservationsRef, whereClause('createdByUid', '==', uid));
    const reservationsSnap = await fetchDocs(reservationsQuery);
    
    if (!reservationsSnap.empty) {
      const batch = createBatch(db);
      reservationsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`Deleted ${reservationsSnap.size} reservations for user ${uid}`);
    }

    // Also check by email in case createdByUid wasn't always set
    if (userEmail) {
      const emailReservationsQuery = buildQuery(reservationsRef, whereClause('requestorEmail', '==', userEmail));
      const emailReservationsSnap = await fetchDocs(emailReservationsQuery);
      
      if (!emailReservationsSnap.empty) {
        const batch = createBatch(db);
        emailReservationsSnap.docs.forEach((d) => {
          // Only delete if not already deleted above
          if (!reservationsSnap.docs.some((prev) => prev.id === d.id)) {
            batch.delete(d.ref);
          }
        });
        await batch.commit();
      }
    }

    // ── 2. Delete maintenance reports submitted by this user ──
    const maintenanceReportsRef = col(db, COLLECTIONS.MAINTENANCE_REPORTS);
    const maintReportsQuery = buildQuery(maintenanceReportsRef, whereClause('scheduledByUid', '==', uid));
    const maintReportsSnap = await fetchDocs(maintReportsQuery);

    if (!maintReportsSnap.empty) {
      const batch = createBatch(db);
      maintReportsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`Deleted ${maintReportsSnap.size} maintenance reports for user ${uid}`);
    }

    // ── 3. Delete maintenance schedules created by this user ──
    const maintenanceSchedulesRef = col(db, COLLECTIONS.MAINTENANCE_SCHEDULES);
    const maintSchedulesQuery = buildQuery(maintenanceSchedulesRef, whereClause('scheduledByUid', '==', uid));
    const maintSchedulesSnap = await fetchDocs(maintSchedulesQuery);

    if (!maintSchedulesSnap.empty) {
      const batch = createBatch(db);
      maintSchedulesSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`Deleted ${maintSchedulesSnap.size} maintenance schedules for user ${uid}`);
    }

    // ── 4. Delete notifications for this user ──
    const notificationsRef = col(db, 'notifications');
    const notificationsQuery = buildQuery(notificationsRef, whereClause('userId', '==', uid));
    const notificationsSnap = await fetchDocs(notificationsQuery);

    if (!notificationsSnap.empty) {
      const batch = createBatch(db);
      notificationsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`Deleted ${notificationsSnap.size} notifications for user ${uid}`);
    }

    // ── 5. Clear managedBy references in rooms and floors ──
    // Clear rooms that reference this user as manager
    const roomsGroup = colGroup(db, COLLECTIONS.ROOMS);
    const managedRoomsQuery = buildQuery(roomsGroup, whereClause('managedBy', '==', uid));
    const managedRoomsSnap = await fetchDocs(managedRoomsQuery);

    if (!managedRoomsSnap.empty) {
      const batch = createBatch(db);
      managedRoomsSnap.docs.forEach((d) => {
        batch.update(d.ref, { managedBy: null, managedByName: null });
      });
      await batch.commit();
      console.log(`Cleared managedBy on ${managedRoomsSnap.size} rooms for user ${uid}`);
    }

    // Clear floors that reference this user as manager
    const floorsGroup = colGroup(db, COLLECTIONS.FLOORS);
    const managedFloorsQuery = buildQuery(floorsGroup, whereClause('managedBy', '==', uid));
    const managedFloorsSnap = await fetchDocs(managedFloorsQuery);

    if (!managedFloorsSnap.empty) {
      const batch = createBatch(db);
      managedFloorsSnap.docs.forEach((d) => {
        batch.update(d.ref, { managedBy: null, managedByName: null });
      });
      await batch.commit();
      console.log(`Cleared managedBy on ${managedFloorsSnap.size} floors for user ${uid}`);
    }

    // ── 6. Delete schedule plot requests created by this user ──
    const plotRequestsRef = col(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS);

    // Try createdByUid field
    const plotByUidQuery = buildQuery(plotRequestsRef, whereClause('createdByUid', '==', uid));
    const plotByUidSnap = await fetchDocs(plotByUidQuery);

    if (!plotByUidSnap.empty) {
      for (const plotDoc of plotByUidSnap.docs) {
        // Delete schedule entries sub-collection first
        const entriesRef = col(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS, plotDoc.id, COLLECTIONS.SCHEDULE_ENTRIES);
        const entriesSnap = await fetchDocs(entriesRef);
        if (!entriesSnap.empty) {
          const entriesBatch = createBatch(db);
          entriesSnap.docs.forEach((e) => entriesBatch.delete(e.ref));
          await entriesBatch.commit();
        }
      }
      const batch = createBatch(db);
      plotByUidSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`Deleted ${plotByUidSnap.size} schedule plot requests for user ${uid}`);
    }

  } catch (cleanupError) {
    console.error('Error during user data cleanup:', cleanupError);
    // Continue with user deletion even if cleanup partially fails
  }

  // ── 7. Delete the user document and auth account ──
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../firebase/firebase');
    const deleteAuthUser = httpsCallable(functions, 'deleteStaffAuthUser');
    await deleteAuthUser({ uid });
    console.log('Successfully deleted staff user and all related data:', uid);
  } catch (error) {
    // If cloud function fails (not deployed), fall back to deleting just the Firestore doc
    console.warn('Cloud function deleteStaffAuthUser not available, deleting Firestore doc only:', error.message);
    await deleteDoc(userRef);
    console.log('Deleted user Firestore document (Auth account may remain):', uid);
  }
}

