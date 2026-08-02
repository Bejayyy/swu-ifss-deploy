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
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import {
  APPROVAL_RECORD_STATUS,
  APPROVAL_TYPES,
  RESERVATION_STATUS,
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
  return { id: ref.id, ...reservation };
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
      return;
    }

    records[nextIndex] = { ...records[nextIndex], status: APPROVAL_RECORD_STATUS.PENDING };
    transaction.update(ref, {
      approvalRecords: records,
      status: RESERVATION_STATUS.IN_PROGRESS,
      updatedAt: serverTimestamp(),
    });
  });
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

  // Check 2: Maintenance schedules
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
}

/**
 * Get approved reservations for a specific room
 * Useful for displaying schedules
 */
export async function fetchApprovedReservationsForRoom(roomId) {
  if (!roomId) return [];

  const q = query(
    reservationsCollection(),
    where('roomId', '==', roomId),
    where('status', '==', RESERVATION_STATUS.APPROVED),
    orderBy('dateOfActivity', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(mapReservationDoc);
}

/**
 * Subscribe to approved reservations for a specific room
 */
export function subscribeApprovedReservationsForRoom(roomId, onData, onError) {
  if (!roomId) {
    onData([]);
    return () => {};
  }

  const q = query(
    reservationsCollection(),
    where('roomId', '==', roomId),
    where('status', '==', RESERVATION_STATUS.APPROVED),
    orderBy('dateOfActivity', 'asc')
  );

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map(mapReservationDoc)),
    onError
  );
}
