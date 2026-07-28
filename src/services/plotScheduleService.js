import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import {
  PLOT_REQUEST_STATUS,
  RECIPIENT_PLOT_STATUS,
  collegeTierFromValue,
  collegePriorityFromValue,
  sortRecipientsByPlotOrder,
} from '../constants/plotScheduling';
import {
  SCHEDULE_START_HOUR,
  SCHEDULE_END_HOUR,
  hourToTimeInput as gridHourToTimeInput,
  clampScheduleHours,
} from '../constants/scheduleGrid';

function plotRef(id) {
  return doc(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS, id);
}

function entriesRef(plotId) {
  return collection(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS, plotId, COLLECTIONS.SCHEDULE_ENTRIES);
}

export function subscribePlotRequests(onData, onError) {
  const q = query(collection(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    onError,
  );
}

function sortPlotsByCreatedAt(plots) {
  return [...plots].sort((a, b) => {
    const ta = a.createdAt?.seconds ?? a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.seconds ?? b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
}

function mapPlotDocs(docs) {
  return docs.map((d) => ({ id: d.id, ...d.data() }));
}

function normalizePlotEmail(email) {
  return (email || '').trim().toLowerCase() || null;
}

/** Dean view — scoped queries only (Firestore rejects full-collection reads for non-registrars). */
export function subscribePlotRequestsForUser(userId, userEmail, onData, onError) {
  const authEmail = (userEmail || '').trim();
  const col = collection(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS);

  if (!userId && !authEmail) {
    onData([]);
    return () => {};
  }

  const uidResults = userId ? { docs: null } : { docs: [] };
  const emailResults = !userId && authEmail ? { docs: null } : { docs: [] };

  const mergeAndEmit = () => {
    if (userId && uidResults.docs === null) return;
    if (!userId && authEmail && emailResults.docs === null) return;

    const byId = new Map();
    [...mapPlotDocs(uidResults.docs || []), ...mapPlotDocs(emailResults.docs || [])].forEach((plot) => {
      byId.set(plot.id, plot);
    });
    onData(sortPlotsByCreatedAt(Array.from(byId.values())));
  };

  const unsubs = [];

  if (userId) {
    const qUid = query(
      col,
      where('recipientUids', 'array-contains', userId),
      orderBy('createdAt', 'desc'),
    );
    unsubs.push(onSnapshot(
      qUid,
      (snap) => {
        uidResults.docs = snap.docs;
        mergeAndEmit();
      },
      onError,
    ));
  } else if (authEmail) {
    const qEmail = query(
      col,
      where('recipientEmails', 'array-contains', authEmail),
      orderBy('createdAt', 'desc'),
    );
    unsubs.push(onSnapshot(
      qEmail,
      (snap) => {
        emailResults.docs = snap.docs;
        mergeAndEmit();
      },
      onError,
    ));
  }

  return () => unsubs.forEach((unsub) => unsub());
}

export function subscribePlotEntries(plotId, onData, onError) {
  if (!plotId) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    entriesRef(plotId),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

function buildRecipientRecord(raw, plotOrder) {
  const college = raw.college || raw.department || '';
  const tier = collegeTierFromValue(college);
  const priority = collegePriorityFromValue(college);
  return {
    id: raw.id || `rcp_${Date.now()}_${plotOrder}`,
    assignType: raw.assignType,
    uid: raw.uid || null,
    email: normalizePlotEmail(raw.email),
    name: raw.name || '',
    college,
    deanTier: tier,
    priority,
    plotOrder,
    status: plotOrder === 0 ? RECIPIENT_PLOT_STATUS.ACTIVE : RECIPIENT_PLOT_STATUS.WAITING,
  };
}

export function buildRecipientsFromSelection(selectedRecipients) {
  const mapped = selectedRecipients.map((r, idx) => buildRecipientRecord(r, idx));
  return sortRecipientsByPlotOrder(mapped).map((r, idx) => ({
    ...r,
    plotOrder: idx,
    status: idx === 0 ? RECIPIENT_PLOT_STATUS.ACTIVE : RECIPIENT_PLOT_STATUS.WAITING,
  }));
}

export async function createAndSendPlotRequest({
  title,
  notes,
  schoolYearId,
  schoolYearLabel,
  semester,
  restrictRooms,
  assignedRooms,
  recipients,
  createdBy,
}) {
  if (!title?.trim()) throw new Error('Title is required.');
  if (!schoolYearId) throw new Error('School year is required.');
  if (!recipients?.length) throw new Error('Select at least one recipient.');

  const orderedRecipients = buildRecipientsFromSelection(recipients);
  const ref = doc(collection(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS));

  const recipientUids = orderedRecipients.map((r) => r.uid).filter(Boolean);
  const recipientEmails = orderedRecipients.map((r) => r.email).filter(Boolean);

  await setDoc(ref, {
    title: title.trim(),
    notes: (notes || '').trim(),
    schoolYearId,
    schoolYearLabel: schoolYearLabel || '',
    semester: Number(semester) || 1,
    restrictRooms: Boolean(restrictRooms),
    assignedRooms: restrictRooms ? (assignedRooms || []) : [],
    recipients: orderedRecipients,
    recipientUids,
    recipientEmails,
    currentTurnRecipientId: orderedRecipients[0]?.id || null,
    activeRecipientUid: orderedRecipients[0]?.uid || null,
    activeRecipientEmail: orderedRecipients[0]?.email || null,
    status: PLOT_REQUEST_STATUS.SENT,
    createdBy: createdBy || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return ref.id;
}

export async function deletePlotRequest(plotId) {
  await deleteDoc(plotRef(plotId));
}

export async function addPlotEntry(plotId, entry) {
  const ref = doc(entriesRef(plotId));
  await setDoc(ref, {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePlotEntry(plotId, entryId, patch) {
  await updateDoc(doc(entriesRef(plotId), entryId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePlotEntry(plotId, entryId) {
  if (!plotId) throw new Error('Plot ID is required for deletion.');
  if (!entryId) throw new Error('Entry ID is required for deletion.');
  
  console.log('deletePlotEntry called:', { plotId, entryId });
  
  try {
    const entryRef = doc(entriesRef(plotId), entryId);
    await deleteDoc(entryRef);
    console.log('deletePlotEntry successful');
  } catch (error) {
    console.error('deletePlotEntry error:', error);
    throw new Error(`Failed to delete schedule entry: ${error.message}`);
  }
}

function findRecipientIndex(recipients, profile) {
  const profileUid = profile?.uid;
  const profileEmail = normalizePlotEmail(profile?.email);
  return recipients.findIndex(
    (r) => (profileUid && r.uid === profileUid)
      || (profileEmail && normalizePlotEmail(r.email) === profileEmail),
  );
}

/** Dean marks their plotting turn complete and passes to the next college dean (or finishes the request). */
export async function completePlotTurn(plotId, profile) {
  const snap = await getDoc(plotRef(plotId));
  if (!snap.exists()) throw new Error('Plot schedule not found.');

  const plot = snap.data();
  const recipients = [...(plot.recipients || [])];
  const myIdx = findRecipientIndex(recipients, profile);
  if (myIdx < 0) throw new Error('You are not assigned to this plot schedule.');

  const me = recipients[myIdx];
  if (me.status !== RECIPIENT_PLOT_STATUS.ACTIVE) {
    throw new Error('It is not your turn to submit yet.');
  }

  recipients[myIdx] = { ...me, status: RECIPIENT_PLOT_STATUS.COMPLETED };
  const nextIdx = recipients.findIndex(
    (r, idx) => idx > myIdx && r.status !== RECIPIENT_PLOT_STATUS.COMPLETED,
  );

  const patch = {
    recipients,
    updatedAt: serverTimestamp(),
  };

  if (nextIdx >= 0) {
    recipients[nextIdx] = { ...recipients[nextIdx], status: RECIPIENT_PLOT_STATUS.ACTIVE };
    const next = recipients[nextIdx];
    patch.currentTurnRecipientId = next.id;
    patch.activeRecipientUid = next.uid || null;
    patch.activeRecipientEmail = next.email || null;
    patch.status = PLOT_REQUEST_STATUS.IN_PROGRESS;
  } else {
    patch.currentTurnRecipientId = null;
    patch.activeRecipientUid = null;
    patch.activeRecipientEmail = null;
    patch.status = PLOT_REQUEST_STATUS.COMPLETED;
  }

  await updateDoc(plotRef(plotId), patch);
}

export function entriesToGridBlocks(entries, weekDates = []) {
  console.log('entriesToGridBlocks called with entries:', entries.length, 'weekDates:', weekDates);
  
  // Helper function to extract first name from full name
  const getFirstName = (fullName) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts[0] || '';
  };
  
  const blocks = (entries || [])
    .filter((e) => {
      // For regular schedule (weekday-0, weekday-1, etc.), we don't filter by date
      // because entries use day names like "Monday" not "weekday-0"
      // Instead, we rely on the day index being valid (0-6)
      if (!weekDates.length) return true;
      
      // For exam schedule or when we have actual dates, check if date matches
      const isWeekdayFormat = weekDates[0]?.startsWith('weekday-');
      if (isWeekdayFormat) {
        // Regular schedule: don't filter by date, let day index handle it
        return true;
      }
      
      // Exam schedule: filter by actual dates
      return weekDates.includes(e.date);
    })
    .map((e) => {
      const dayIndex = weekDates.length ? weekDates.indexOf(e.date) : (e.day ?? 0);
      return {
        id: e.id,
        date: e.date,
        day: dayIndex >= 0 ? dayIndex : e.day,
        title: e.title || e.subject || 'Untitled',
        course: e.courseCode || e.course || '',
        instructor: getFirstName(e.instructor || ''), // Extract first name only
        start: e.startHour,
        end: e.endHour,
        type: e.type || 'Lecture',
        roomCode: e.roomCode || '',
        scheduleMode: e.scheduleMode || 'regular',
      };
    })
    .filter((e) => e.day >= 0 && e.day <= 6); // Only include valid days (0-6)
  
  console.log('entriesToGridBlocks result:', blocks.length, 'blocks');
  return blocks;
}

export function parseTimeToHour(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (Number.isNaN(h)) return null;
  return h + (m || 0) / 60;
}

export function hourToTimeInput(hour) {
  return gridHourToTimeInput(hour);
}

export function validateScheduleHours(startHour, endHour) {
  if (startHour == null || endHour == null) {
    return { valid: false, message: 'Enter a valid start and end time.' };
  }
  if (startHour < SCHEDULE_START_HOUR || endHour > SCHEDULE_END_HOUR) {
    return { valid: false, message: `Schedule must be between ${gridHourToTimeInput(SCHEDULE_START_HOUR)} and ${gridHourToTimeInput(SCHEDULE_END_HOUR)}.` };
  }
  if (endHour <= startHour) {
    return { valid: false, message: 'End time must be after start time.' };
  }
  const clamped = clampScheduleHours(startHour, endHour);
  return { valid: true, startHour: clamped.start, endHour: clamped.end };
}

/**
 * NEW FUNCTIONS FOR PER-DEAN, PER-SECTION COURSE SCHEDULING
 */

// Collection path for dean's section schedules
function deanSectionEntriesRef(deanUid, section) {
  return collection(
    db, 
    COLLECTIONS.USERS, 
    deanUid, 
    'course_schedules', 
    section, 
    'entries'
  );
}

/**
 * Subscribe to plot entries for a specific dean and section
 * For regular schedule: returns all entries regardless of semester (weekly basis)
 * For exam schedule: filters by semester, scheduleMode, and optionally examPeriod
 */
export function subscribePlotEntriesForDeanSection(deanUid, section, semester, scheduleMode, examPeriod, onData, onError) {
  if (!deanUid || !section) {
    onData([]);
    return () => {};
  }

  console.log('subscribePlotEntriesForDeanSection called with:', {
    deanUid,
    section,
    semester,
    scheduleMode,
    examPeriod
  });

  let q;
  
  if (scheduleMode === 'exam') {
    // Exam schedule: filter by semester, scheduleMode, and examPeriod
    if (examPeriod) {
      q = query(
        deanSectionEntriesRef(deanUid, section),
        where('semester', '==', Number(semester)),
        where('scheduleMode', '==', 'exam'),
        where('examPeriod', '==', examPeriod),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        deanSectionEntriesRef(deanUid, section),
        where('semester', '==', Number(semester)),
        where('scheduleMode', '==', 'exam'),
        orderBy('createdAt', 'desc')
      );
    }
  } else {
    // Regular schedule: get all entries and filter by semester in memory
    // We can't use where('semester', '==', semester) because many old entries don't have semester field
    q = query(
      deanSectionEntriesRef(deanUid, section),
      orderBy('createdAt', 'desc')
    );
  }

  return onSnapshot(
    q,
    (snap) => {
      const allEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log('Raw entries from Firestore:', allEntries);
      
      // For regular schedule, filter to only include regular entries for this semester
      let filteredEntries = allEntries;
      if (scheduleMode === 'regular') {
        filteredEntries = allEntries.filter(entry => {
          // Must be regular schedule mode
          const isRegularMode = !entry.scheduleMode || entry.scheduleMode === 'regular';
          if (!isRegularMode) return false;
          
          // If entry has a valid semester field, it must match selected semester
          const hasSemester = entry.semester !== undefined && entry.semester !== null && entry.semester !== '';
          if (hasSemester) {
            return Number(entry.semester) === Number(semester);
          }
          
          // If entry has no semester field (old entries), don't show them
          // User needs to re-create or update these entries with a semester
          return false;
        });
      }
      
      console.log('Filtered entries:', filteredEntries);
      onData(filteredEntries);
    },
    (err) => {
      console.error('Error in subscribePlotEntriesForDeanSection:', err);
      onError(err);
    }
  );
}

/**
 * Add a plot entry for a specific dean and section
 */
export async function addPlotEntryForSection(deanUid, section, entry) {
  const ref = doc(deanSectionEntriesRef(deanUid, section));
  await setDoc(ref, {
    ...entry,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Update a plot entry for a specific dean and section
 */
export async function updatePlotEntryForSection(deanUid, section, entryId, patch) {
  const ref = doc(deanSectionEntriesRef(deanUid, section), entryId);
  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a plot entry for a specific dean and section
 */
export async function deletePlotEntryForSection(deanUid, section, entryId) {
  const ref = doc(deanSectionEntriesRef(deanUid, section), entryId);
  await deleteDoc(ref);
}

/**
 * Get all sections for a specific dean
 */
export async function getDeanSections(deanUid) {
  if (!deanUid) return [];
  
  try {
    const schedulesRef = collection(db, COLLECTIONS.USERS, deanUid, 'course_schedules');
    const snapshot = await getDocs(schedulesRef);
    
    // Get unique sections (collection IDs)
    const sections = snapshot.docs.map(doc => doc.id);
    return sections.sort(); // Sort alphabetically
  } catch (error) {
    console.error('Error fetching dean sections:', error);
    return [];
  }
}

/**
 * Subscribe to sections for a specific dean
 * Returns section objects with metadata (name, yearLevel, scheduleCount)
 */
export function subscribeDeanSections(deanUid, onData, onError) {
  if (!deanUid) {
    onData([]);
    return () => {};
  }

  const schedulesRef = collection(db, COLLECTIONS.USERS, deanUid, 'course_schedules');
  
  return onSnapshot(
    schedulesRef,
    async (snapshot) => {
      const sectionPromises = snapshot.docs.map(async (doc) => {
        const sectionName = doc.id;
        
        // Count entries in this section
        const entriesRef = deanSectionEntriesRef(deanUid, sectionName);
        const entriesSnapshot = await getDocs(entriesRef);
        const scheduleCount = entriesSnapshot.size;
        
        return {
          id: doc.id,
          name: sectionName, // Section name is the document ID
          scheduleCount, // Add schedule count
          ...doc.data(), // Includes yearLevel, createdAt, etc.
        };
      });
      
      const sections = await Promise.all(sectionPromises);
      
      // Sort by year level first, then by name
      sections.sort((a, b) => {
        const yearA = a.yearLevel || '';
        const yearB = b.yearLevel || '';
        if (yearA !== yearB) {
          return yearA.localeCompare(yearB);
        }
        return a.name.localeCompare(b.name);
      });
      
      onData(sections);
    },
    onError
  );
}

/**
 * Create a new section for a dean
 */
export async function createDeanSection(deanUid, sectionName, yearLevel) {
  if (!deanUid || !sectionName) {
    throw new Error('Dean UID and section name are required.');
  }

  // Create the section document directly in course_schedules
  const sectionRef = doc(db, COLLECTIONS.USERS, deanUid, 'course_schedules', sectionName);
  
  await setDoc(sectionRef, {
    sectionName,
    yearLevel: yearLevel || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return sectionName;
}

/**
 * Delete a section for a dean (and all its entries)
 */
export async function deleteDeanSection(deanUid, sectionName) {
  if (!deanUid || !sectionName) {
    throw new Error('Dean UID and section name are required.');
  }

  // Get all entries in this section
  const entriesRef = deanSectionEntriesRef(deanUid, sectionName);
  const snapshot = await getDocs(entriesRef);

  // Delete all entries
  const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);

  // Delete the section document itself
  const sectionRef = doc(db, COLLECTIONS.USERS, deanUid, 'course_schedules', sectionName);
  await deleteDoc(sectionRef);
}

/**
 * Reset all schedules for a dean in a specific semester
 * Deletes all schedule entries that match the semester (for both regular and exam schedules)
 */
export async function resetDeanSchedulesForSemester(deanUid, semester) {
  if (!deanUid) {
    throw new Error('Dean UID is required.');
  }

  console.log(`[resetDeanSchedulesForSemester] Resetting schedules for dean ${deanUid}, semester ${semester}`);

  const userRef = doc(db, COLLECTIONS.USERS, deanUid);
  const schedulesColl = collection(userRef, 'course_schedules');
  
  // Get all sections for this dean
  const sectionsSnapshot = await getDocs(schedulesColl);
  
  let totalDeleted = 0;
  
  for (const sectionDoc of sectionsSnapshot.docs) {
    const sectionName = sectionDoc.id;
    const entriesRef = deanSectionEntriesRef(deanUid, sectionName);
    
    // Get all entries in this section
    const entriesSnapshot = await getDocs(entriesRef);
    
    // Filter entries by semester and delete them
    const deletePromises = [];
    entriesSnapshot.docs.forEach(entryDoc => {
      const entry = entryDoc.data();
      // Delete if:
      // 1. Entry has semester field and matches the selected semester
      // 2. Entry has no semester field (old entries - we'll delete them too for cleanup)
      const shouldDelete = 
        (entry.semester !== undefined && entry.semester !== null && Number(entry.semester) === Number(semester)) ||
        (entry.semester === undefined || entry.semester === null);
      
      if (shouldDelete) {
        console.log(`[resetDeanSchedulesForSemester] Deleting entry ${entryDoc.id} from ${sectionName}`);
        deletePromises.push(deleteDoc(entryDoc.ref));
        totalDeleted++;
      }
    });
    
    await Promise.all(deletePromises);
  }
  
  console.log(`[resetDeanSchedulesForSemester] Deleted ${totalDeleted} schedule entries`);
  return totalDeleted;
}

/**
 * Reset schedules for multiple deans in a specific semester
 */
export async function resetMultipleDeansSchedules(deanUids, semester) {
  if (!deanUids || deanUids.length === 0) {
    throw new Error('At least one dean must be selected.');
  }

  console.log(`[resetMultipleDeansSchedules] Resetting schedules for ${deanUids.length} deans, semester ${semester}`);

  let totalDeleted = 0;
  const results = [];

  for (const deanUid of deanUids) {
    try {
      const deleted = await resetDeanSchedulesForSemester(deanUid, semester);
      results.push({ deanUid, success: true, deleted });
      totalDeleted += deleted;
    } catch (error) {
      console.error(`[resetMultipleDeansSchedules] Error resetting dean ${deanUid}:`, error);
      results.push({ deanUid, success: false, error: error.message });
    }
  }

  return { totalDeleted, results };
}

/**
 * Subscribe to all plot entries for a specific room code
 * Used by RoomScheduleViewer to show room availability
 * 
 * NOTE: This currently only shows schedules from the CURRENT dean's sections.
 * For a full implementation across all deans, consider:
 * - Creating a separate room_schedules collection
 * - Using Cloud Functions to aggregate room schedules
 * - Or implementing a more complex multi-user query
 */
export function subscribePlotEntriesForRoom(roomCode, semester, scheduleMode, deanUid, onData, onError) {
  if (!roomCode || !deanUid) {
    onData([]);
    return () => {};
  }

  console.log('subscribePlotEntriesForRoom called with:', {
    roomCode,
    semester,
    scheduleMode,
    deanUid
  });

  // Query the current dean's schedules across all sections
  // This is a simplified version - in production you'd want to aggregate across all deans
  const userRef = doc(db, COLLECTIONS.USERS, deanUid);
  const schedulesColl = collection(userRef, 'course_schedules');

  // We need to query all sections for this dean to find entries with this room
  // Since we can't query subcollections directly, we'll need to aggregate in the client
  
  const unsubscribers = [];
  const sectionData = new Map(); // Track entries from each section

  // First, get all sections for this dean
  getDocs(schedulesColl).then(sectionsSnapshot => {
    console.log(`Found ${sectionsSnapshot.docs.length} sections for dean`);
    
    sectionsSnapshot.docs.forEach(sectionDoc => {
      const sectionName = sectionDoc.id;
      const entriesRef = collection(userRef, 'course_schedules', sectionName, 'entries');
      
      // Subscribe to entries in this section that match the room
      const q = query(
        entriesRef,
        where('roomCode', '==', roomCode),
        where('scheduleMode', '==', scheduleMode)
      );

      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const entries = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          console.log(`Section ${sectionName} has ${entries.length} entries for room ${roomCode}`);
          
          // Store entries from this section
          sectionData.set(sectionName, entries);
          
          // Aggregate all entries from all sections
          const allEntries = Array.from(sectionData.values()).flat();
          console.log(`Total entries for room ${roomCode}: ${allEntries.length}`);
          onData(allEntries);
        },
        (err) => {
          console.error(`Error subscribing to section ${sectionName}:`, err);
          if (onError) onError(err);
        }
      );
      
      unsubscribers.push(unsubscribe);
    });
  }).catch(err => {
    console.error('Error getting sections:', err);
    if (onError) onError(err);
  });

  // Return a function that unsubscribes from all sections
  return () => {
    console.log('Unsubscribing from all room schedule listeners');
    unsubscribers.forEach(unsub => unsub());
  };
}

/**
 * Subscribe to all plot entries for a specific teacher across all sections
 * Used for displaying teacher's personal schedule view
 * @param {string} teacherName - Full name of the teacher
 * @param {string} semester - Semester number ('1' or '2')
 * @param {function} onData - Callback with array of entries
 * @param {function} onError - Error callback
 * @returns {function} Unsubscribe function
 */
export function subscribePlotEntriesForTeacher(teacherInput, semester, onData, onError) {
  const teacherName = typeof teacherInput === 'object' ? (teacherInput?.name || teacherInput?.displayName || '') : String(teacherInput || '');
  const teacherEmail = typeof teacherInput === 'object' ? (teacherInput?.email || '') : '';
  const cleanName = teacherName.trim();
  const cleanEmail = teacherEmail.trim().toLowerCase();

  if (!cleanName && !cleanEmail) {
    console.warn('subscribePlotEntriesForTeacher: teacher name or email is required');
    onData([]);
    return () => {};
  }

  const entriesRef = collectionGroup(db, 'entries');

  return onSnapshot(
    entriesRef,
    (snapshot) => {
      let entries = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      entries = entries.filter((e) => {
        const inst = (e.instructor || '').trim().toLowerCase();
        if (!inst) return false;

        const matchesName = cleanName && (inst === cleanName.toLowerCase() || inst.includes(cleanName.toLowerCase()));
        const matchesEmail = cleanEmail && (inst === cleanEmail || inst.includes(cleanEmail.split('@')[0]));
        const isMatchedTeacher = matchesName || matchesEmail;

        if (!isMatchedTeacher) return false;

        const isRegular = !e.scheduleMode || e.scheduleMode === 'regular';
        const matchesSemester = !semester || !e.semester || String(e.semester) === String(semester);
        return isRegular && matchesSemester;
      });

      entries.sort((a, b) => {
        const dayA = a.day ?? 0;
        const dayB = b.day ?? 0;
        if (dayA !== dayB) return dayA - dayB;

        const hourA = a.startHour ?? 0;
        const hourB = b.startHour ?? 0;
        return hourA - hourB;
      });

      onData(entries);
    },
    (err) => {
      console.error('subscribePlotEntriesForTeacher error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to ALL course schedule entries for a specific room (from ALL deans)
 * Used in Room Details page to show the complete schedule for a room
 */
export function subscribeAllPlotEntriesForRoom(roomCode, semester, scheduleMode, onData, onError) {
  if (!roomCode) {
    console.warn('[subscribeAllPlotEntriesForRoom] No roomCode provided');
    onData([]);
    return () => {};
  }

  console.log('[subscribeAllPlotEntriesForRoom] Starting subscription:', {
    roomCode,
    semester,
    scheduleMode
  });

  // We need to query all users and their course_schedules
  // This is a complex query since course_schedules are nested under users
  
  const unsubscribers = [];
  const deanData = new Map(); // Track entries from each dean
  let isInitialized = false;
  
  // Get all users with role 'dean'
  const usersRef = collection(db, COLLECTIONS.USERS);
  const deansQuery = query(usersRef, where('role', '==', 'dean'));
  
  getDocs(deansQuery).then(deansSnapshot => {
    console.log(`[subscribeAllPlotEntriesForRoom] Found ${deansSnapshot.docs.length} deans to check for room ${roomCode}`);
    
    if (deansSnapshot.empty) {
      console.warn('[subscribeAllPlotEntriesForRoom] No deans found in database');
      onData([]);
      isInitialized = true;
      return;
    }
    
    let processedDeans = 0;
    
    deansSnapshot.docs.forEach(deanDoc => {
      const deanUid = deanDoc.id;
      const deanData_single = deanDoc.data();
      const deanName = deanData_single.name || 'Unknown';
      const college = deanData_single.college || deanData_single.department || 'Unknown';
      const userRef = doc(db, COLLECTIONS.USERS, deanUid);
      const schedulesColl = collection(userRef, 'course_schedules');
      
      console.log(`[subscribeAllPlotEntriesForRoom] Checking dean: ${deanName} (${college})`);
      
      // Get all sections for this dean
      getDocs(schedulesColl).then(sectionsSnapshot => {
        processedDeans++;
        
        if (sectionsSnapshot.empty) {
          console.log(`[subscribeAllPlotEntriesForRoom] No sections found for dean ${deanName}`);
          // If all deans processed and still no data, initialize with empty
          if (processedDeans === deansSnapshot.docs.length && !isInitialized) {
            console.log('[subscribeAllPlotEntriesForRoom] All deans processed, no schedules found');
            onData([]);
            isInitialized = true;
          }
          return;
        }
        
        console.log(`[subscribeAllPlotEntriesForRoom] Dean ${deanName} has ${sectionsSnapshot.docs.length} sections`);
        
        sectionsSnapshot.docs.forEach(sectionDoc => {
          const sectionName = sectionDoc.id;
          const entriesRef = collection(userRef, 'course_schedules', sectionName, 'entries');
          
          // Build query to match room, semester, and mode
          let q = query(
            entriesRef,
            where('roomCode', '==', roomCode)
          );
          
          // Add semester filter if provided
          if (semester !== undefined && semester !== null) {
            q = query(q, where('semester', '==', Number(semester)));
          }
          
          // Add scheduleMode filter only for specific modes
          if (scheduleMode) {
            q = query(q, where('scheduleMode', '==', scheduleMode));
          }
          
          console.log(`[subscribeAllPlotEntriesForRoom] Subscribing to ${deanName}/${sectionName}/entries with roomCode=${roomCode}, semester=${semester}, mode=${scheduleMode}`);
          
          const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              const entries = snapshot.docs.map(d => ({ 
                id: d.id, 
                ...d.data(),
                deanUid,
                deanName,
                college,
                sectionName 
              }));
              
              console.log(`[subscribeAllPlotEntriesForRoom] Dean ${deanName}/${sectionName} has ${entries.length} entries for room ${roomCode}`);
              
              // Store entries from this dean+section
              const key = `${deanUid}_${sectionName}`;
              deanData.set(key, entries);
              
              // Aggregate all entries from all deans and sections
              const allEntries = Array.from(deanData.values()).flat();
              console.log(`[subscribeAllPlotEntriesForRoom] Total aggregated entries: ${allEntries.length}`);
              onData(allEntries);
              isInitialized = true;
            },
            (err) => {
              console.error(`[subscribeAllPlotEntriesForRoom] Error subscribing to dean ${deanName} section ${sectionName}:`, err);
            }
          );
          
          unsubscribers.push(unsubscribe);
        });
      }).catch(err => {
        console.error(`[subscribeAllPlotEntriesForRoom] Error getting sections for dean ${deanName}:`, err);
        processedDeans++;
      });
    });
  }).catch(err => {
    console.error('[subscribeAllPlotEntriesForRoom] Error getting deans:', err);
    if (onError) onError(err);
  });

  // Return a function that unsubscribes from all listeners
  return () => {
    console.log('[subscribeAllPlotEntriesForRoom] Unsubscribing from all room schedule listeners');
    unsubscribers.forEach(unsub => unsub());
  };
}

/**
 * Check if a room reservation would conflict with existing course schedules
 * Returns true if there's a conflict, false if the time slot is available
 */
export async function checkReservationConflict(roomCode, dateStr, timeStart, timeEnd, semester) {
  if (!roomCode || !dateStr || !timeStart || !timeEnd) {
    return { hasConflict: false, conflicts: [] };
  }

  console.log('[checkReservationConflict] Checking:', {
    roomCode,
    dateStr,
    timeStart,
    timeEnd,
    semester
  });

  // Convert date string (DD/MM/YYYY or YYYY-MM-DD) to get day of week
  let date;
  if (dateStr.includes('/')) {
    // DD/MM/YYYY format
    const parts = dateStr.split('/');
    date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  } else {
    // YYYY-MM-DD format
    date = new Date(dateStr);
  }
  
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to 0 = Monday, 6 = Sunday
  
  console.log('[checkReservationConflict] Date:', dateStr, 'Day of week:', dayOfWeek, 'Day index:', dayIndex);

  // Convert time strings to hour numbers for comparison
  const timeToHour = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
  };

  const reservationStart = timeToHour(timeStart);
  const reservationEnd = timeToHour(timeEnd);

  console.log('[checkReservationConflict] Reservation time:', reservationStart, 'to', reservationEnd);

  // Get all deans
  const usersRef = collection(db, COLLECTIONS.USERS);
  const deansQuery = query(usersRef, where('role', '==', 'dean'));
  
  try {
    const deansSnapshot = await getDocs(deansQuery);
    console.log('[checkReservationConflict] Found', deansSnapshot.docs.length, 'deans');
    
    const conflicts = [];

    // Check each dean's schedules
    for (const deanDoc of deansSnapshot.docs) {
      const deanUid = deanDoc.id;
      const deanData = deanDoc.data();
      const deanName = deanData.name || 'Unknown';
      const college = deanData.college || deanData.department || 'Unknown';
      
      const userRef = doc(db, COLLECTIONS.USERS, deanUid);
      const schedulesColl = collection(userRef, 'course_schedules');
      
      // Get all sections for this dean
      const sectionsSnapshot = await getDocs(schedulesColl);
      
      for (const sectionDoc of sectionsSnapshot.docs) {
        const sectionName = sectionDoc.id;
        const entriesRef = collection(userRef, 'course_schedules', sectionName, 'entries');
        
        // Query for entries matching the room and day
        const entriesQuery = query(
          entriesRef,
          where('roomCode', '==', roomCode),
          where('day', '==', dayIndex),
          where('scheduleMode', '==', 'regular') // Only check regular schedules
        );
        
        const entriesSnapshot = await getDocs(entriesQuery);
        
        // Check each entry for time conflicts
        entriesSnapshot.docs.forEach(entryDoc => {
          const entry = entryDoc.data();
          const scheduleStart = entry.startHour || 0;
          const scheduleEnd = entry.endHour || 0;
          
          // Check if times overlap
          // Times overlap if: (start1 < end2) AND (start2 < end1)
          const hasOverlap = (reservationStart < scheduleEnd) && (scheduleStart < reservationEnd);
          
          if (hasOverlap) {
            conflicts.push({
              title: entry.title || entry.courseCode || 'Course',
              courseCode: entry.courseCode || '',
              instructor: entry.instructor || deanName,
              college,
              section: sectionName,
              timeStart: `${Math.floor(scheduleStart)}:${String(Math.round((scheduleStart % 1) * 60)).padStart(2, '0')}`,
              timeEnd: `${Math.floor(scheduleEnd)}:${String(Math.round((scheduleEnd % 1) * 60)).padStart(2, '0')}`,
              dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][dayIndex],
            });
          }
        });
      }
    }

    console.log('[checkReservationConflict] Found', conflicts.length, 'conflicts');
    
    return {
      hasConflict: conflicts.length > 0,
      conflicts
    };
  } catch (err) {
    console.error('[checkReservationConflict] Error:', err);
    return { hasConflict: false, conflicts: [], error: err.message };
  }
}
