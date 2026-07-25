import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';

function maintenanceSchedulesCollection() {
  return collection(db, COLLECTIONS.MAINTENANCE_SCHEDULES);
}

function maintenanceReportsCollection() {
  return collection(db, COLLECTIONS.MAINTENANCE_REPORTS);
}

function roomsCollection() {
  return collection(db, COLLECTIONS.ROOMS);
}

/**
 * Schedule maintenance for a room
 */
export async function scheduleRoomMaintenance({
  roomId,
  roomDocId, // Added: Firestore document ID for the room
  roomName,
  buildingId,
  buildingName,
  startDate,
  endDate,
  reason,
  scheduledByUid,
  scheduledByName,
  durationType = 'days', // 'hours' or 'days'
  startTime = null,
  durationHours = null,
  reportId = null, // Link to maintenance report if scheduling from a report
}) {
  if (!roomId || !startDate || !endDate) {
    throw new Error('Room ID, start date, and end date are required.');
  }

  const scheduleRef = doc(maintenanceSchedulesCollection());
  
  const schedule = {
    roomId: roomDocId || roomId, // Use docId if available, fallback to roomId
    roomName: roomName || '',
    buildingId: buildingId || null,
    buildingName: buildingName || '',
    startDate,
    endDate,
    reason: reason?.trim() || 'Scheduled maintenance',
    scheduledByUid: scheduledByUid || null,
    scheduledByName: scheduledByName || '',
    status: 'scheduled', // scheduled, in-progress, completed, cancelled
    durationType, // 'hours' or 'days'
    ...(durationType === 'hours' && {
      startTime,
      durationHours,
      isQuickFix: true,
    }),
    ...(reportId && { reportId }), // Link to the report if provided
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(scheduleRef, schedule);

  // If scheduling from a report, update report with scheduleId
  if (reportId) {
    const reportRef = doc(maintenanceReportsCollection(), reportId);
    const reportSnap = await getDoc(reportRef);
    if (reportSnap.exists()) {
      const currentStatus = reportSnap.data().status;
      const updates = {
        scheduleId: scheduleRef.id,
        updatedAt: serverTimestamp(),
      };
      
      // If still pending, also acknowledge it
      if (currentStatus === 'pending') {
        updates.status = 'acknowledged';
        updates.acknowledgedByUid = scheduledByUid;
        updates.acknowledgedByName = scheduledByName;
        updates.acknowledgedAt = serverTimestamp();
      }
      
      await updateDoc(reportRef, updates);
    }
  }

  // Note: Room status update is skipped here to avoid permission issues
  // GSD can create maintenance schedules, but updating room status requires registrar/buildings.manage permission
  // The maintenance schedule itself is sufficient to block the room in the schedule view

  return { id: scheduleRef.id, ...schedule };
}

/**
 * Update maintenance schedule
 */
export async function updateMaintenanceSchedule(scheduleId, updates) {
  if (!scheduleId) throw new Error('Schedule ID is required.');
  
  const scheduleRef = doc(maintenanceSchedulesCollection(), scheduleId);
  await updateDoc(scheduleRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  // If updating dates and status is active, update room status too
  if (updates.startDate || updates.endDate) {
    const scheduleSnap = await getDoc(scheduleRef);
    if (scheduleSnap.exists()) {
      const schedule = scheduleSnap.data();
      const now = new Date().toISOString().split('T')[0];
      const startDate = updates.startDate || schedule.startDate;
      const endDate = updates.endDate || schedule.endDate;

      if (startDate <= now && endDate >= now) {
        await updateRoomMaintenanceStatus(schedule.roomId, {
          maintenanceStatus: 'under-maintenance',
          maintenanceStartDate: startDate,
          maintenanceEndDate: endDate,
          maintenanceReason: updates.reason || schedule.reason,
          maintenanceScheduleId: scheduleId,
        });
      } else if (endDate < now) {
        // Maintenance period has ended
        await updateRoomMaintenanceStatus(schedule.roomId, {
          maintenanceStatus: 'operational',
          maintenanceStartDate: null,
          maintenanceEndDate: null,
          maintenanceReason: null,
          maintenanceScheduleId: null,
        });
      }
    }
  }
}

/**
 * Complete or cancel maintenance schedule
 */
export async function completeMaintenanceSchedule(scheduleId) {
  if (!scheduleId) throw new Error('Schedule ID is required.');
  
  const scheduleRef = doc(maintenanceSchedulesCollection(), scheduleId);
  const scheduleSnap = await getDoc(scheduleRef);
  
  if (!scheduleSnap.exists()) {
    throw new Error('Maintenance schedule not found.');
  }

  const schedule = scheduleSnap.data();
  
  await updateDoc(scheduleRef, {
    status: 'completed',
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Clear room maintenance status
  await updateRoomMaintenanceStatus(schedule.roomId, {
    maintenanceStatus: 'operational',
    maintenanceStartDate: null,
    maintenanceEndDate: null,
    maintenanceReason: null,
    maintenanceScheduleId: null,
  });
}

/**
 * Delete maintenance schedule
 */
export async function deleteMaintenanceSchedule(scheduleId) {
  if (!scheduleId) throw new Error('Schedule ID is required.');
  
  const scheduleRef = doc(maintenanceSchedulesCollection(), scheduleId);
  const scheduleSnap = await getDoc(scheduleRef);
  
  if (scheduleSnap.exists()) {
    const schedule = scheduleSnap.data();
    // Clear room maintenance status if it's linked to this schedule
    await updateRoomMaintenanceStatus(schedule.roomId, {
      maintenanceStatus: 'operational',
      maintenanceStartDate: null,
      maintenanceEndDate: null,
      maintenanceReason: null,
      maintenanceScheduleId: null,
    });
  }
  
  await deleteDoc(scheduleRef);
}

/**
 * Update room maintenance status
 */
export async function updateRoomMaintenanceStatus(roomId, maintenanceData) {
  if (!roomId) throw new Error('Room ID is required.');
  
  const roomRef = doc(roomsCollection(), roomId);
  await updateDoc(roomRef, {
    ...maintenanceData,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Report maintenance issue for a room
 */
export async function reportMaintenanceIssue({
  roomId,
  roomDocId, // Added: Firestore document ID for the room
  roomName,
  buildingId,
  buildingName,
  floor,
  issue,
  priority,
  reportedByUid,
  reportedByName,
  reportedByEmail,
}) {
  if (!roomId || !issue) {
    throw new Error('Room ID and issue description are required.');
  }

  const reportRef = doc(maintenanceReportsCollection());
  
  const report = {
    roomId,
    roomDocId: roomDocId || null, // Store the Firestore document ID
    roomName: roomName || '',
    buildingId: buildingId || null,
    buildingName: buildingName || '',
    floor: floor || null,
    issue: issue.trim(),
    priority: priority || 'medium', // low, medium, high, urgent
    status: 'pending', // pending, acknowledged, in-progress, resolved, closed
    reportedByUid: reportedByUid || null,
    reportedByName: reportedByName || '',
    reportedByEmail: reportedByEmail || '',
    acknowledgedByUid: null,
    acknowledgedByName: null,
    acknowledgedAt: null,
    scheduleId: null, // Will be set when GSD schedules maintenance
    resolvedAt: null,
    resolution: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(reportRef, report);
  return { id: reportRef.id, ...report };
}

/**
 * Update maintenance report status
 */
export async function updateMaintenanceReport(reportId, updates) {
  if (!reportId) throw new Error('Report ID is required.');
  
  const reportRef = doc(maintenanceReportsCollection(), reportId);
  await updateDoc(reportRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Acknowledge maintenance report (GSD marks as seen)
 */
export async function acknowledgeMaintenanceReport(reportId, acknowledgedByUid, acknowledgedByName) {
  if (!reportId) throw new Error('Report ID is required.');
  
  const reportRef = doc(maintenanceReportsCollection(), reportId);
  const reportSnap = await getDoc(reportRef);
  
  if (!reportSnap.exists()) {
    throw new Error('Report not found.');
  }

  const report = reportSnap.data();
  
  // Update report status
  await updateDoc(reportRef, {
    status: 'acknowledged',
    acknowledgedByUid,
    acknowledgedByName,
    acknowledgedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Send notification to reporter
  await sendMaintenanceNotification({
    recipientUid: report.reportedByUid,
    recipientName: report.reportedByName,
    recipientEmail: report.reportedByEmail,
    type: 'report_acknowledged',
    title: 'Maintenance Report Acknowledged',
    message: `Your maintenance report for ${report.roomName} has been acknowledged by ${acknowledgedByName}. The GSD team will schedule the maintenance soon.`,
    roomName: report.roomName,
    buildingName: report.buildingName,
  });
}

/**
 * Resolve maintenance report
 */
export async function resolveMaintenanceReport(reportId, resolution, resolvedByUid, resolvedByName) {
  if (!reportId) throw new Error('Report ID is required.');
  
  const reportRef = doc(maintenanceReportsCollection(), reportId);
  await updateDoc(reportRef, {
    status: 'resolved',
    resolution: resolution?.trim() || 'Issue resolved',
    resolvedByUid,
    resolvedByName,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Subscribe to maintenance schedules
 */
export function subscribeMaintenanceSchedules(onData, onError, filters = {}) {
  let q = query(maintenanceSchedulesCollection(), orderBy('startDate', 'desc'));

  if (filters.roomId) {
    q = query(maintenanceSchedulesCollection(), where('roomId', '==', filters.roomId), orderBy('startDate', 'desc'));
  }
  if (filters.buildingId) {
    q = query(maintenanceSchedulesCollection(), where('buildingId', '==', filters.buildingId), orderBy('startDate', 'desc'));
  }
  if (filters.status) {
    q = query(maintenanceSchedulesCollection(), where('status', '==', filters.status), orderBy('startDate', 'desc'));
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const schedules = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      console.log('[subscribeMaintenanceSchedules] Fetched schedules:', schedules.length);
      onData(schedules);
    },
    onError
  );
}

/**
 * Subscribe to maintenance reports (for GSD notifications)
 */
export function subscribeMaintenanceReports(onData, onError, filters = {}) {
  let q = query(maintenanceReportsCollection(), orderBy('createdAt', 'desc'));

  if (filters.status) {
    q = query(maintenanceReportsCollection(), where('status', '==', filters.status), orderBy('createdAt', 'desc'));
  }
  if (filters.roomId) {
    q = query(maintenanceReportsCollection(), where('roomId', '==', filters.roomId), orderBy('createdAt', 'desc'));
  }
  if (filters.priority) {
    q = query(maintenanceReportsCollection(), where('priority', '==', filters.priority), orderBy('createdAt', 'desc'));
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const reports = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      onData(reports);
    },
    onError
  );
}

/**
 * Get pending maintenance reports count
 */
export async function getPendingMaintenanceReportsCount() {
  const q = query(
    maintenanceReportsCollection(),
    where('status', '==', 'pending')
  );
  const snapshot = await getDocs(q);
  return snapshot.size;
}

/**
 * Get maintenance schedule for a specific room
 */
export async function getRoomMaintenanceSchedule(roomId) {
  if (!roomId) return null;
  
  const now = new Date().toISOString().split('T')[0];
  const q = query(
    maintenanceSchedulesCollection(),
    where('roomId', '==', roomId),
    where('endDate', '>=', now),
    orderBy('endDate', 'asc')
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Check if room is under maintenance
 */
export async function isRoomUnderMaintenance(roomId) {
  if (!roomId) return false;
  
  const roomRef = doc(roomsCollection(), roomId);
  const roomSnap = await getDoc(roomRef);
  
  if (!roomSnap.exists()) return false;
  
  const roomData = roomSnap.data();
  return roomData.maintenanceStatus === 'under-maintenance';
}

/**
 * Send maintenance notification to user
 */
async function sendMaintenanceNotification({ 
  recipientUid, 
  recipientName, 
  recipientEmail, 
  type, 
  title, 
  message, 
  roomName, 
  buildingName 
}) {
  try {
    // Create notification document in Firestore
    const notificationRef = doc(collection(db, 'notifications'));
    await setDoc(notificationRef, {
      recipientUid,
      recipientName,
      recipientEmail,
      type,
      title,
      message,
      roomName,
      buildingName,
      isRead: false,
      createdAt: serverTimestamp(),
    });

    console.log(`Notification sent to ${recipientName} (${recipientEmail}): ${title}`);
    
    // In a production environment, you would also trigger an email here
    // using Firebase Cloud Functions or a third-party email service
    // Example:
    // await sendEmail({
    //   to: recipientEmail,
    //   subject: title,
    //   body: message,
    // });
  } catch (error) {
    console.error('Error sending notification:', error);
    // Don't throw - notification failure shouldn't break the main operation
  }
}
