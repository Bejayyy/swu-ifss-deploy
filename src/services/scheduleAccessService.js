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
import { COLLEGE_ACRONYM_MAP } from '../constants/colleges';

const ACCESS_CONTROL_COLLECTION = 'schedule_access_control';

// Document ID is based on school year and semester
function getAccessControlDocId(schoolYearId, semester) {
  return `${schoolYearId}_sem${semester}`;
}

function accessControlRef(schoolYearId, semester) {
  return doc(db, ACCESS_CONTROL_COLLECTION, getAccessControlDocId(schoolYearId, semester));
}

/**
 * Checks if two college identifiers match (handles acronyms, full names, and fuzzy college prefixes)
 */
export function isCollegeMatch(targetCollege, approvedCollegeEntry) {
  if (!targetCollege || !approvedCollegeEntry) return false;

  const cleanTarget = String(targetCollege).trim().toLowerCase();
  const cleanApproved = String(approvedCollegeEntry).trim().toLowerCase();

  if (cleanTarget === cleanApproved) return true;

  // Normalize by stripping common institutional prefixes and punctuation
  const normalize = (s) =>
    String(s || '')
      .replace(/^college\s+of\s+/i, '')
      .replace(/^school\s+of\s+/i, '')
      .replace(/^department\s+of\s+/i, '')
      .replace(/[\s\-_()]/g, '')
      .toLowerCase();

  const normTarget = normalize(cleanTarget);
  const normApproved = normalize(cleanApproved);

  if (normTarget && normApproved) {
    if (normTarget === normApproved || normTarget.includes(normApproved) || normApproved.includes(normTarget)) {
      return true;
    }
  }

  // Cross-check COLLEGE_ACRONYM_MAP (e.g. BSMT <-> College of Medical Technology)
  for (const [acronym, fullName] of Object.entries(COLLEGE_ACRONYM_MAP)) {
    const aLower = acronym.toLowerCase();
    const fNorm = normalize(fullName);

    const targetIsAcronym = cleanTarget === aLower || normTarget === aLower;
    const targetIsFull = normTarget === fNorm || cleanTarget.includes(fNorm) || fNorm.includes(normTarget);

    const approvedIsAcronym = cleanApproved === aLower || normApproved === aLower;
    const approvedIsFull = normApproved === fNorm || cleanApproved.includes(fNorm) || fNorm.includes(normApproved);

    if ((targetIsAcronym || targetIsFull) && (approvedIsAcronym || approvedIsFull)) {
      return true;
    }
  }

  return false;
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
      (typeof c === 'string' ? c : c.code || '').trim()
    );

    const isAllGranted = grantedCodes.some((c) => String(c).toUpperCase() === 'ALL') || grantedCodes.length === 0;

    const matchingDeans = allDeans.filter((dean) => {
      if (isAllGranted) return true;
      const dept = dean.department || dean.departmentCode || '';
      const col = dean.college || dean.collegeCode || '';
      return grantedCodes.some((code) =>
        isCollegeMatch(dept, code) || isCollegeMatch(col, code)
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
export function hasSchedulingAccess(accessControl, collegeOrUser) {
  if (!accessControl || !collegeOrUser) return false;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const startDate = accessControl.startDate || accessControl.firstCollege?.startDate;
  const endDate = accessControl.endDate || accessControl.firstCollege?.endDate;

  if (startDate && todayStr < startDate) return false;
  if (endDate && todayStr > endDate) return false;

  // If all colleges allowed, everyone can schedule
  if (accessControl.status === 'all_allowed') {
    return true;
  }

  // Extract all candidate strings for the target college/user
  const targetCandidates = [];
  if (typeof collegeOrUser === 'string') {
    targetCandidates.push(collegeOrUser);
  } else if (collegeOrUser && typeof collegeOrUser === 'object') {
    if (collegeOrUser.college) targetCandidates.push(collegeOrUser.college);
    if (collegeOrUser.department) targetCandidates.push(collegeOrUser.department);
    if (collegeOrUser.code) targetCandidates.push(collegeOrUser.code);
    if (collegeOrUser.name) targetCandidates.push(collegeOrUser.name);
    if (collegeOrUser.collegeCode) targetCandidates.push(collegeOrUser.collegeCode);
    if (Array.isArray(collegeOrUser.programs)) {
      collegeOrUser.programs.forEach((p) => {
        if (p.code) targetCandidates.push(p.code);
        if (p.name) targetCandidates.push(p.name);
      });
    }
  }

  if (targetCandidates.length === 0) return false;

  const approvedList = Array.isArray(accessControl.approvedColleges) ? accessControl.approvedColleges : [];
  const firstCollegeCodes = (accessControl.firstCollege?.code || '').split(',').map((s) => s.trim());
  const firstCollegeNames = (accessControl.firstCollege?.name || '').split(',').map((s) => s.trim());

  const allApproved = [...approvedList, ...firstCollegeCodes, ...firstCollegeNames].filter(Boolean);

  return targetCandidates.some((candidate) =>
    allApproved.some((approved) => isCollegeMatch(candidate, approved))
  );
}

/**
 * Check if this is the first college (for special UI treatment)
 */
export function isFirstCollege(accessControl, collegeOrUser) {
  if (!accessControl || !collegeOrUser) return false;
  const firstCode = accessControl.firstCollege?.code || '';
  const firstName = accessControl.firstCollege?.name || '';

  const targetCandidates = [];
  if (typeof collegeOrUser === 'string') {
    targetCandidates.push(collegeOrUser);
  } else if (collegeOrUser && typeof collegeOrUser === 'object') {
    if (collegeOrUser.college) targetCandidates.push(collegeOrUser.college);
    if (collegeOrUser.department) targetCandidates.push(collegeOrUser.department);
    if (collegeOrUser.code) targetCandidates.push(collegeOrUser.code);
    if (collegeOrUser.name) targetCandidates.push(collegeOrUser.name);
  }

  return targetCandidates.some((candidate) =>
    isCollegeMatch(candidate, firstCode) || isCollegeMatch(candidate, firstName)
  );
}

/**
 * Get access status message for a college
 */
export function getAccessStatusMessage(accessControl, collegeOrUser) {
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

  const hasAccess = hasSchedulingAccess(accessControl, collegeOrUser);
  const isFirst = isFirstCollege(accessControl, collegeOrUser);

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
    for (const [k, v] of Object.entries(accessControl.assignedRoomsByCollege)) {
      if (Array.isArray(v) && v.length > 0 && isCollegeMatch(collegeCode, k)) {
        return v;
      }
    }
  }

  // Fallback to global assignedRooms array
  if (Array.isArray(accessControl.assignedRooms) && accessControl.assignedRooms.length > 0) {
    return accessControl.assignedRooms;
  }

  return [];
}

