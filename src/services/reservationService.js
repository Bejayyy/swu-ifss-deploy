import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  orderBy,
  runTransaction,
  deleteDoc,
  where,
  getDocs,
  addDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import {
  APPROVAL_RECORD_STATUS,
  APPROVAL_TYPES,
  RESERVATION_STATUS,
  isCollegeMatch,
} from '../constants/approvalWorkflow';
import { getWorkflowSnapshot } from './approvalWorkflowService';

function reservationsCollection() {
  return collection(db, COLLECTIONS.ROOM_RESERVATIONS);
}

function reservationRef(id) {
  return doc(db, COLLECTIONS.ROOM_RESERVATIONS, id);
}

function mapReservationDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    approvalRecords: data.approvalRecords || [],
    approvalSteps: data.approvalRecords || data.approvalSteps || [],
  };
}

export function subscribeRoomReservations(onData, onError, userProfile = null) {
  // If no user profile provided, return empty subscription
  if (!userProfile) {
    onData([]);
    return () => {};
  }

  // Registrar can see all reservations
  if (userProfile.role === 'registrar') {
    const q = query(reservationsCollection(), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => onData(snap.docs.map(mapReservationDoc)),
      onError,
    );
  }

  // Dean can see reservations from their college OR their own created requests
  if (userProfile.role === 'dean') {
    const college = userProfile.college || userProfile.department;
    
    // If dean has a college, see both college reservations AND own created reservations
    if (college) {
      // First subscription: College reservations
      const collegeQuery = query(
        reservationsCollection(),
        where('college', '==', college),
        orderBy('createdAt', 'desc')
      );
      
      // Second subscription: Own reservations
      const myQuery = query(
        reservationsCollection(),
        where('createdByUid', '==', userProfile.uid),
        orderBy('createdAt', 'desc')
      );
      
      // Merge results from both queries
      const collegeResults = [];
      const myResults = [];
      const mergedIds = new Set();
      
      const unsubCollege = onSnapshot(
        collegeQuery,
        (snap) => {
          collegeResults.length = 0;
          snap.docs.forEach(doc => {
            collegeResults.push(mapReservationDoc(doc));
            mergedIds.add(doc.id);
          });
          
          // Merge and deduplicate
          const merged = [...collegeResults];
          myResults.forEach(r => {
            if (!mergedIds.has(r.id)) {
              merged.push(r);
            }
          });
          
          // Sort by createdAt
          merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          onData(merged);
        },
        onError
      );
      
      const unsubMy = onSnapshot(
        myQuery,
        (snap) => {
          myResults.length = 0;
          mergedIds.clear();
          collegeResults.forEach(r => mergedIds.add(r.id));
          
          snap.docs.forEach(doc => {
            myResults.push(mapReservationDoc(doc));
          });
          
          // Merge and deduplicate
          const merged = [...collegeResults];
          myResults.forEach(r => {
            if (!mergedIds.has(r.id)) {
              merged.push(r);
            }
          });
          
          // Sort by createdAt
          merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          onData(merged);
        },
        onError
      );
      
      return () => {
        unsubCollege();
        unsubMy();
      };
    }
  }

  // All system roles (GSD, Student Life, Organization Head, Dean, Guard, Custom Roles) see all non-draft reservations AND their own
  // They are part of approval workflows and need to track both Requests to Approve and My Requests
  if (userProfile.role) {
    
    // Subscription 1: All non-draft reservations (for approvals)
    const allQuery = query(
      reservationsCollection(),
      where('status', 'in', [
        RESERVATION_STATUS.PENDING,
        RESERVATION_STATUS.IN_PROGRESS,
        RESERVATION_STATUS.APPROVED,
        RESERVATION_STATUS.REJECTED
      ]),
      orderBy('createdAt', 'desc')
    );
    
    // Subscription 2: Own created reservations (including drafts)
    const myQuery = query(
      reservationsCollection(),
      where('createdByUid', '==', userProfile.uid),
      orderBy('createdAt', 'desc')
    );
    
    // Merge results from both queries
    const allResults = [];
    const myResults = [];
    const mergedIds = new Set();
    
    const unsubAll = onSnapshot(
      allQuery,
      (snap) => {
        allResults.length = 0;
        snap.docs.forEach(doc => {
          allResults.push(mapReservationDoc(doc));
          mergedIds.add(doc.id);
        });
        
        // Merge and deduplicate
        const merged = [...allResults];
        myResults.forEach(r => {
          if (!mergedIds.has(r.id)) {
            merged.push(r);
          }
        });
        
        // Sort by createdAt
        merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        onData(merged);
      },
      onError
    );
    
    const unsubMy = onSnapshot(
      myQuery,
      (snap) => {
        myResults.length = 0;
        mergedIds.clear();
        allResults.forEach(r => mergedIds.add(r.id));
        
        snap.docs.forEach(doc => {
          myResults.push(mapReservationDoc(doc));
        });
        
        // Merge and deduplicate
        const merged = [...allResults];
        myResults.forEach(r => {
          if (!mergedIds.has(r.id)) {
            merged.push(r);
          }
        });
        
        // Sort by createdAt
        merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        onData(merged);
      },
      onError
    );
    
    return () => {
      unsubAll();
      unsubMy();
    };
  }

  // For other roles (teacher, etc.), see their own reservations
  console.log('[subscribeRoomReservations] Other role subscription:', {
    role: userProfile.role,
    uid: userProfile.uid,
    email: userProfile.email
  });
  
  const q = query(
    reservationsCollection(),
    where('createdByUid', '==', userProfile.uid),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(
    q,
    (snap) => {
      const results = snap.docs.map(mapReservationDoc);
      console.log('[subscribeRoomReservations] Teacher/other role got reservations:', results.length);
      onData(results);
    },
    onError,
  );
}

export async function fetchRoomReservation(reservationId) {
  const snap = await getDoc(reservationRef(reservationId));
  if (!snap.exists()) return null;
  return mapReservationDoc(snap);
}

function buildApprovalRecords(workflowSnapshot, submit = true) {
  if (!workflowSnapshot?.length) {
    throw new Error('No approval workflow configured. Contact the Registrar to set up approval levels.');
  }

  return workflowSnapshot.map((level, index) => ({
    id: `lvl_${level.levelNumber}_${level.roleId}`,
    workflowId: level.workflowId || null,
    levelNumber: level.levelNumber,
    roleId: level.roleId,
    roleLabel: level.roleLabel,
    customManagerUid: level.customManagerUid || null,
    customManagerName: level.customManagerName || null,
    status: submit
      ? index === 0
        ? APPROVAL_RECORD_STATUS.PENDING
        : APPROVAL_RECORD_STATUS.WAITING
      : APPROVAL_RECORD_STATUS.WAITING,
    approvedByUid: null,
    approvedByName: null,
    approvedAt: null,
    remarks: null,
  }));
}

export async function createRoomReservation(payload, { draft = false } = {}) {
  const isAcademic = payload.type === APPROVAL_TYPES.ACADEMIC;
  const approvalType = isAcademic
    ? APPROVAL_TYPES.ACADEMIC
    : APPROVAL_TYPES.NON_ACADEMIC;

  // Check for time conflicts with approved reservations and maintenance if not a draft
  if (!draft && payload.roomId && payload.dateOfActivity && payload.timeStart && payload.timeEnd) {
    await checkReservationTimeConflict({
      roomDocId: payload.roomId, // roomId should be the Firestore document ID
      dateOfActivity: payload.dateOfActivity,
      timeStart: payload.timeStart,
      timeEnd: payload.timeEnd,
    });
  }

  // Check if room/floor has a custom manager (dean delegation)
  let customManagerUid = payload.customManagerUid || null;
  let customManagerName = payload.customManagerName || null;
  let workflowSnapshot;
  let useDeanManagedWorkflow = false;

  if (!customManagerUid && payload.buildingId && payload.floorId && payload.roomId) {
    try {
      // Try to get room and floor manager info
      const buildingRef = doc(db, COLLECTIONS.BUILDINGS, String(payload.buildingId));
      const floorRef = doc(buildingRef, COLLECTIONS.FLOORS, String(payload.floorId));
      const roomRef = doc(floorRef, COLLECTIONS.ROOMS, String(payload.roomId));
      
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const roomData = roomSnap.data();
        customManagerUid = roomData.managedBy;
        customManagerName = roomData.managedByName;
        
        // If room doesn't have manager, check floor
        if (!customManagerUid) {
          const floorSnap = await getDoc(floorRef);
          if (floorSnap.exists()) {
            const floorData = floorSnap.data();
            customManagerUid = floorData.managedBy;
            customManagerName = floorData.managedByName;
          }
        }
      }
    } catch (err) {
      console.error('Error checking room/floor manager:', err);
      // Continue with standard workflow if error
    }
  }

  // If custom manager exists, use appropriate dean-managed workflow
  if (customManagerUid && customManagerName) {
    useDeanManagedWorkflow = true;
    
    // Determine which dean-managed workflow to use based on reservation type
    const deanManagedType = isAcademic 
      ? APPROVAL_TYPES.DEAN_MANAGED_ACADEMIC 
      : APPROVAL_TYPES.DEAN_MANAGED_NON_ACADEMIC;
    
    // Get the configurable dean-managed workflow
    workflowSnapshot = await getWorkflowSnapshot(deanManagedType);
    
    // Replace the room manager placeholder with actual manager info
    workflowSnapshot = workflowSnapshot.map(level => {
      if (level.roleId === 'room-manager-dean') {
        return {
          ...level,
          roleLabel: `${customManagerName} (Room Manager)`,
          customManagerUid,
          customManagerName,
        };
      }
      return level;
    });

    // If no dean-managed workflow configured, fall back to default workflow
    if (!workflowSnapshot || workflowSnapshot.length === 0) {
      if (isAcademic) {
        workflowSnapshot = [
          {
            levelNumber: 1,
            roleId: 'dean',
            roleLabel: 'College Dean',
            workflowId: 'dean-managed-fallback',
          },
          {
            levelNumber: 2,
            roleId: 'gsd',
            roleLabel: 'GSD',
            workflowId: 'dean-managed-fallback',
          },
          {
            levelNumber: 3,
            roleId: 'room-manager-dean',
            roleLabel: `${customManagerName} (Room Manager)`,
            workflowId: 'dean-managed-fallback',
            customManagerUid,
            customManagerName,
          },
        ];
      } else {
        // Non-academic fallback
        workflowSnapshot = [
          {
            levelNumber: 1,
            roleId: 'student_life',
            roleLabel: 'Student Life',
            workflowId: 'dean-managed-fallback',
          },
          {
            levelNumber: 2,
            roleId: 'gsd',
            roleLabel: 'GSD',
            workflowId: 'dean-managed-fallback',
          },
          {
            levelNumber: 3,
            roleId: 'room-manager-dean',
            roleLabel: `${customManagerName} (Room Manager)`,
            workflowId: 'dean-managed-fallback',
            customManagerUid,
            customManagerName,
          },
        ];
      }
    }
  } else {
    // Use standard workflow from configuration
    workflowSnapshot = await getWorkflowSnapshot(approvalType);
  }

  const approvalRecords = buildApprovalRecords(workflowSnapshot, !draft);
  const ref = doc(reservationsCollection());

  const reservation = {
    type: approvalType,
    status: draft ? RESERVATION_STATUS.DRAFT : RESERVATION_STATUS.IN_PROGRESS,
    title: payload.activity?.trim() || payload.title?.trim() || 'Room Reservation',
    department: payload.nameOfOrg?.trim() || payload.department?.trim() || '',
    college: payload.college?.trim() || '', // Added college field for filtering
    requestor: payload.requestedBy?.trim() || payload.requestor?.trim() || '',
    requestorEmail: payload.requestorEmail || null,
    createdByUid: payload.createdByUid || null,
    signatureUrl: payload.signatureUrl || payload.requestorSignatureUrl || null,
    requestorSignatureUrl: payload.requestorSignatureUrl || payload.signatureUrl || null,
    nameOfOrg: payload.nameOfOrg?.trim() || '',
    activity: payload.activity?.trim() || '',
    objectives: payload.objectives?.trim() || '',
    designatedVenue: payload.designatedVenue?.trim() || '',
    dateOfActivity: payload.dateOfActivity || '',
    timeStart: payload.timeStart || '',
    timeEnd: payload.timeEnd || '',
    participants: Number(payload.participants) || 0,
    requestedBy: payload.requestedBy?.trim() || '',
    contactNumber: payload.contactNumber?.trim() || '',
    dateFiled: payload.dateFiled || new Date().toLocaleDateString('en-GB'),
    specialRequirements: payload.specialRequirements?.trim() || '',
    building: payload.building || '',
    buildingId: payload.buildingId || null,
    room: payload.room || '',
    roomId: payload.roomId || null,  // This is the Firestore document ID
    roomDocId: payload.roomId || null, // Store explicitly for clarity
    floor: payload.floor ?? null,
    floorId: payload.floorId || null,
    customManagerUid: customManagerUid || null, // Store for filtering
    customManagerName: customManagerName || null,
    workflowSnapshot,
    approvalRecords,
    rejectReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, reservation);

  // Trigger real-time notification to the approver(s) whose turn it is to approve
  if (!draft) {
    const pendingRecord = approvalRecords.find((r) => r.status === APPROVAL_RECORD_STATUS.PENDING);
    if (pendingRecord) {
      await notifyNextApprovers(ref.id, pendingRecord, reservation);
    }
  }

  return { id: ref.id, ...reservation };
}

/**
 * Real-time notification helper for approvers whose turn it is to sign/approve
 */
async function notifyNextApprovers(reservationId, pendingRecord, reservationData) {
  if (!pendingRecord || !reservationId) return;

  try {
    const snap = await getDocs(collection(db, 'users'));
    if (snap.empty) return;

    const allUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    const targetRoleId = (pendingRecord.roleId || '').toLowerCase();
    const customManagerUid = pendingRecord.customManagerUid || reservationData.customManagerUid;

    let targetUsers = [];

    if (targetRoleId === 'room-manager-dean' && customManagerUid) {
      targetUsers = allUsers.filter((u) => u.uid === customManagerUid);
    } else {
      targetUsers = allUsers.filter((u) => {
        const r = (u.role || u.roleValue || '').toLowerCase();
        const s = (u.status || 'active').toLowerCase();
        if (s === 'inactive' || r === 'developer') return false;

        // Role matching per workflow level
        if (targetRoleId === 'dean') {
          if (r !== 'dean') return false;

          let reqCollege = (reservationData.college || reservationData.department || '').trim();

          // Fallback to creator's profile college if payload didn't explicitly store it
          if (!reqCollege && reservationData.createdByUid) {
            const creatorDoc = allUsers.find((user) => user.uid === reservationData.createdByUid);
            if (creatorDoc) {
              reqCollege = creatorDoc.college || creatorDoc.department || creatorDoc.collegeCode || creatorDoc.departmentCode || '';
            }
          }

          const userCollege = u.college || u.department || u.collegeCode || u.departmentCode || '';

          return isCollegeMatch(userCollege, reqCollege);
        }

        if (targetRoleId === 'registrar') {
          return r === 'registrar';
        }

        if (targetRoleId === 'gsd' || targetRoleId === 'gsd-head' || targetRoleId === 'general-services-head') {
          return r === 'gsd' || r === 'gsd-head' || r === 'general-services-head';
        }

        if (targetRoleId === 'student-life' || targetRoleId === 'sfo') {
          return r === 'student-life' || r === 'sfo';
        }

        return r === targetRoleId;
      });
    }

    if (targetUsers.length === 0 && targetRoleId !== 'dean') {
      targetUsers = allUsers.filter((u) => {
        const r = (u.role || u.roleValue || '').toLowerCase();
        const s = (u.status || 'active').toLowerCase();
        return s !== 'inactive' && r !== 'developer' && r === targetRoleId;
      });
    }

    // Exclude developers, inactive users, and the requestor (creator) so they never receive an approval-pending action email ("Review & Approve Request")
    targetUsers = targetUsers.filter((u) => {
      const r = (u.role || u.roleValue || '').toLowerCase();
      const s = (u.status || 'active').toLowerCase();
      const isDeveloper = r === 'developer' || (u.displayName || u.name || '').toLowerCase().includes('developer');
      const isCreatorUid = reservationData.createdByUid && u.uid === reservationData.createdByUid;
      const creatorEmail = (reservationData.requestorEmail || reservationData.createdByEmail || '').trim().toLowerCase();
      const userEmail = (u.email || '').trim().toLowerCase();

      if (s === 'inactive') return false;
      if (isDeveloper) return false;
      if (isCreatorUid) return false;
      if (creatorEmail && userEmail === creatorEmail) return false;

      return true;
    });

    const resType = reservationData.type === 'academic' ? 'Academic' : 'Non-Academic';
    const linkPath = reservationData.type === 'academic'
      ? `/academic-request/${reservationId}`
      : `/request/${reservationId}`;

    // Send submission confirmation email to requestor when Level 1 workflow starts
    const reqEmail = (reservationData.requestorEmail || reservationData.createdByEmail || '').trim();
    if (reqEmail && pendingRecord.levelNumber === 1) {
      try {
        const sendSubmittedEmail = httpsCallable(functions, 'sendReservationSubmittedEmail');
        await sendSubmittedEmail({
          email: reqEmail,
          displayName: reservationData.requestedBy || reservationData.requestorName || '',
          title: reservationData.title || reservationData.activity || 'Room Reservation',
          resType,
          venue: reservationData.designatedVenue || reservationData.room || 'Campus Venue',
          levelNumber: pendingRecord.levelNumber || 1,
          roleLabel: pendingRecord.roleLabel || 'Approver',
          link: linkPath,
        });
      } catch (err) {
        console.info('Note: Submission confirmation email skipped until "sendReservationSubmittedEmail" is deployed.');
      }
    }

    const titleText = `📋 Approval Needed: ${resType} Reservation`;
    const messageText = `Reservation "${reservationData.title || reservationData.activity || 'Room Reservation'}" (${reservationData.designatedVenue || reservationData.room || 'Venue'}) requires your approval (Level ${pendingRecord.levelNumber || 1}: ${pendingRecord.roleLabel || 'Approver'}).`;

    for (const targetUser of targetUsers) {
      // 1. In-app notification
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: targetUser.uid,
          userEmail: targetUser.email || '',
          title: titleText,
          message: messageText,
          type: 'approval',
          reservationId: reservationId,
          reservationType: reservationData.type,
          link: linkPath,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Failed to save approval notification for user:', targetUser.uid, err);
      }

      // 2. Email notification to assigned approver whose turn it is to approve
      if (targetUser.email) {
        try {
          const sendApprovalEmail = httpsCallable(functions, 'sendApprovalPendingEmail');
          await sendApprovalEmail({
            email: targetUser.email,
            displayName: targetUser.name || targetUser.displayName || targetUser.email,
            title: reservationData.title || reservationData.activity || 'Room Reservation',
            resType: resType,
            venue: reservationData.designatedVenue || reservationData.room || 'Campus Venue',
            levelNumber: pendingRecord.levelNumber || 1,
            roleLabel: pendingRecord.roleLabel || 'Approver',
            link: linkPath,
          });
        } catch (emailErr) {
          // Graceful fallback if Cloud Function is not yet deployed to GCP
          console.info('Note: Email notification skipped until "sendApprovalPendingEmail" is deployed via `firebase deploy --only functions`. In-app notifications remain fully active.');
        }
      }
    }
  } catch (err) {
    console.error('Error notifying next approvers:', err);
  }
}

/**
 * Real-time notification helper for requestor when reservation is approved or rejected
 */
async function notifyRequestorStatus({ requestorUid, requestorEmail, title, resType, reservationId, remarks, type, approverName, approverRole, venue }) {
  let targetEmail = (requestorEmail || '').trim();

  // If email is missing, lookup requestor profile by UID
  if (!targetEmail && requestorUid) {
    try {
      const uSnap = await getDoc(doc(db, COLLECTIONS.USERS, requestorUid));
      if (uSnap.exists()) {
        targetEmail = (uSnap.data().email || '').trim();
      }
    } catch (e) {
      console.warn('Could not fetch requestor profile for email:', e);
    }
  }

  if (!requestorUid && !targetEmail) return;

  const isApproved = type === 'requestor_approved';
  const linkPath = resType === 'academic' ? `/academic-request/${reservationId}` : `/request/${reservationId}`;

  // 1. In-app notification
  try {
    await addDoc(collection(db, 'notifications'), {
      userId: requestorUid || '',
      userEmail: targetEmail || '',
      title: isApproved ? '✅ Reservation Approved' : '❌ Reservation Rejected',
      message: isApproved
        ? `Your room reservation "${title}" has been fully approved!`
        : `Your room reservation "${title}" was rejected: ${remarks || 'No reason provided.'}`,
      type: 'approval',
      reservationId,
      reservationType: resType,
      link: linkPath,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Failed to send requestor notification:', err);
  }

  // 2. Email notification to requestor
  if (targetEmail) {
    try {
      const sendDecisionEmail = httpsCallable(functions, 'sendReservationDecisionEmail');
      await sendDecisionEmail({
        email: targetEmail,
        displayName: '',
        title: title || 'Room Reservation',
        resType: resType === 'academic' ? 'Academic' : 'Non-Academic',
        venue: venue || 'Campus Venue',
        status: isApproved ? 'approved' : 'rejected',
        approverName: approverName || 'Approver',
        approverRole: approverRole || 'Approver Step',
        remarks: remarks || '',
        link: linkPath,
      });
    } catch (emailErr) {
      console.info('Note: Decision email notification skipped until "sendReservationDecisionEmail" is deployed via `firebase deploy --only functions`. In-app notifications remain fully active.');
    }
  }
}

export async function submitDraftReservation(reservationId) {
  const ref = reservationRef(reservationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Reservation not found.');

  const data = snap.data();
  if (data.status !== RESERVATION_STATUS.DRAFT) {
    throw new Error('Only draft reservations can be submitted.');
  }

  const workflowSnapshot = data.workflowSnapshot?.length
    ? data.workflowSnapshot
    : await getWorkflowSnapshot(data.type);

  const approvalRecords = buildApprovalRecords(workflowSnapshot, true);

  await setDoc(
    ref,
    {
      status: RESERVATION_STATUS.IN_PROGRESS,
      workflowSnapshot,
      approvalRecords,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const pendingRecord = approvalRecords.find((r) => r.status === APPROVAL_RECORD_STATUS.PENDING);
  if (pendingRecord) {
    await notifyNextApprovers(reservationId, pendingRecord, data);
  }
}

export async function processApprovalAction({
  reservationId,
  approverUid,
  approverName,
  approverRole,
  action,
  remarks = '',
  signatureUrl = null,
}) {
  if (!['approve', 'reject'].includes(action)) {
    throw new Error('Invalid approval action.');
  }

  let notificationToTrigger = null;

  await runTransaction(db, async (transaction) => {
    const ref = reservationRef(reservationId);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('Reservation not found.');

    const data = snap.data();
    const records = [...(data.approvalRecords || [])];
    const pendingIndex = records.findIndex((r) => r.status === APPROVAL_RECORD_STATUS.PENDING);

    if (pendingIndex === -1) {
      throw new Error('No pending approval step for this reservation.');
    }

    const pending = records[pendingIndex];
    
    // Check authorization
    if (pending.roleId === 'room-manager-dean') {
      // Room manager dean - check if the approver is the assigned manager
      if (pending.customManagerUid !== approverUid) {
        throw new Error('You are not authorized to act on this approval step. Only the assigned room manager can approve this.');
      }
    } else if (pending.roleId !== approverRole) {
      throw new Error('You are not authorized to act on this approval step.');
    }

    const now = new Date().toISOString();

    if (action === 'reject') {
      records[pendingIndex] = {
        ...pending,
        status: APPROVAL_RECORD_STATUS.REJECTED,
        approvedByUid: approverUid,
        approvedByName: approverName,
        approvedAt: now,
        remarks: remarks.trim() || null,
        signatureUrl: signatureUrl || pending.signatureUrl || null,
      };
      for (let i = pendingIndex + 1; i < records.length; i += 1) {
        if (records[i].status === APPROVAL_RECORD_STATUS.WAITING) {
          records[i] = { ...records[i], status: APPROVAL_RECORD_STATUS.CANCELLED };
        }
      }
      transaction.update(ref, {
        approvalRecords: records,
        status: RESERVATION_STATUS.REJECTED,
        rejectReason: remarks.trim() || 'Rejected by approver.',
        updatedAt: serverTimestamp(),
      });

      notificationToTrigger = {
        type: 'requestor_rejected',
        reservationId,
        requestorUid: data.createdByUid,
        requestorEmail: data.requestorEmail,
        title: data.title || data.activity || 'Room Reservation',
        resType: data.type,
        remarks: remarks.trim() || 'Rejected by approver.',
        approverName,
        approverRole: pending.roleLabel,
        venue: data.designatedVenue || data.room,
      };
      return;
    }

    records[pendingIndex] = {
      ...pending,
      status: APPROVAL_RECORD_STATUS.APPROVED,
      approvedByUid: approverUid,
      approvedByName: approverName,
      approvedAt: now,
      remarks: remarks.trim() || null,
      signatureUrl: signatureUrl || pending.signatureUrl || null,
    };

    // Persist signature to user profile for future requests
    if (signatureUrl && approverUid) {
      const userRef = doc(db, COLLECTIONS.USERS, approverUid);
      transaction.set(userRef, { signatureUrl, updatedAt: serverTimestamp() }, { merge: true });
    }

    const nextIndex = records.findIndex((r) => r.status === APPROVAL_RECORD_STATUS.WAITING);
    if (nextIndex === -1) {
      transaction.update(ref, {
        approvalRecords: records,
        status: RESERVATION_STATUS.APPROVED,
        updatedAt: serverTimestamp(),
      });

      notificationToTrigger = {
        type: 'requestor_approved',
        reservationId,
        requestorUid: data.createdByUid,
        requestorEmail: data.requestorEmail,
        title: data.title || data.activity || 'Room Reservation',
        resType: data.type,
        approverName,
        approverRole: pending.roleLabel,
        venue: data.designatedVenue || data.room,
      };
      return;
    }

    records[nextIndex] = { ...records[nextIndex], status: APPROVAL_RECORD_STATUS.PENDING };
    transaction.update(ref, {
      approvalRecords: records,
      status: RESERVATION_STATUS.IN_PROGRESS,
      updatedAt: serverTimestamp(),
    });

    notificationToTrigger = {
      type: 'next_approver',
      reservationId,
      pendingRecord: records[nextIndex],
      reservationData: data,
      approvedRecord: records[pendingIndex],
      approverName,
    };
  });

  // Execute notification outside transaction
  if (notificationToTrigger) {
    if (notificationToTrigger.type === 'next_approver') {
      await notifyNextApprovers(
        notificationToTrigger.reservationId,
        notificationToTrigger.pendingRecord,
        notificationToTrigger.reservationData
      );
      await notifyRequestorProgress({
        requestorUid: notificationToTrigger.reservationData.createdByUid,
        requestorEmail: notificationToTrigger.reservationData.requestorEmail,
        title: notificationToTrigger.reservationData.title || notificationToTrigger.reservationData.activity || 'Room Reservation',
        resType: notificationToTrigger.reservationData.type,
        reservationId: notificationToTrigger.reservationId,
        approverName: notificationToTrigger.approverName,
        roleLabel: notificationToTrigger.approvedRecord?.roleLabel,
      });
    } else if (notificationToTrigger.type === 'requestor_rejected' || notificationToTrigger.type === 'requestor_approved') {
      await notifyRequestorStatus(notificationToTrigger);
    }
  }
}

/**
 * Real-time notification helper for requestor when reservation step is approved
 */
async function notifyRequestorProgress({ requestorUid, requestorEmail, title, resType, reservationId, approverName, roleLabel }) {
  if (!requestorUid && !requestorEmail) return;

  const linkPath = resType === 'academic' ? `/academic-request/${reservationId}` : `/request/${reservationId}`;

  try {
    await addDoc(collection(db, 'notifications'), {
      userId: requestorUid || '',
      userEmail: requestorEmail || '',
      title: '✅ Reservation Step Approved',
      message: `Your room reservation "${title}" was approved by ${approverName || 'Approver'} (${roleLabel || 'Step'}).`,
      type: 'approval',
      reservationId,
      reservationType: resType,
      link: linkPath,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Failed to send requestor progress notification:', err);
  }
}

/** Backward-compatible update for legacy in-memory fields */
export async function updateRoomReservation(reservationId, updates) {
  await setDoc(
    reservationRef(reservationId),
    { ...updates, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function deleteRoomReservation(reservationId) {
  if (!reservationId) throw new Error('Reservation ID is required.');
  
  const ref = reservationRef(reservationId);
  const snap = await getDoc(ref);
  
  if (!snap.exists()) {
    throw new Error('Reservation not found.');
  }
  
  await deleteDoc(ref);
}

/**
 * Check if a time slot is already reserved or under maintenance
 * @throws Error if there's a conflict
 */
export async function checkReservationTimeConflict({
  roomDocId,
  dateOfActivity,
  timeStart,
  timeEnd,
  excludeReservationId = null,
}) {
  if (!roomDocId || !dateOfActivity || !timeStart || !timeEnd) {
    return; // Skip validation if required fields are missing
  }

  // Convert DD/MM/YYYY to YYYY-MM-DD for comparison
  let isoDate = dateOfActivity;
  if (dateOfActivity.includes('/')) {
    const parts = dateOfActivity.split('/');
    if (parts.length === 3) {
      isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  // Convert time strings to minutes for comparison
  const toMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const newStart = toMinutes(timeStart);
  const newEnd = toMinutes(timeEnd);

  // Check 1: Approved reservations
  try {
    const reservationsQuery = query(
      reservationsCollection(),
      where('roomDocId', '==', roomDocId),
      where('dateOfActivity', '==', dateOfActivity),
      where('status', '==', RESERVATION_STATUS.APPROVED)
    );

    const reservationsSnapshot = await getDocs(reservationsQuery);
    const existingReservations = reservationsSnapshot.docs
      .map(mapReservationDoc)
      .filter(r => !excludeReservationId || r.id !== excludeReservationId);

    // Check for reservation overlaps
    for (const existing of existingReservations) {
      const existingStart = toMinutes(existing.timeStart);
      const existingEnd = toMinutes(existing.timeEnd);

      // Check if times overlap
      const hasOverlap = (newStart < existingEnd && newEnd > existingStart);

      if (hasOverlap) {
        throw new Error(
          `Time conflict: This room is already reserved from ${existing.timeStart} to ${existing.timeEnd} on this date for "${existing.activity}".`
        );
      }
    }
  } catch (err) {
    if (err.message && err.message.startsWith('Time conflict:')) throw err;
    console.warn('Note: Could not query existing reservations due to permissions:', err?.message || err);
  }

  // Check 2: Maintenance schedules
  try {
    const maintenanceQuery = query(
      collection(db, COLLECTIONS.MAINTENANCE_SCHEDULES),
      where('roomId', '==', roomDocId),
      where('status', 'in', ['scheduled', 'in-progress'])
    );

    const maintenanceSnapshot = await getDocs(maintenanceQuery);
    const maintenanceSchedules = maintenanceSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Check for maintenance overlaps
    for (const schedule of maintenanceSchedules) {
      const maintStart = schedule.startDate;
      const maintEnd = schedule.endDate;

      // Check if the reservation date falls within the maintenance period
      const dateInRange = (isoDate >= maintStart && isoDate <= maintEnd);

      if (dateInRange) {
        // If it's a quick fix (hours), check time overlap
        if (schedule.durationType === 'hours' && schedule.isQuickFix && isoDate === maintStart) {
          const maintStartTime = toMinutes(schedule.startTime || '08:00');
          const maintEndTime = maintStartTime + (schedule.durationHours || 2) * 60;

          const hasTimeOverlap = (newStart < maintEndTime && newEnd > maintStartTime);

          if (hasTimeOverlap) {
            const endTimeStr = `${Math.floor(maintEndTime / 60).toString().padStart(2, '0')}:${(maintEndTime % 60).toString().padStart(2, '0')}`;
            throw new Error(
              `Maintenance conflict: This room is scheduled for maintenance from ${schedule.startTime || '08:00'} to ${endTimeStr} on this date. Reason: "${schedule.reason}".`
            );
          }
        } else {
          // Multi-day maintenance blocks the entire day
          throw new Error(
            `Maintenance conflict: This room is under maintenance from ${maintStart} to ${maintEnd}. Reason: "${schedule.reason}".`
          );
        }
      }
    }
  } catch (err) {
    if (err.message && err.message.startsWith('Maintenance conflict:')) throw err;
    console.warn('Note: Could not query maintenance schedules due to permissions:', err?.message || err);
  }
}

/**
 * Get approved reservations for a specific room
 * Useful for displaying schedules
 */
export async function fetchApprovedReservationsForRoom(roomId, optionalRoomCode = '') {
  if (!roomId && !optionalRoomCode) return [];

  const q = query(
    reservationsCollection(),
    where('status', 'in', [
      RESERVATION_STATUS.PENDING,
      RESERVATION_STATUS.IN_PROGRESS,
      RESERVATION_STATUS.APPROVED,
      RESERVATION_STATUS.REJECTED
    ])
  );

  const snapshot = await getDocs(q);
  const allApproved = snapshot.docs
    .map(mapReservationDoc)
    .filter((r) => r.status === RESERVATION_STATUS.APPROVED || r.status === 'Approved' || r.status === 'approved');
  const targetId = String(roomId || '').trim().toLowerCase();
  const targetCode = String(optionalRoomCode || '').trim().toLowerCase();

  const matched = allApproved.filter((res) => {
    const rRoomId = String(res.roomId || '').trim().toLowerCase();
    const rRoomDocId = String(res.roomDocId || '').trim().toLowerCase();
    const rRoom = String(res.room || '').trim().toLowerCase();
    const rVenue = String(res.designatedVenue || '').trim().toLowerCase();

    const matchId = targetId && (rRoomId === targetId || rRoomDocId === targetId || rRoom === targetId);
    const matchCode = targetCode && (rRoom === targetCode || rRoomId === targetCode || rRoomDocId === targetCode || rVenue.includes(targetCode));
    return matchId || matchCode;
  });

  matched.sort((a, b) => String(a.dateOfActivity || '').localeCompare(String(b.dateOfActivity || '')));
  return matched;
}

/**
 * Subscribe to approved reservations for a specific room
 */
export function subscribeApprovedReservationsForRoom(roomId, onData, onError, optionalRoomCode = '') {
  if (!roomId && !optionalRoomCode) {
    onData([]);
    return () => {};
  }

  const q = query(
    reservationsCollection(),
    where('status', 'in', [
      RESERVATION_STATUS.PENDING,
      RESERVATION_STATUS.IN_PROGRESS,
      RESERVATION_STATUS.APPROVED,
      RESERVATION_STATUS.REJECTED
    ])
  );

  return onSnapshot(
    q,
    (snap) => {
      const allApproved = snap.docs
        .map(mapReservationDoc)
        .filter((r) => r.status === RESERVATION_STATUS.APPROVED || r.status === 'Approved' || r.status === 'approved');
      const targetId = String(roomId || '').trim().toLowerCase();
      const targetCode = String(optionalRoomCode || '').trim().toLowerCase();

      const matched = allApproved.filter((res) => {
        const rRoomId = String(res.roomId || '').trim().toLowerCase();
        const rRoomDocId = String(res.roomDocId || '').trim().toLowerCase();
        const rRoom = String(res.room || '').trim().toLowerCase();
        const rVenue = String(res.designatedVenue || '').trim().toLowerCase();

        const matchId = targetId && (rRoomId === targetId || rRoomDocId === targetId || rRoom === targetId);
        const matchCode = targetCode && (rRoom === targetCode || rRoomId === targetCode || rRoomDocId === targetCode || rVenue.includes(targetCode));
        return matchId || matchCode;
      });

      matched.sort((a, b) => String(a.dateOfActivity || '').localeCompare(String(b.dateOfActivity || '')));
      onData(matched);
    },
    (err) => {
      console.warn('[subscribeApprovedReservationsForRoom] Subscription note:', err?.message || err);
      if (onError) onError(err);
    }
  );
}
