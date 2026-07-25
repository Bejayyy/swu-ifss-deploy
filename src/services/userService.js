import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS, MAIN_APP_ROLES, ROLES, USER_STATUS } from '../firebase/constants';
import { getInitials, normalizeEmail } from '../firebase/authHelpers';

export async function fetchUserProfile(uid) {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

export async function fetchUserProfileByEmail(email) {
  const normalized = normalizeEmail(email);
  const q = query(
    collection(db, COLLECTIONS.USERS),
    where('email', '==', normalized),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const hit = snap.docs[0];
  return { uid: hit.id, ...hit.data() };
}

export async function migrateInvitedUserToUid(authUid, email) {
  const invited = await fetchUserProfileByEmail(email);
  if (!invited) return null;
  if (invited.uid === authUid) return invited;

  await setDoc(
    doc(db, COLLECTIONS.USERS, authUid),
    {
      ...invited,
      email: normalizeEmail(email),
      uid: authUid,
      migratedFrom: invited.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    doc(db, COLLECTIONS.USERS, invited.uid),
    {
      migratedToUid: authUid,
      status: 'migrated',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return fetchUserProfile(authUid);
}

export async function upsertUserProfile(uid, data) {
  const ref = doc(db, COLLECTIONS.USERS, uid);
  await setDoc(
    ref,
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function touchLastLogin(uid) {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
    lastLoginAt: serverTimestamp(),
  });
}

export function buildUserProfilePayload({
  email,
  displayName,
  role,
  status = USER_STATUS.ACTIVE,
  permissions = [],
  department = '',
  phone = '',
  createdBy = null,
  mustSetPassword = false,
  passwordEnabled = false,
  authProviders = [],
}) {
  const normalized = normalizeEmail(email);
  return {
    email: normalized,
    displayName: displayName.trim(),
    role,
    status,
    permissions,
    department: department.trim(),
    phone: phone.trim(),
    initials: getInitials(displayName, normalized),
    createdBy,
    mustSetPassword,
    passwordEnabled,
    authProviders,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: null,
  };
}

export function isActiveProfile(profile) {
  return profile?.status === USER_STATUS.ACTIVE;
}

export function canAccessRegistrarApp(profile) {
  return profile?.role === ROLES.REGISTRAR && isActiveProfile(profile);
}

export async function canAccessMainApp(profile) {
  if (!isActiveProfile(profile)) return false;
  if (MAIN_APP_ROLES.includes(profile?.role)) return true;
  if (!profile?.role || profile.role === ROLES.DEVELOPER) return false;
  const snap = await getDoc(doc(db, COLLECTIONS.ROLE_DEFINITIONS, profile.role));
  return snap.exists();
}

export function canAccessDeveloperApp(profile) {
  return profile?.role === ROLES.DEVELOPER && isActiveProfile(profile);
}

export function hasPermission(profile, permissionKey) {
  if (!profile?.permissions) return false;
  return profile.permissions.includes(permissionKey);
}
