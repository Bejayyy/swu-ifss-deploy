import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase/firebase';
import { COLLECTIONS, ROLES, USER_STATUS } from '../firebase/constants';
import { getInitials, normalizeEmail, validateInstitutionalEmail } from '../firebase/authHelpers';
import { createAuthUserWithEmail } from '../firebase/secondaryAuth';
import { buildUserProfilePayload, upsertUserProfile } from './userService';

const registrarsQuery = query(
  collection(db, COLLECTIONS.USERS),
  where('role', '==', ROLES.REGISTRAR),
);

export function subscribeRegistrars(onData, onError) {
  return onSnapshot(
    registrarsQuery,
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));
      onData(list);
    },
    onError,
  );
}

export async function listRegistrars() {
  const snapshot = await getDocs(registrarsQuery);
  return snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

async function writeRegistrarManagement(uid, payload, managedBy) {
  await setDoc(
    doc(db, COLLECTIONS.REGISTRAR_MANAGEMENT, uid),
    {
      uid,
      ...payload,
      managedBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function createRegistrarAccount(
  { email, password, displayName, department, phone, permissions, notes },
  createdByUid,
) {
  // Enforce single active registrar constraint
  const activeRegistrarsQuery = query(
    collection(db, COLLECTIONS.USERS),
    where('role', '==', ROLES.REGISTRAR),
    where('status', '==', USER_STATUS.ACTIVE),
  );
  const activeSnap = await getDocs(activeRegistrarsQuery);
  if (!activeSnap.empty) {
    throw new Error('Account creation failed: Only 1 active Registrar account is allowed in the system. An active Registrar account already exists.');
  }

  const validation = validateInstitutionalEmail(email);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const normalized = normalizeEmail(email);
  const tempPassword = password || (Math.random().toString(36).slice(-8) + 'Aa1!' + Math.random().toString(36).slice(-4));
  const authUser = await createAuthUserWithEmail(normalized, tempPassword);
  const uid = authUser.uid;

  const profile = buildUserProfilePayload({
    email: normalized,
    displayName,
    role: ROLES.REGISTRAR,
    status: USER_STATUS.ACTIVE,
    permissions: permissions || [],
    department: department || 'Registrar',
    phone,
    createdBy: createdByUid,
    mustSetPassword: true, // Force password change on first login
    passwordEnabled: true, // Account has a password
    authProviders: ['password'], // Initially only password auth
  });

  await upsertUserProfile(uid, profile);

  await writeRegistrarManagement(
    uid,
    {
      email: normalized,
      displayName: displayName.trim(),
      department: (department || 'Registrar').trim(),
      status: USER_STATUS.ACTIVE,
      permissions: permissions || [],
      notes: (notes || '').trim(),
      createdAt: serverTimestamp(),
    },
    createdByUid,
  );

  // Send welcome email via Cloud Function
  try {
    const sendWelcomeEmail = httpsCallable(functions, 'sendRegistrarWelcomeEmail');
    await sendWelcomeEmail({
      email: normalized,
      displayName: displayName.trim(),
      password: tempPassword, // Include temporary password in email
    });
    console.log('Welcome email sent to:', normalized);
  } catch (emailError) {
    console.error('Failed to send welcome email:', emailError);
    // Don't throw error - account was created successfully, email is optional
  }

  return uid;
}

export async function updateRegistrarAccount(
  uid,
  { displayName, department, phone, permissions, notes, status },
  managedByUid,
) {
  if (status === USER_STATUS.ACTIVE) {
    const activeRegistrarsQuery = query(
      collection(db, COLLECTIONS.USERS),
      where('role', '==', ROLES.REGISTRAR),
      where('status', '==', USER_STATUS.ACTIVE),
    );
    const activeSnap = await getDocs(activeRegistrarsQuery);
    const otherActive = activeSnap.docs.filter((d) => d.id !== uid);
    if (otherActive.length > 0) {
      throw new Error('Update failed: Only 1 active Registrar account is allowed in the system. An active Registrar account already exists.');
    }
  }

  const updates = { updatedAt: serverTimestamp() };
  if (displayName !== undefined) updates.displayName = displayName.trim();
  if (department !== undefined) updates.department = department.trim();
  if (phone !== undefined) updates.phone = phone.trim();
  if (permissions !== undefined) updates.permissions = permissions;
  if (status !== undefined) updates.status = status;

  if (displayName) {
    const userSnap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    const email = userSnap.data()?.email || '';
    updates.initials = getInitials(displayName, email);
  }

  await updateDoc(doc(db, COLLECTIONS.USERS, uid), updates);

  const mgmtPayload = { permissions: permissions || [] };
  if (displayName !== undefined) mgmtPayload.displayName = displayName.trim();
  if (department !== undefined) mgmtPayload.department = department.trim();
  if (status !== undefined) mgmtPayload.status = status;
  if (notes !== undefined) mgmtPayload.notes = notes.trim();

  await writeRegistrarManagement(uid, mgmtPayload, managedByUid);
}

export async function setRegistrarStatus(uid, status, managedByUid) {
  await updateRegistrarAccount(uid, { status }, managedByUid);
}

export async function deleteRegistrarAccount(uid) {
  // Call Cloud Function to delete Auth user first
  try {
    const deleteAuthUser = httpsCallable(functions, 'deleteRegistrarAuthUser');
    await deleteAuthUser({ uid });
    console.log('Successfully deleted registrar auth user and Firestore data:', uid);
  } catch (error) {
    console.error('Error deleting registrar via Cloud Function:', error);
    throw new Error('Failed to delete registrar account: ' + error.message);
  }
}

export async function resetRegistrarPassword(email) {
  const validation = validateInstitutionalEmail(email);
  if (!validation.valid) {
    throw new Error(validation.message);
  }
  await sendPasswordResetEmail(auth, normalizeEmail(email));
}

export async function seedPermissionCatalog(catalog) {
  const batchWrites = catalog.map((item) =>
    setDoc(
      doc(db, COLLECTIONS.PERMISSIONS, item.id),
      {
        key: item.id,
        label: item.label,
        module: item.module,
        description: item.label,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    ),
  );
  await Promise.all(batchWrites);
}
