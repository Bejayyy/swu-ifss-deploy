/**
 * Simple Schedule Access Control Service
 * Registrar grants colleges sequential access to course scheduling
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const ACCESS_CONTROL_COLLECTION = 'schedule_access_control';

// Document ID is based on school year and semester
function getAccessControlDocId(schoolYearId, semester) {
  return `${schoolYearId}_sem${semester}`;
}

function accessControlRef(schoolYearId, semester) {
  return doc(db, ACCESS_CONTROL_COLLECTION, getAccessControlDocId(schoolYearId, semester));
}

/**
 * Subscribe to access control for a specific school year and semester
 */
export function subscribeScheduleAccess(schoolYearId, semester, onData, onError) {
  if (!schoolYearId || !semester) {
    onData(null);
    return () => {};
  }

  return onSnapshot(
    accessControlRef(schoolYearId, semester),
    (snap) => {
      if (snap.exists()) {
        onData({ id: snap.id, ...snap.data() });
      } else {
        onData(null);
      }
    },
    onError
  );
}

/**
 * Get access control document
 */
export async function getScheduleAccess(schoolYearId, semester) {
  const snap = await getDoc(accessControlRef(schoolYearId, semester));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Registrar grants access to first college (or updates existing granted colleges list)
 */
export async function grantFirstCollegeAccess({
  schoolYearId,
  schoolYearLabel,
  semester,
  collegeCode,
  collegeName,
  collegeCodes = [],
  selectedColleges = [],
  grantedBy,
}) {
  const ref = accessControlRef(schoolYearId, semester);
  const snap = await getDoc(ref);

  const finalCollegeCodes = collegeCodes.length > 0
    ? collegeCodes
    : selectedColleges.length > 0
      ? selectedColleges.map((c) => c.code)
      : collegeCode
        ? [collegeCode]
        : [];

  const firstName = selectedColleges.length > 0
    ? selectedColleges.map((c) => `${c.name} (${c.code})`).join(', ')
    : collegeName || collegeCode;

  if (snap.exists()) {
    await updateDoc(ref, {
      'firstCollege.code': finalCollegeCodes.join(', '),
      'firstCollege.name': firstName,
      'firstCollege.updatedAt': new Date().toISOString(),
      approvedColleges: finalCollegeCodes,
      updatedBy: grantedBy,
      updatedAt: serverTimestamp(),
    });
    return { ...snap.data(), approvedColleges: finalCollegeCodes };
  }

  const accessControl = {
    schoolYearId,
    schoolYearLabel: schoolYearLabel || '',
    semester: Number(semester),
    
    firstCollege: {
      code: finalCollegeCodes.join(', '),
      name: firstName,
      grantedAt: new Date().toISOString(),
    },
    
    approvedColleges: finalCollegeCodes,
    status: 'first_only',
    
    allAccessGrantedAt: null,
    allAccessGrantedBy: null,
    
    grantedBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, accessControl);
  return accessControl;
}

/**
 * Registrar allows all remaining colleges to schedule
 */
export async function grantAllRemainingAccess(schoolYearId, semester, grantedBy) {
  const ref = accessControlRef(schoolYearId, semester);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error('No access control found. Grant first college access first.');
  }

  const data = snap.data();
  if (data.status === 'all_allowed') {
    throw new Error('All colleges already have access.');
  }

  await updateDoc(ref, {
    status: 'all_allowed',
    allAccessGrantedAt: new Date().toISOString(),
    allAccessGrantedBy: grantedBy,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Registrar adds a specific college to approved list (optional - for manual control)
 */
export async function grantCollegeAccess(schoolYearId, semester, collegeCode) {
  const ref = accessControlRef(schoolYearId, semester);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error('Access control not initialized.');
  }

  await updateDoc(ref, {
    approvedColleges: arrayUnion(collegeCode),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Check if a college has scheduling access
 */
export function hasSchedulingAccess(accessControl, collegeCode) {
  if (!accessControl || !collegeCode) return false;
  
  // If all colleges allowed, everyone can schedule
  if (accessControl.status === 'all_allowed') {
    return true;
  }
  
  // Otherwise, only approved colleges can schedule
  return (accessControl.approvedColleges || []).includes(collegeCode);
}

/**
 * Check if this is the first college (for special UI treatment)
 */
export function isFirstCollege(accessControl, collegeCode) {
  if (!accessControl || !collegeCode) return false;
  return accessControl.firstCollege?.code === collegeCode;
}

/**
 * Get access status message for a college
 */
export function getAccessStatusMessage(accessControl, collegeCode) {
  if (!accessControl) {
    return {
      hasAccess: false,
      message: 'Waiting for registrar to grant scheduling access.',
      isFirst: false,
    };
  }

  const hasAccess = hasSchedulingAccess(accessControl, collegeCode);
  const isFirst = isFirstCollege(accessControl, collegeCode);

  if (hasAccess) {
    if (isFirst && accessControl.status === 'first_only') {
      return {
        hasAccess: true,
        message: 'You are the first college to schedule. Other colleges will schedule after you complete.',
        isFirst: true,
      };
    }
    return {
      hasAccess: true,
      message: 'You can now create your course schedule.',
      isFirst: false,
    };
  }

  return {
    hasAccess: false,
    message: 'It is not yet your turn to input your course schedule. Please wait for registrar approval.',
    isFirst: false,
  };
}

/**
 * Reset access control (delete the document to start fresh)
 */
export async function resetScheduleAccess(schoolYearId, semester) {
  const ref = accessControlRef(schoolYearId, semester);
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(ref);
}
