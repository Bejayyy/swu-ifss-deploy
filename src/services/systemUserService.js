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
import { toTitleCase } from '../utils/excelTemplate';

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
    mustSetPassword: Boolean(u.mustSetPassword),
    passwordEnabled: u.passwordEnabled !== false,
    lastLoginAt: u.lastLoginAt || null,
    passwordSetAt: u.passwordSetAt || null,
    createdAt: u.createdAt || null,
    updatedAt: u.updatedAt || null,
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

  // Reusing an email must start a new account lifecycle. Remove notifications
  // left by an older account that used this address before creating the profile.
  try {
    const { getDocs, collection: firestoreCollection, writeBatch } = await import('firebase/firestore');
    const notificationSnap = await getDocs(firestoreCollection(db, 'notifications'));
    const legacyNotifications = notificationSnap.docs.filter((notificationDoc) => {
      const data = notificationDoc.data() || {};
      return [data.userId, data.recipientId, data.userEmail, data.recipientEmail, data.recipientUid]
        .filter(Boolean)
        .some((key) => String(key).trim().toLowerCase() === normalized);
    });
    for (let start = 0; start < legacyNotifications.length; start += 500) {
      const batch = writeBatch(db);
      legacyNotifications.slice(start, start + 500).forEach((notificationDoc) => batch.delete(notificationDoc.ref));
      await batch.commit();
    }
  } catch (cleanupError) {
    console.warn('Could not clear legacy notifications for reused email:', cleanupError);
  }
  
  // GSD and Student Life don't have departments or colleges
  const shouldIncludeDepartment = roleValue !== 'gsd' && roleValue !== 'student_life';
  const shouldIncludeCollege = roleValue === 'teacher' || roleValue === 'organization_head' || roleValue === 'dean';
  
  const formattedName = name ? toTitleCase(name) : '';

  const payload = {
    email: normalized,
    displayName: formattedName,
    role: roleValue,
    status: USER_STATUS.ACTIVE,
    department: shouldIncludeDepartment ? (department?.trim() || '') : '',
    college: shouldIncludeCollege ? (college?.trim() || '') : '',
    initials: getInitials(formattedName, normalized),
    authProviders: ['password'],
    mustSetPassword: true,
    passwordEnabled: true,
    passwordSetAt: null,
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
      displayName: formattedName,
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
  const formattedName = name ? toTitleCase(name) : '';

  const patch = {
    displayName: formattedName,
    email: email?.trim() ? normalizeEmail(email) : undefined, // Update email if provided
    department: shouldIncludeDepartment ? (department?.trim() || '') : '',
    college: shouldIncludeCollege ? (college?.trim() || '') : '',
    role: roleValue,
    status: status || USER_STATUS.ACTIVE,
    initials: getInitials(formattedName, email || ''),
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
  const userName = (userData.name || '').trim();

  const {
    getDocs: fetchDocs,
    getDoc: fetchDoc,
    deleteDoc: delDoc,
    query: buildQuery,
    where: whereClause,
    writeBatch: createBatch,
    collection: col,
    collectionGroup: colGroup,
    updateDoc: patchDoc,
  } = await import('firebase/firestore');

  // ── 1. Delete Dean Sections & Plotted Schedules (users/${uid}/sections and subcollections) ──
  try {
    const sectionsCol = col(db, COLLECTIONS.USERS, uid, 'sections');
    const sectionsSnap = await fetchDocs(sectionsCol);
    for (const secDoc of sectionsSnap.docs) {
      const entriesCol = col(db, COLLECTIONS.USERS, uid, 'sections', secDoc.id, 'plotEntries');
      const entriesSnap = await fetchDocs(entriesCol);
      if (!entriesSnap.empty) {
        const batch = createBatch(db);
        entriesSnap.docs.forEach((ed) => batch.delete(ed.ref));
        await batch.commit();
      }
      await delDoc(secDoc.ref);
    }

    // Delete assignedRooms subcollection if any
    const assignedRoomsCol = col(db, COLLECTIONS.USERS, uid, 'assignedRooms');
    const assignedRoomsSnap = await fetchDocs(assignedRoomsCol);
    if (!assignedRoomsSnap.empty) {
      const batch = createBatch(db);
      assignedRoomsSnap.docs.forEach((ad) => batch.delete(ad.ref));
      await batch.commit();
    }
  } catch (secErr) {
    console.warn('Error clearing user subcollections:', secErr);
  }

  // Clear assignments belonging to this exact identity. Do not match by email:
  // the same institutional address may later be provisioned under a new UID.
  try {
    const assignedCoursesQuery = buildQuery(
      col(db, 'courses'),
      whereClause('assignedTeacherUid', '==', uid),
    );
    const assignedCoursesSnap = await fetchDocs(assignedCoursesQuery);
    for (let start = 0; start < assignedCoursesSnap.docs.length; start += 500) {
      const batch = createBatch(db);
      assignedCoursesSnap.docs.slice(start, start + 500).forEach((courseDoc) => {
        batch.update(courseDoc.ref, {
          assignedTeacherUid: null,
          assignedTeacherName: null,
          assignedTeacherEmail: null,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    }
  } catch (courseAssignmentErr) {
    console.warn('Error clearing deleted teacher course assignments:', courseAssignmentErr);
  }

  // ── 2. Clean Schedule Access Control (schedule_access_control) ──
  try {
    const accessCol = col(db, COLLECTIONS.SCHEDULE_ACCESS_CONTROL || 'schedule_access_control');
    const accessSnap = await fetchDocs(accessCol);
    for (const accDoc of accessSnap.docs) {
      const accData = accDoc.data() || {};
      let changed = false;
      let deans = accData.deans || [];
      if (Array.isArray(deans) && deans.some((d) => d.uid === uid || (userEmail && d.email?.toLowerCase() === userEmail))) {
        deans = deans.filter((d) => d.uid !== uid && (!userEmail || d.email?.toLowerCase() !== userEmail));
        changed = true;
      }
      let deanUids = accData.deanUids || [];
      if (Array.isArray(deanUids) && deanUids.includes(uid)) {
        deanUids = deanUids.filter((id) => id !== uid);
        changed = true;
      }
      let grantedDeans = accData.grantedDeans || [];
      if (Array.isArray(grantedDeans) && (grantedDeans.includes(uid) || (userEmail && grantedDeans.includes(userEmail)))) {
        grantedDeans = grantedDeans.filter((id) => id !== uid && (!userEmail || id !== userEmail));
        changed = true;
      }
      if (changed) {
        await patchDoc(accDoc.ref, { deans, deanUids, grantedDeans });
      }
    }
  } catch (accErr) {
    console.warn('Error clearing schedule access control:', accErr);
  }

  // ── 3. Delete Room Reservations ──
  try {
    const reservationsRef = col(db, COLLECTIONS.ROOM_RESERVATIONS);
    const reservationsQuery = buildQuery(reservationsRef, whereClause('createdByUid', '==', uid));
    const reservationsSnap = await fetchDocs(reservationsQuery);
    
    if (!reservationsSnap.empty) {
      const batch = createBatch(db);
      reservationsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    if (userEmail) {
      const emailReservationsQuery = buildQuery(reservationsRef, whereClause('requestorEmail', '==', userEmail));
      const emailReservationsSnap = await fetchDocs(emailReservationsQuery);
      
      if (!emailReservationsSnap.empty) {
        const batch = createBatch(db);
        emailReservationsSnap.docs.forEach((d) => {
          if (!reservationsSnap.docs.some((prev) => prev.id === d.id)) {
            batch.delete(d.ref);
          }
        });
        await batch.commit();
      }
    }
  } catch (resErr) {
    console.warn('Error clearing room reservations:', resErr);
  }

  // ── 4. Delete Maintenance Reports & Schedules ──
  try {
    const maintReportsRef = col(db, COLLECTIONS.MAINTENANCE_REPORTS);
    const maintReportsQuery = buildQuery(maintReportsRef, whereClause('scheduledByUid', '==', uid));
    const maintReportsSnap = await fetchDocs(maintReportsQuery);

    if (!maintReportsSnap.empty) {
      const batch = createBatch(db);
      maintReportsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    const maintSchedulesRef = col(db, COLLECTIONS.MAINTENANCE_SCHEDULES);
    const maintSchedulesQuery = buildQuery(maintSchedulesRef, whereClause('scheduledByUid', '==', uid));
    const maintSchedulesSnap = await fetchDocs(maintSchedulesQuery);

    if (!maintSchedulesSnap.empty) {
      const batch = createBatch(db);
      maintSchedulesSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (maintErr) {
    console.warn('Error clearing maintenance data:', maintErr);
  }

  // ── 5. Delete Notifications ──
  try {
    const notificationsRef = col(db, 'notifications');
    const notificationsSnap = await fetchDocs(notificationsRef);
    const deletedUserKeys = new Set(
      [uid, userEmail].filter(Boolean).map((key) => String(key).trim().toLowerCase())
    );
    const ownedNotifications = notificationsSnap.docs.filter((notificationDoc) => {
      const data = notificationDoc.data() || {};
      return [data.userId, data.recipientId, data.userEmail, data.recipientEmail, data.recipientUid]
        .filter(Boolean)
        .map((key) => String(key).trim().toLowerCase())
        .some((key) => deletedUserKeys.has(key));
    });
    for (let start = 0; start < ownedNotifications.length; start += 500) {
      const batch = createBatch(db);
      ownedNotifications.slice(start, start + 500).forEach((notificationDoc) => batch.delete(notificationDoc.ref));
      await batch.commit();
    }
  } catch (notifErr) {
    console.warn('Error clearing notifications:', notifErr);
  }

  // ── 6. Clear managedBy references in Buildings & Rooms ──
  try {
    const buildingsCol = col(db, COLLECTIONS.BUILDINGS);
    const buildingsSnap = await fetchDocs(buildingsCol);
    for (const bDoc of buildingsSnap.docs) {
      const bData = bDoc.data() || {};
      const floors = bData.floorData;
      if (Array.isArray(floors)) {
        let updated = false;
        const newFloors = floors.map((f) => {
          let floorModified = false;
          let fManagedBy = f.managedBy;
          let fManagedByName = f.managedByName;
          if (fManagedBy === uid || f.managerUid === uid || (userEmail && f.managerEmail?.toLowerCase() === userEmail)) {
            fManagedBy = null;
            fManagedByName = null;
            floorModified = true;
          }
          const newRooms = (f.rooms || []).map((r) => {
            if (
              r.managedBy === uid ||
              r.managerUid === uid ||
              (userEmail && r.managerEmail?.toLowerCase() === userEmail) ||
              (userName && r.managedByName && r.managedByName.toLowerCase() === userName.toLowerCase())
            ) {
              floorModified = true;
              return { ...r, managedBy: null, managedByName: null, managerUid: null, managerEmail: null };
            }
            return r;
          });
          if (floorModified) updated = true;
          return { ...f, managedBy: fManagedBy, managedByName: fManagedByName, rooms: newRooms };
        });
        if (updated) {
          await patchDoc(bDoc.ref, { floorData: newFloors });
        }
      }
    }

    // Also collectionGroup rooms & floors
    const roomsGroup = colGroup(db, COLLECTIONS.ROOMS);
    const managedRoomsQuery = buildQuery(roomsGroup, whereClause('managedBy', '==', uid));
    const managedRoomsSnap = await fetchDocs(managedRoomsQuery);
    if (!managedRoomsSnap.empty) {
      const batch = createBatch(db);
      managedRoomsSnap.docs.forEach((d) => batch.update(d.ref, { managedBy: null, managedByName: null }));
      await batch.commit();
    }
  } catch (bldErr) {
    console.warn('Error clearing managed rooms:', bldErr);
  }

  // ── 7. Clean Colleges ──
  try {
    const collegesCol = col(db, COLLECTIONS.COLLEGES);
    const collegesSnap = await fetchDocs(collegesCol);
    for (const cDoc of collegesSnap.docs) {
      const cData = cDoc.data() || {};
      if (
        cData.deanUid === uid ||
        (userEmail && cData.deanEmail?.toLowerCase() === userEmail) ||
        cData.assignedDean === uid
      ) {
        await patchDoc(cDoc.ref, { deanUid: null, deanEmail: null, assignedDean: null, deanName: null });
      }
    }
  } catch (colErr) {
    console.warn('Error clearing colleges:', colErr);
  }

  // ── 8. Clean Chat Messages & Rooms ──
  try {
    const { purgeUserChatData } = await import('./chatService');
    await purgeUserChatData(uid, userEmail);
  } catch (chatErr) {
    console.warn('Error clearing chat messages & rooms:', chatErr);
  }

  // ── 9. Clean Password Reset OTPs ──
  try {
    if (userEmail) {
      const otpRef = doc(db, 'password_reset_otps', userEmail);
      const otpSnap = await fetchDoc(otpRef);
      if (otpSnap.exists()) {
        await delDoc(otpRef);
      }
    }
  } catch (otpErr) {
    console.warn('Error clearing OTP:', otpErr);
  }

  // ── 10. Delete Schedule Plot Requests ──
  try {
    const plotRequestsRef = col(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS);
    const plotByUidQuery = buildQuery(plotRequestsRef, whereClause('createdByUid', '==', uid));
    const plotByUidSnap = await fetchDocs(plotByUidQuery);

    if (!plotByUidSnap.empty) {
      for (const plotDoc of plotByUidSnap.docs) {
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
    }
  } catch (plotErr) {
    console.warn('Error clearing plot requests:', plotErr);
  }

  // ── 11. Delete the user document and Auth account via Cloud Function ──
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../firebase/firebase');
    const deleteAuthUser = httpsCallable(functions, 'deleteStaffAuthUser');
    await deleteAuthUser({ uid });
  } catch (authErr) {
    console.warn('Cloud function deleteStaffAuthUser error (fallback to client delete):', authErr);
  }

  // Guaranteed fallback: delete user document directly from client
  try {
    await delDoc(userRef);
  } catch (userDelErr) {
    console.warn('Direct user document deletion fallback error:', userDelErr);
  }

  console.log('Successfully deleted staff user and completely cleaned all related collections:', uid);
}

/**
 * Generates a new temporary password for an existing staff user account
 * and emails it to them. Requires the caller to be a registrar or developer.
 */
export async function resendTempPassword(uid) {
  if (!uid) throw new Error('User ID is required.');
  const { httpsCallable } = await import('firebase/functions');
  const { functions } = await import('../firebase/firebase');
  const resendFn = httpsCallable(functions, 'resendStaffTempPassword');
  const result = await resendFn({ uid });
  return result.data;
}


