import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import { RESERVATION_STATUS } from '../constants/approvalWorkflow';

// ─── Helpers ────────────────────────────────────────────────────────────

function noClassDaysCollection() {
  return collection(db, COLLECTIONS.NO_CLASS_DAYS);
}

function reservationsCollection() {
  return collection(db, COLLECTIONS.ROOM_RESERVATIONS);
}

// ─── Fetch approved reservations on a specific date ─────────────────────

/**
 * Query all APPROVED room_reservations whose dateOfActivity matches the given ISO date.
 * Returns an array of reservation objects.
 */
export async function fetchApprovedReservationsByDate(date) {
  if (!date) return [];

  const q = query(
    reservationsCollection(),
    where('dateOfActivity', '==', date),
    where('status', '==', RESERVATION_STATUS.APPROVED),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Declare a No Class Day ─────────────────────────────────────────────

/**
 * 1. Create a document in no_class_days
 * 2. Update each affected reservation to status: Postponed
 * 3. Send in-app notifications to each reservation creator
 * 4. Send email notifications via Cloud Function
 *
 * @param {string}   date        ISO date string e.g. '2026-08-10'
 * @param {string}   reason      Human-readable reason
 * @param {object}   registrar   { uid, displayName, email }
 * @param {array}    reservations  Pre-fetched approved reservations for this date
 */
export async function declareNoClassDay(date, reason, registrar, reservations = [], schoolYearId = null) {
  if (!date || !reason) throw new Error('Date and reason are required.');

  const affectedIds = reservations.map((r) => r.id);

  // 1. Create no_class_days record
  const ncdRef = await addDoc(noClassDaysCollection(), {
    date,
    reason: reason.trim(),
    schoolYearId: schoolYearId || null,
    declaredBy: registrar.uid || null,
    declaredByName: registrar.displayName || registrar.email || 'Registrar',
    affectedReservationCount: affectedIds.length,
    affectedReservationIds: affectedIds,
    createdAt: serverTimestamp(),
  });

  // 2. Update each reservation to Postponed + send notifications
  for (const reservation of reservations) {
    const resRef = doc(db, COLLECTIONS.ROOM_RESERVATIONS, reservation.id);

    // Mark as Postponed
    await updateDoc(resRef, {
      status: RESERVATION_STATUS.POSTPONED,
      postponedReason: reason.trim(),
      postponedFromDate: date,
      originalDateOfActivity: reservation.dateOfActivity || date,
      updatedAt: serverTimestamp(),
    });

    // 3. In-app notification
    const requestorUid = reservation.createdByUid;
    if (requestorUid) {
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: requestorUid,
          userEmail: reservation.requestorEmail || '',
          title: '⚠️ Reservation Postponed: No Class Day',
          message: `Your reservation "${reservation.title || reservation.activity || 'Room Reservation'}" on ${date} at ${reservation.designatedVenue || reservation.room || 'venue'} has been postponed due to: ${reason}. Click to reschedule.`,
          type: 'postponement',
          reservationId: reservation.id,
          reservationType: reservation.type,
          noClassDayId: ncdRef.id,
          link: `/reschedule/${reservation.id}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Failed to create postponement notification:', err);
      }
    }

    // 4. Email notification
    const email = reservation.requestorEmail || reservation.contactEmail;
    if (email) {
      try {
        const sendPostponementEmail = httpsCallable(functions, 'sendPostponementEmail');
        await sendPostponementEmail({
          email,
          displayName: reservation.requestedBy || reservation.requestor || email,
          reservationTitle: reservation.title || reservation.activity || 'Room Reservation',
          originalDate: date,
          venue: reservation.designatedVenue || reservation.room || 'Campus Venue',
          reason,
          rescheduleLink: `/reschedule/${reservation.id}`,
        });
      } catch (emailErr) {
        console.info('Email notification skipped (Cloud Function "sendPostponementEmail" may not be deployed yet). In-app notification was sent.');
      }
    }
  }

  return { id: ncdRef.id, affectedCount: affectedIds.length };
}

// ─── Subscribe to No Class Days history ─────────────────────────────────

export function subscribeNoClassDays(schoolYearIdOrOnData, onDataOrOnError, possibleOnError) {
  let schoolYearId = null;
  let onData = schoolYearIdOrOnData;
  let onError = onDataOrOnError;

  if (typeof schoolYearIdOrOnData === 'string' || schoolYearIdOrOnData === null || schoolYearIdOrOnData === undefined) {
    if (typeof onDataOrOnError === 'function') {
      schoolYearId = schoolYearIdOrOnData;
      onData = onDataOrOnError;
      onError = possibleOnError;
    }
  }

  const q = query(noClassDaysCollection());
  return onSnapshot(
    q,
    (snap) => {
      let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (schoolYearId) {
        items = items.filter((item) => {
          if (item.schoolYearId) return item.schoolYearId === schoolYearId;
          return schoolYearId.includes('2026') || schoolYearId === 'sy_2026-2027';
        });
      }
      items.sort((a, b) => {
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return bTime - aTime;
      });
      if (onData) onData(items);
    },
    (err) => {
      console.warn('subscribeNoClassDays listener warning:', err);
      if (onError) onError(err);
    }
  );
}

// ─── Reschedule a postponed reservation ─────────────────────────────────

/**
 * Update a postponed reservation with new date/room/building and restore to Approved.
 */
export async function rescheduleReservation(reservationId, {
  newDate,
  newTimeStart,
  newTimeEnd,
  newRoom,
  newRoomDocId,
  newBuilding,
  newBuildingId,
  newFloor,
  newFloorId,
  newDesignatedVenue,
}) {
  if (!reservationId || !newDate) throw new Error('Reservation ID and new date are required.');

  const resRef = doc(db, COLLECTIONS.ROOM_RESERVATIONS, reservationId);

  const updates = {
    status: RESERVATION_STATUS.APPROVED,
    dateOfActivity: newDate,
    rescheduledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (newTimeStart) updates.timeStart = newTimeStart;
  if (newTimeEnd) updates.timeEnd = newTimeEnd;
  if (newRoom) updates.room = newRoom;
  if (newRoomDocId) {
    updates.roomId = newRoomDocId;
    updates.roomDocId = newRoomDocId;
  }
  if (newBuilding) updates.building = newBuilding;
  if (newBuildingId) updates.buildingId = newBuildingId;
  if (newFloor !== undefined) updates.floor = newFloor;
  if (newFloorId) updates.floorId = newFloorId;
  if (newDesignatedVenue) updates.designatedVenue = newDesignatedVenue;

  await updateDoc(resRef, updates);
  return { success: true };
}

// ─── Recommender System ─────────────────────────────────────────────────

/**
 * Smart Room Recommender
 *
 * Given a postponed reservation, find rooms that:
 * 1. Match the same type (Classroom, Laboratory, etc.)
 * 2. Have enough capacity (>= reservation participants)
 * 3. Are not under maintenance
 * 4. Are available on nearby dates (no conflicting approved reservations)
 *
 * Results are ranked by:
 *   Priority 1: Same room, earliest date
 *   Priority 2: Same building + floor, earliest date
 *   Priority 3: Same building different floor, earliest date
 *   Priority 4: Different building, earliest date
 *
 * @param {object} reservation   The postponed reservation object
 * @param {array}  buildingList  All buildings with floorData[].rooms[]
 * @param {number} daysToCheck   How many future days to scan (default 7)
 * @returns {array} Sorted recommendations
 */
export async function getRecommendedRooms(reservation, buildingList = [], daysToCheck = 7) {
  if (!reservation) return [];

  const originalRoomType = (reservation.roomType || '').toLowerCase();
  const requiredCapacity = reservation.participants || 0;
  const originalTimeStart = reservation.timeStart || '08:00';
  const originalTimeEnd = reservation.timeEnd || '10:00';
  const originalRoomDocId = reservation.roomDocId || reservation.roomId;
  const originalBuildingId = reservation.buildingId;
  const originalFloor = reservation.floor;

  // Determine the room type to match — try to infer from room data or venue
  let targetRoomType = originalRoomType;

  // Collect all candidate rooms from buildingList
  const candidateRooms = [];
  for (const building of buildingList) {
    if (!building.floorData) continue;
    for (const floor of building.floorData) {
      if (!floor.rooms) continue;
      for (const room of floor.rooms) {
        // Skip rooms under maintenance
        if (room.maintenanceStatus === 'under-maintenance') continue;
        // Match type if we have one
        if (targetRoomType && (room.type || '').toLowerCase() !== targetRoomType) continue;
        // Must have enough capacity
        if (requiredCapacity > 0 && (room.capacity || 0) < requiredCapacity) continue;

        candidateRooms.push({
          roomDocId: room.docId,
          roomName: room.id || room.name,
          roomType: room.type,
          capacity: room.capacity || 0,
          buildingId: building.id,
          buildingName: building.name,
          floor: floor.floor,
          floorId: floor.floorId,
        });
      }
    }
  }

  if (candidateRooms.length === 0) return [];

  // Generate candidate dates: starting from tomorrow, for daysToCheck days
  const postponedDate = new Date(reservation.postponedFromDate || reservation.dateOfActivity);
  const candidateDates = [];
  for (let i = 1; i <= daysToCheck; i++) {
    const d = new Date(postponedDate);
    d.setDate(d.getDate() + i);
    // Skip Sundays (0)
    if (d.getDay() === 0) continue;
    candidateDates.push(d.toISOString().split('T')[0]);
  }

  if (candidateDates.length === 0) return [];

  // Fetch all approved reservations for the date range to check conflicts
  // We'll query all approved reservations across the candidate dates
  const allConflicts = new Map(); // key: `${roomDocId}_${date}` => [{ timeStart, timeEnd }]

  for (const date of candidateDates) {
    try {
      const q = query(
        reservationsCollection(),
        where('dateOfActivity', '==', date),
        where('status', '==', RESERVATION_STATUS.APPROVED),
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const data = d.data();
        const roomId = data.roomDocId || data.roomId;
        const key = `${roomId}_${date}`;
        if (!allConflicts.has(key)) allConflicts.set(key, []);
        allConflicts.get(key).push({
          timeStart: data.timeStart,
          timeEnd: data.timeEnd,
        });
      }
    } catch (err) {
      console.warn(`Error fetching conflicts for ${date}:`, err);
    }
  }

  // Also check no_class_days to exclude those dates
  let noClassDates = new Set();
  try {
    const ncdSnap = await getDocs(noClassDaysCollection());
    for (const d of ncdSnap.docs) {
      noClassDates.add(d.data().date);
    }
  } catch (err) {
    console.warn('Error checking no class days:', err);
  }

  // Build recommendations
  const recommendations = [];

  for (const room of candidateRooms) {
    for (const date of candidateDates) {
      // Skip no-class dates
      if (noClassDates.has(date)) continue;

      const key = `${room.roomDocId}_${date}`;
      const existingBookings = allConflicts.get(key) || [];

      // Check if the original time slot is available
      const hasConflict = existingBookings.some((booking) => {
        return timeSlotsOverlap(
          originalTimeStart, originalTimeEnd,
          booking.timeStart, booking.timeEnd,
        );
      });

      if (hasConflict) continue;

      // Determine priority
      let priority = 4;
      let label = '';
      const isSameRoom = room.roomDocId === originalRoomDocId;
      const isSameBuilding = String(room.buildingId) === String(originalBuildingId);
      const isSameFloor = isSameBuilding && room.floor === originalFloor;

      if (isSameRoom) {
        priority = 1;
        label = `⭐ Same Room — Available ${formatDateLabel(date)}`;
      } else if (isSameFloor) {
        priority = 2;
        label = `🏢 Same Floor — ${room.roomName}, ${formatDateLabel(date)}`;
      } else if (isSameBuilding) {
        priority = 3;
        label = `🏗️ Same Building — ${room.roomName} (Floor ${room.floor}), ${formatDateLabel(date)}`;
      } else {
        priority = 4;
        label = `📍 ${room.buildingName} — ${room.roomName}, ${formatDateLabel(date)}`;
      }

      recommendations.push({
        roomDocId: room.roomDocId,
        roomName: room.roomName,
        roomType: room.roomType,
        capacity: room.capacity,
        buildingId: room.buildingId,
        buildingName: room.buildingName,
        floor: room.floor,
        floorId: room.floorId,
        availableDate: date,
        availableTimeStart: originalTimeStart,
        availableTimeEnd: originalTimeEnd,
        priority,
        label,
        isSameRoom,
        isSameBuilding,
        isSameFloor,
      });
    }
  }

  // Sort: by priority first, then by date
  recommendations.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.availableDate.localeCompare(b.availableDate);
  });

  // Limit to 20 recommendations to keep UI manageable
  return recommendations.slice(0, 20);
}

// ─── Utility helpers ────────────────────────────────────────────────────

function toMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

function timeSlotsOverlap(startA, endA, startB, endB) {
  const a1 = toMinutes(startA);
  const a2 = toMinutes(endA);
  const b1 = toMinutes(startB);
  const b2 = toMinutes(endB);
  return a1 < b2 && a2 > b1;
}

function formatDateLabel(isoDate) {
  const date = new Date(isoDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const diffDays = Math.round((date - today) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days (${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })})`;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
