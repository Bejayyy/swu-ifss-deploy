import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  query,
  where,
  addDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/firebase';
import { ROLES } from '../firebase/constants';

const ACCESS_CONTROL_COLLECTION = 'schedule_access_control';

// Document ID is based on school year and semester
function getAccessControlDocId(schoolYearId, semester) {
  return `${schoolYearId}_sem${semester}`;
}

function accessControlRef(schoolYearId, semester) {
  return doc(db, ACCESS_CONTROL_COLLECTION, getAccessControlDocId(schoolYearId, semester));
}

/**
 * Notify deans via email and in-app notifications when course scheduling access is granted
 */
export async function notifyDeansAccessGranted({
  schoolYearLabel,
  semester,
  grantedColleges = [],
  startDate,
  endDate,
  sendEmail = true,
}) {
  try {
    const snap = await getDocs(collection(db, 'users'));
    if (snap.empty) return;

    const allDeans = snap.docs
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((u) => {
        const r = (u.role || u.roleValue || '').toLowerCase();
        const s = (u.status || 'active').toLowerCase();
        return r === 'dean' && s !== 'inactive';
      });

    if (allDeans.length === 0) return;

    const grantedCodes = grantedColleges.map((c) =>
      (typeof c === 'string' ? c : c.code || '').trim().toLowerCase()
    );

    const isAllGranted = grantedCodes.includes('all') || grantedCodes.length === 0;

    const matchingDeans = allDeans.filter((dean) => {
      if (isAllGranted) return true;
      const dept = (dean.department || dean.departmentCode || '').trim().toLowerCase();
      const col = (dean.college || dean.collegeCode || '').trim().toLowerCase();
      return grantedCodes.some((code) =>
        dept.includes(code) || col.includes(code) || code.includes(dept) || code.includes(col)
      );
    });

    if (matchingDeans.length === 0) return;

    const startLabel = startDate ? new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Immediate';
    const endLabel = endDate ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline set';

    for (const dean of matchingDeans) {
      const collegeLabel = dean.department || dean.college || 'College';

      // 1. Create in-app notification in Firestore
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: dean.uid,
          userEmail: dean.email || '',
          title: '📋 Course Scheduling Access Granted',
          message: `Your department (${collegeLabel}) has been granted course scheduling access for ${schoolYearLabel} Semester ${semester}. Accomplishment Window: ${startLabel} to ${endLabel}.`,
          type: 'access_granted',
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Failed to save in-app notification:', err);
      }

      // 2. Trigger Cloud Function email
      if (sendEmail && dean.email) {
        try {
          const sendAccessEmail = httpsCallable(functions, 'sendScheduleAccessGrantedEmail');
          await sendAccessEmail({
            email: dean.email,
            displayName: dean.displayName || dean.name || 'Dean',
            collegeName: collegeLabel,
            schoolYearLabel: schoolYearLabel || '',
            semester: String(semester),
            startDate: startLabel,
            endDate: endLabel,
          });
        } catch (emailErr) {
          console.warn('Email notification warning (Cloud Function error):', emailErr.message);
        }
      }
    }
  } catch (err) {
    console.error('Error notifying deans:', err);
  }
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
  startDate = '',
  endDate = '',
  sendEmail = true,
  assignedRooms = [],
  assignedRoomsByCollege = {},
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

  const syLabel = schoolYearLabel || `SY ${schoolYearId}`;

  if (snap.exists()) {
    await updateDoc(ref, {
      'firstCollege.code': finalCollegeCodes.join(', '),
      'firstCollege.name': firstName,
      'firstCollege.startDate': startDate || null,
      'firstCollege.endDate': endDate || null,
      'firstCollege.updatedAt': new Date().toISOString(),
      approvedColleges: finalCollegeCodes,
      startDate: startDate || null,
      endDate: endDate || null,
      assignedRooms: Array.isArray(assignedRooms) ? assignedRooms : [],
      assignedRoomsByCollege: assignedRoomsByCollege || {},
      updatedBy: grantedBy,
      updatedAt: serverTimestamp(),
    });

    await notifyDeansAccessGranted({
      schoolYearLabel: syLabel,
      semester,
      grantedColleges: finalCollegeCodes,
      startDate,
      endDate,
      sendEmail,
    });

    return {
      ...snap.data(),
      approvedColleges: finalCollegeCodes,
      startDate,
      endDate,
      assignedRooms: Array.isArray(assignedRooms) ? assignedRooms : [],
      assignedRoomsByCollege: assignedRoomsByCollege || {},
    };
  }

  const accessControl = {
    schoolYearId,
    schoolYearLabel: syLabel,
    semester: Number(semester),
    
    firstCollege: {
      code: finalCollegeCodes.join(', '),
      name: firstName,
      startDate: startDate || null,
      endDate: endDate || null,
      grantedAt: new Date().toISOString(),
    },
    
    approvedColleges: finalCollegeCodes,
    startDate: startDate || null,
    endDate: endDate || null,
    assignedRooms: Array.isArray(assignedRooms) ? assignedRooms : [],
    assignedRoomsByCollege: assignedRoomsByCollege || {},
    status: 'first_only',
    
    allAccessGrantedAt: null,
    allAccessGrantedBy: null,
    
    grantedBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, accessControl);

  await notifyDeansAccessGranted({
    schoolYearLabel: syLabel,
    semester,
    grantedColleges: finalCollegeCodes,
    startDate,
    endDate,
    sendEmail,
  });

  return accessControl;
}

/**
 * Registrar allows all remaining colleges to schedule
 */
export async function grantAllRemainingAccess(schoolYearId, semester, grantedBy, options = {}) {
  const ref = accessControlRef(schoolYearId, semester);
  const snap = await getDoc(ref);

  const { startDate = '', endDate = '', sendEmail = true } = options;

  if (!snap.exists()) {
    throw new Error('No access control found. Grant first college access first.');
  }

  const data = snap.data();
  const syLabel = data.schoolYearLabel || `SY ${schoolYearId}`;

  await updateDoc(ref, {
    status: 'all_allowed',
    allAccessGrantedAt: new Date().toISOString(),
    allAccessGrantedBy: grantedBy,
    startDate: startDate || data.startDate || null,
    endDate: endDate || data.endDate || null,
    updatedAt: serverTimestamp(),
  });

  await notifyDeansAccessGranted({
    schoolYearLabel: syLabel,
    semester,
    grantedColleges: ['ALL'],
    startDate: startDate || data.startDate,
    endDate: endDate || data.endDate,
    sendEmail,
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
  
  const todayStr = new Date().toISOString().split('T')[0];
  const startDate = accessControl.startDate || accessControl.firstCollege?.startDate;
  const endDate = accessControl.endDate || accessControl.firstCollege?.endDate;

  if (startDate && todayStr < startDate) return false;
  if (endDate && todayStr > endDate) return false;

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

  const todayStr = new Date().toISOString().split('T')[0];
  const startDate = accessControl.startDate || accessControl.firstCollege?.startDate;
  const endDate = accessControl.endDate || accessControl.firstCollege?.endDate;

  const startFormatted = startDate ? new Date(startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const endFormatted = endDate ? new Date(endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  if (startDate && todayStr < startDate) {
    return {
      hasAccess: false,
      message: `Course scheduling access will open on ${startFormatted}.`,
      isFirst: false,
    };
  }

  if (endDate && todayStr > endDate) {
    return {
      hasAccess: false,
      message: `Course scheduling access expired on ${endFormatted}. Please contact Registrar for an extension.`,
      isFirst: false,
      isExpired: true,
    };
  }

  const hasAccess = hasSchedulingAccess(accessControl, collegeCode);
  const isFirst = isFirstCollege(accessControl, collegeCode);

  if (hasAccess) {
    const windowNotice = (startDate || endDate)
      ? ` (Accomplishment Window: ${startFormatted || 'Immediate'} – ${endFormatted || 'No deadline'})`
      : '';

    if (isFirst && accessControl.status === 'first_only') {
      return {
        hasAccess: true,
        message: `You are the first college to schedule. Other colleges will schedule after you complete${windowNotice}.`,
        isFirst: true,
      };
    }
    return {
      hasAccess: true,
      message: `You can now create your course schedule${windowNotice}.`,
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

/**
 * Get assigned room codes for a specific college
 */
export function getAssignedRoomsForCollege(accessControl, collegeCode) {
  if (!accessControl) return [];

  if (accessControl.assignedRoomsByCollege && collegeCode) {
    const code = String(collegeCode).trim().toUpperCase();
    if (Array.isArray(accessControl.assignedRoomsByCollege[code]) && accessControl.assignedRoomsByCollege[code].length > 0) {
      return accessControl.assignedRoomsByCollege[code];
    }
    for (const [k, v] of Object.entries(accessControl.assignedRoomsByCollege)) {
      if (Array.isArray(v) && v.length > 0) {
        const kUpper = k.toUpperCase();
        if (kUpper === code || kUpper.includes(code) || code.includes(kUpper)) {
          return v;
        }
      }
    }
  }

  // Fallback to global assignedRooms array
  if (Array.isArray(accessControl.assignedRooms) && accessControl.assignedRooms.length > 0) {
    return accessControl.assignedRooms;
  }

  return [];
}

