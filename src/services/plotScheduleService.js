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
import { normalizeSchoolYearLabel } from '../utils/academicCalendarUtils';

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
        rawEntry: e,
        sourceDeanUid: e._sourceDeanUid || e.deanUid || null,
        sourceSection: e._sourceSection || e.section || e.sectionName || null,
        sourcePath: e._sourcePath || null,
        date: e.date,
        day: dayIndex >= 0 ? dayIndex : e.day,
        title: e.title || e.subject || 'Untitled',
        course: e.courseCode || e.course || '',
        courseCode: e.courseCode || e.course || '',
        instructor: getFirstName(e.instructor || ''), // Extract first name for card
        instructorFullName: e.instructor || '',
        start: e.startHour,
        end: e.endHour,
        startHour: e.startHour,
        endHour: e.endHour,
        type: e.type || 'Lecture',
        roomCode: e.roomCode || '',
        buildingName: e.buildingName || '',
        buildingId: e.buildingId || '',
        scheduleMode: e.scheduleMode || 'regular',
        section: e.section || e.sectionName || '',
        sectionName: e.section || e.sectionName || '',
        partnerSection: e.partnerSection || null,
        rotationCycle: e.rotationCycle || e.weekCycle || 'all',
        isCombinedSection: Boolean(e.isCombinedSection || (e.combinedSections && e.combinedSections.length > 1)),
        combinedSections: e.combinedSections || (e.section ? [e.section] : []),
        sectionCombinationMode: e.sectionCombinationMode || ((e.combinedSections && e.combinedSections.length > 1) ? 'merge' : 'none'),
        mergedSections: e.mergedSections || [],
        parallelSections: e.parallelSections || [],
        yearLevel: e.yearLevel || '',
        semester: e.semester || '',
        program: e.program || e.programCode || '',
        programCode: e.programCode || e.program || '',
        approvalStatus: e.approvalStatus || (e.approved === false ? 'pending' : 'approved'),
        usedNonBudgetedRoom: Boolean(e.usedNonBudgetedRoom),
        nonBudgetedRoomReason: e.nonBudgetedRoomReason || null,
      };
    })
    .filter((e) => e.day >= 0 && e.day <= 6); // Only include valid days (0-6)
  
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

function matchSchoolYear(entry, schoolYearId) {
  if (!schoolYearId) return true;
  const targetCanonical = normalizeSchoolYearLabel(schoolYearId);
  const cleanTargetSy = targetCanonical.replace(/[\s_-]+/g, '').toLowerCase();

  if (entry.schoolYearId) {
    const entryIdCanonical = normalizeSchoolYearLabel(entry.schoolYearId);
    if (entry.schoolYearId === schoolYearId || entryIdCanonical === targetCanonical) return true;
  }
  if (entry.schoolYear || entry.schoolYearLabel || entry.academicYear || entry.sy) {
    const raw = entry.schoolYear || entry.schoolYearLabel || entry.academicYear || entry.sy;
    const cleanEntrySy = normalizeSchoolYearLabel(raw).replace(/[\s_-]+/g, '').toLowerCase();
    return cleanEntrySy === cleanTargetSy || cleanTargetSy.includes(cleanEntrySy) || cleanEntrySy.includes(cleanTargetSy);
  }
  // Legacy entries without schoolYear field belong to original 2026-2027 school year
  return targetCanonical === '2026-2027' || schoolYearId.includes('2026') || schoolYearId === 'sy_2026-2027';
}

function matchSemesterHelper(entrySem, targetSem) {
  if (!targetSem || entrySem === undefined || entrySem === null) return true;
  const s1 = String(entrySem).toLowerCase().trim();
  const s2 = String(targetSem).toLowerCase().trim();
  if (s1 === s2) return true;
  const is1st = (s) => s === '1' || s.includes('1st') || s.includes('first');
  const is2nd = (s) => s === '2' || s.includes('2nd') || s.includes('second');
  const isSum = (s) => s === '3' || s.includes('summer') || s.includes('midyear');
  if (is1st(s1) && is1st(s2)) return true;
  if (is2nd(s1) && is2nd(s2)) return true;
  if (isSum(s1) && isSum(s2)) return true;
  return false;
}

/**
 * Subscribe to plot entries for a specific dean and section
 * Filtered strictly by schoolYearId, semester, and scheduleMode
 */
export function subscribePlotEntriesForDeanSection(
  deanUid,
  section,
  semester,
  scheduleMode,
  examPeriod,
  schoolYearIdOrOnData,
  onDataOrOnError,
  possibleOnError
) {
  if (!deanUid || !section) {
    if (typeof schoolYearIdOrOnData === 'function') schoolYearIdOrOnData([]);
    return () => {};
  }

  // Handle optional schoolYearId argument
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
    // Regular schedule
    q = query(
      deanSectionEntriesRef(deanUid, section),
      orderBy('createdAt', 'desc')
    );
  }

  return onSnapshot(
    q,
    (snap) => {
      const allEntries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      
      const filteredEntries = allEntries.filter((entry) => {
        // 1. Filter by school year
        if (!matchSchoolYear(entry, schoolYearId)) {
          return false;
        }

        // 2. Filter by regular / exam mode
        if (scheduleMode === 'regular') {
          const isRegularMode = !entry.scheduleMode || entry.scheduleMode === 'regular';
          if (!isRegularMode) return false;

          const hasSemester = entry.semester !== undefined && entry.semester !== null && entry.semester !== '';
          if (hasSemester) {
            return Number(entry.semester) === Number(semester);
          }
          return false;
        } else if (scheduleMode === 'exam') {
          const isExamMode = entry.scheduleMode === 'exam';
          if (!isExamMode) return false;

          if (Number(entry.semester) !== Number(semester)) return false;
          if (examPeriod && entry.examPeriod && entry.examPeriod !== examPeriod) return false;
          return true;
        }

        return true;
      });

      if (onData) onData(filteredEntries);
    },
    (err) => {
      console.error('Error in subscribePlotEntriesForDeanSection:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to all plot entries for a specific section across ALL deans / mother / service colleges
 */
export function subscribeAllPlotEntriesForSection(
  section,
  semester,
  scheduleMode = 'regular',
  examPeriod = null,
  schoolYearId = null,
  onData = null,
  onError = null
) {
  if (!section) {
    if (onData) onData([]);
    return () => {};
  }

  const targetSecNorm = String(section).trim().toUpperCase();
  const entriesRef = collectionGroup(db, 'entries');

  return onSnapshot(
    entriesRef,
    (snapshot) => {
      const allDocs = snapshot.docs.map((snapshotDoc) => {
        const sectionDoc = snapshotDoc.ref.parent.parent;
        const deanDoc = sectionDoc?.parent?.parent;
        return {
          id: snapshotDoc.id,
          ...snapshotDoc.data(),
          _sourceDeanUid: deanDoc?.id || null,
          _sourceSection: sectionDoc?.id || null,
          _sourcePath: snapshotDoc.ref.path,
        };
      });

      const filtered = allDocs.filter((e) => {
        // Section matching (or combined sections matching)
        const eSecNorm = String(e.section || e.sectionName || '').trim().toUpperCase();
        const comb = Array.isArray(e.combinedSections)
          ? e.combinedSections.map((s) => String(s).trim().toUpperCase())
          : [];
        const matchesSec = eSecNorm === targetSecNorm || comb.includes(targetSecNorm);
        if (!matchesSec) return false;

        // School year matching
        if (!matchSchoolYear(e, schoolYearId)) return false;

        // Semester matching
        if (!matchSemesterHelper(e.semester, semester)) return false;

        // Regular vs Exam mode
        if (scheduleMode === 'regular') {
          const isReg = !e.scheduleMode || e.scheduleMode === 'regular';
          if (!isReg) return false;
        } else if (scheduleMode === 'exam') {
          if (e.scheduleMode !== 'exam') return false;
          if (examPeriod && e.examPeriod && e.examPeriod !== examPeriod) return false;
        }

        return true;
      });

      if (onData) onData(filtered);
    },
    (err) => {
      console.error('Error in subscribeAllPlotEntriesForSection:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Add a plot entry for a specific dean and section
 */
export async function addPlotEntryForSection(deanUid, section, entry, customId = null) {
  const ref = customId
    ? doc(deanSectionEntriesRef(deanUid, section), customId)
    : doc(deanSectionEntriesRef(deanUid, section));
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
 * Fetches sections configured by Registrar in program_sections for the dean's college,
 * and merges with any existing course_schedules metadata (scheduleCount, modality).
 */
export function subscribeDeanSections(deanUid, onData, onError, deanCollegeCode, allowedProgramCodes = []) {
  if (!deanUid) {
    onData([]);
    return () => {};
  }

  const schedulesRef = collection(db, COLLECTIONS.USERS, deanUid, 'course_schedules');

  let unsubSchedules = () => {};
  const unsubsProgSections = [];

  let currentSchedulesDocs = [];
  let currentProgSectionsDocs = [];
  const progSectionDocsMap = new Map();

  const targetCollege = String(deanCollegeCode || '').trim().toUpperCase();
  const targetPrograms = Array.isArray(allowedProgramCodes)
    ? allowedProgramCodes.map((p) => String(p || '').trim().toUpperCase()).filter(Boolean)
    : [];

  const mergeAndEmit = async () => {
    try {
      const sectionMap = new Map();

      // 1. Process Registrar-created sections from program_sections
      for (const pDoc of currentProgSectionsDocs) {
        const pData = pDoc.data ? pDoc.data() : pDoc;
        const pCollege = String(pData.collegeCode || '').trim().toUpperCase();
        const pProgram = String(pData.programCode || '').trim().toUpperCase();

        // If specific college or program filters are provided, ensure section matches
        if (targetCollege || targetPrograms.length > 0) {
          const matchesProgram = targetPrograms.length > 0 && targetPrograms.includes(pProgram);
          const matchesCollegeExact = targetCollege && (pCollege === targetCollege || pProgram === targetCollege);
          const matchesCollegeFuzzy = targetCollege && (
            (pCollege && (pCollege.includes(targetCollege) || targetCollege.includes(pCollege))) ||
            (pProgram && (pProgram.includes(targetCollege) || targetCollege.includes(pProgram)))
          );

          if (!matchesProgram && !matchesCollegeExact && !matchesCollegeFuzzy) {
            continue;
          }
        }

        const sectionsList = Array.isArray(pData.sections) ? pData.sections : [];
        for (const secName of sectionsList) {
          if (!secName) continue;
          sectionMap.set(secName, {
            id: secName,
            name: secName,
            yearLevel: pData.yearLabel || '1st Year',
            yearNumber: pData.yearNumber || 1,
            programCode: pData.programCode || '',
            scheduleCount: 0,
            modality: 'regular',
          });
        }
      }

      // 2. Process Dean's course_schedules (override with actual count, modality, etc.)
      for (const sDoc of currentSchedulesDocs) {
        const sName = sDoc.id;
        const sData = sDoc.data ? sDoc.data() : sDoc;

        // Skip dummy/legacy entries where the section name is identical to the program code or college code
        const isProgramCode =
          targetPrograms.includes(sName.toUpperCase()) ||
          (targetCollege && sName.toUpperCase() === targetCollege) ||
          Array.from(progSectionDocsMap.values()).some((pDoc) => {
            const p = pDoc.data ? pDoc.data() : pDoc;
            return String(p.programCode || '').toUpperCase() === sName.toUpperCase();
          });

        if (isProgramCode) {
          continue;
        }

        let existing = sectionMap.get(sName);
        if (!existing) {
          existing = {
            id: sName,
            name: sName,
            yearLevel: sData.yearLevel || '1st Year',
            yearNumber: sData.yearNumber || 1,
            programCode: sData.programCode || '',
            scheduleCount: 0,
            modality: sData.modality || 'regular',
          };
          sectionMap.set(sName, existing);
        } else {
          existing.modality = sData.modality || existing.modality || 'regular';
          if (sData.yearLevel) existing.yearLevel = sData.yearLevel;
          if (sData.programCode) existing.programCode = sData.programCode;
        }
      }

      // 3. Populate scheduleCount for sections
      const sectionPromises = Array.from(sectionMap.values()).map(async (sec) => {
        try {
          const entriesRef = deanSectionEntriesRef(deanUid, sec.name);
          const entriesSnapshot = await getDocs(entriesRef);
          return {
            ...sec,
            scheduleCount: entriesSnapshot.size,
          };
        } catch {
          return sec;
        }
      });

      const sections = await Promise.all(sectionPromises);

      // 4. Sort by year number/level first, then by name
      sections.sort((a, b) => {
        const yearNumA = a.yearNumber || (a.yearLevel ? parseInt(a.yearLevel, 10) : 1) || 1;
        const yearNumB = b.yearNumber || (b.yearLevel ? parseInt(b.yearLevel, 10) : 1) || 1;
        if (yearNumA !== yearNumB) {
          return yearNumA - yearNumB;
        }
        return a.name.localeCompare(b.name);
      });

      onData(sections);
    } catch (err) {
      console.error('Error in mergeAndEmit sections:', err);
      if (onError) onError(err);
    }
  };

  // Subscribe to Dean's course_schedules
  unsubSchedules = onSnapshot(
    schedulesRef,
    (snap) => {
      currentSchedulesDocs = snap.docs;
      mergeAndEmit();
    },
    (err) => {
      console.error('Error in schedules snapshot:', err);
      if (onError) onError(err);
    }
  );

  const handleProgSectionsSnap = (snap) => {
    snap.docs.forEach((d) => {
      progSectionDocsMap.set(d.id, d);
    });
    currentProgSectionsDocs = Array.from(progSectionDocsMap.values());
    mergeAndEmit();
  };

  // Subscribe using scoped where() queries and general collection query
  if (targetPrograms.length > 0) {
    targetPrograms.forEach((pCode) => {
      const q = query(collection(db, 'program_sections'), where('programCode', '==', pCode));
      unsubsProgSections.push(
        onSnapshot(q, handleProgSectionsSnap, (err) =>
          console.warn(`Note: program_sections for ${pCode}:`, err?.message || err)
        )
      );
    });
  }

  if (targetCollege) {
    const qCollege = query(collection(db, 'program_sections'), where('collegeCode', '==', targetCollege));
    unsubsProgSections.push(
      onSnapshot(qCollege, handleProgSectionsSnap, (err) =>
        console.warn(`Note: program_sections for college ${targetCollege}:`, err?.message || err)
      )
    );
  }

  // Also listen to the root program_sections collection so any updates are captured
  unsubsProgSections.push(
    onSnapshot(
      collection(db, 'program_sections'),
      handleProgSectionsSnap,
      (err) => console.warn('Note: program_sections general subscription:', err?.message || err)
    )
  );

  return () => {
    unsubSchedules();
    unsubsProgSections.forEach((unsub) => unsub());
  };
}

/**
 * Create a new section for a dean
 */
export async function createDeanSection(deanUid, sectionName, yearLevel, modality = 'regular') {
  if (!deanUid || !sectionName) {
    throw new Error('Dean UID and section name are required.');
  }

  // Create the section document directly in course_schedules
  const sectionRef = doc(db, COLLECTIONS.USERS, deanUid, 'course_schedules', sectionName);
  
  await setDoc(sectionRef, {
    sectionName,
    yearLevel: yearLevel || '',
    modality: modality || 'regular',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return sectionName;
}

/**
 * Update a section's modality for a dean
 */
export async function updateDeanSectionModality(deanUid, sectionName, modality) {
  if (!deanUid || !sectionName) {
    throw new Error('Dean UID and section name are required.');
  }

  const sectionRef = doc(db, COLLECTIONS.USERS, deanUid, 'course_schedules', sectionName);
  await updateDoc(sectionRef, {
    modality: modality || 'regular',
    updatedAt: serverTimestamp(),
  });
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
export async function resetDeanSchedulesForSemester(deanUid, semester, schoolYearId = null) {
  if (!deanUid) {
    throw new Error('Dean UID is required.');
  }

  console.log(`[resetDeanSchedulesForSemester] Resetting schedules for dean ${deanUid}, semester ${semester}, schoolYear ${schoolYearId}`);

  let totalDeleted = 0;
  const deletedDocIds = new Set();
  const deletePromises = [];

  // Approach 1: Primary - Search all entries using collectionGroup('entries')
  try {
    const entriesSnapshot = await getDocs(collectionGroup(db, 'entries'));
    for (const entryDoc of entriesSnapshot.docs) {
      const path = entryDoc.ref.path;
      // Path format: users/{deanUid}/course_schedules/{section}/entries/{entryId}
      const pathParts = path.split('/');
      const isDeanEntry = pathParts[0] === COLLECTIONS.USERS && pathParts[1] === deanUid;

      if (isDeanEntry && !deletedDocIds.has(entryDoc.ref.path)) {
        const entry = entryDoc.data();
        
        // Filter by semester if semester is specified
        const matchSemester = 
          !semester || 
          entry.semester === undefined || 
          entry.semester === null || 
          String(entry.semester) === String(semester);

        // Filter by school year if school year is specified
        const matchSy = matchSchoolYear(entry, schoolYearId);

        if (matchSemester && matchSy) {
          deletedDocIds.add(entryDoc.ref.path);
          deletePromises.push(deleteDoc(entryDoc.ref));
          totalDeleted++;
        }
      }
    }
  } catch (groupError) {
    console.warn('[resetDeanSchedulesForSemester] collectionGroup query error, falling back to section iteration:', groupError);
  }

  // Approach 2: Secondary - Direct section iteration across course_schedules & program_sections
  try {
    const userRef = doc(db, COLLECTIONS.USERS, deanUid);
    const schedulesColl = collection(userRef, 'course_schedules');
    const sectionsSnapshot = await getDocs(schedulesColl);
    
    // Also fetch all program_sections from root collection
    const progSectionsSnapshot = await getDocs(collection(db, 'program_sections'));
    const allKnownSections = new Set(sectionsSnapshot.docs.map((d) => d.id));
    
    progSectionsSnapshot.docs.forEach((pDoc) => {
      const pData = pDoc.data();
      if (Array.isArray(pData.sections)) {
        pData.sections.forEach((s) => allKnownSections.add(s));
      }
    });

    for (const sectionName of allKnownSections) {
      if (!sectionName) continue;
      const entriesRef = deanSectionEntriesRef(deanUid, sectionName);
      try {
        const entriesSnap = await getDocs(entriesRef);
        for (const entryDoc of entriesSnap.docs) {
          if (!deletedDocIds.has(entryDoc.ref.path)) {
            const entry = entryDoc.data();
            const matchSemester = 
              !semester || 
              entry.semester === undefined || 
              entry.semester === null || 
              String(entry.semester) === String(semester);
            const matchSy = matchSchoolYear(entry, schoolYearId);

            if (matchSemester && matchSy) {
              deletedDocIds.add(entryDoc.ref.path);
              deletePromises.push(deleteDoc(entryDoc.ref));
              totalDeleted++;
            }
          }
        }
      } catch (secErr) {
        // Section subcollection might not exist, ignore
      }
    }
  } catch (iterErr) {
    console.warn('[resetDeanSchedulesForSemester] section iteration note:', iterErr);
  }

  await Promise.all(deletePromises);
  console.log(`[resetDeanSchedulesForSemester] Deleted ${totalDeleted} schedule entries for dean ${deanUid}`);
  return totalDeleted;
}

/**
 * Reset schedules for multiple deans in a specific semester
 */
export async function resetMultipleDeansSchedules(deanUids, semester, schoolYearId = null) {
  if (!deanUids || deanUids.length === 0) {
    throw new Error('At least one dean must be selected.');
  }

  console.log(`[resetMultipleDeansSchedules] Resetting schedules for ${deanUids.length} deans, semester ${semester}, schoolYear ${schoolYearId}`);

  let totalDeleted = 0;
  const results = [];

  for (const deanUid of deanUids) {
    try {
      const deleted = await resetDeanSchedulesForSemester(deanUid, semester, schoolYearId);
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
/**
 * Subscribe to all plot entries for a specific room across all deans and sections
 * Used by RoomScheduleViewer to show real-time room occupancy and prevent conflicts
 */
export function subscribePlotEntriesForRoom(
  roomCode,
  semester,
  scheduleMode,
  deanUid,
  schoolYearIdOrOnData,
  onDataOrOnError,
  possibleOnError
) {
  if (!roomCode) {
    if (typeof schoolYearIdOrOnData === 'function') schoolYearIdOrOnData([]);
    return () => {};
  }

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

  const normalizeRoom = (str) => String(str || '').replace(/[\s\-_]/g, '').toUpperCase();
  const targetRoomNorm = normalizeRoom(roomCode);

  if (!targetRoomNorm) {
    if (onData) onData([]);
    return () => {};
  }

  const entriesRef = collectionGroup(db, 'entries');

  return onSnapshot(
    entriesRef,
    (snapshot) => {
      const allDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const matchingEntries = allDocs.filter((e) => {
        // Match school year
        if (!matchSchoolYear(e, schoolYearId)) {
          return false;
        }

        // Match room code / name (normalized to ignore spacing and dashes, e.g. "MB - 101" vs "MB-101")
        const eRoomNorm = normalizeRoom(e.roomCode || e.room || e.roomId || e.roomName || '');
        if (eRoomNorm !== targetRoomNorm) {
          return false;
        }

        // Match semester if specified
        if (!matchSemesterHelper(e.semester, semester)) {
          return false;
        }

        // Match scheduleMode if specified
        if (scheduleMode) {
          const entryMode = e.scheduleMode || 'regular';
          if (entryMode !== scheduleMode) {
            return false;
          }
        }

        return true;
      });

      // Sort by day and startHour
      matchingEntries.sort((a, b) => {
        const dayA = a.day ?? 0;
        const dayB = b.day ?? 0;
        if (dayA !== dayB) return dayA - dayB;
        return (a.startHour ?? 0) - (b.startHour ?? 0);
      });

      if (onData) onData(matchingEntries);
    },
    (err) => {
      console.error(`subscribePlotEntriesForRoom error for room ${roomCode}:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to all plot entries for BOTH a specific room, section, and teacher
 * Returns { roomEntries: [...], sectionEntries: [...], teacherEntries: [...] }
 * Used by RoomScheduleViewer to prevent room occupancy conflicts, section double-booking, and teacher schedule conflicts
 */
export function subscribePlotEntriesForRoomAndSection(
  roomCode,
  sectionName,
  semester,
  scheduleMode,
  deanUid,
  schoolYearIdOrOnData,
  onDataOrOnError,
  possibleOnError,
  teacherInput = null
) {
  let schoolYearId = null;
  let onData = null;
  let onError = null;
  let teacher = teacherInput;

  if (typeof schoolYearIdOrOnData === 'function') {
    onData = schoolYearIdOrOnData;
    onError = onDataOrOnError;
    if (typeof onDataOrOnError === 'object' && typeof onDataOrOnError !== 'function') {
      teacher = onDataOrOnError;
    } else if (typeof possibleOnError === 'object') {
      teacher = possibleOnError;
    }
  } else {
    schoolYearId = schoolYearIdOrOnData;
    onData = onDataOrOnError;
    onError = possibleOnError;
  }

  const normalizeRoom = (str) => String(str || '').replace(/[\s\-_]/g, '').toUpperCase();
  const targetRoomNorm = normalizeRoom(roomCode);
  const targetSecNorm = String(sectionName || '').trim().toUpperCase();

  const entriesRef = collectionGroup(db, 'entries');

  return onSnapshot(
    entriesRef,
    (snapshot) => {
      const allDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Filter by school year, semester, and scheduleMode
      const relevantDocs = allDocs.filter((e) => {
        if (!matchSchoolYear(e, schoolYearId)) {
          return false;
        }
        if (!matchSemesterHelper(e.semester, semester)) {
          return false;
        }
        if (scheduleMode) {
          const entryMode = e.scheduleMode || 'regular';
          if (entryMode !== scheduleMode) {
            return false;
          }
        }
        return true;
      });

      // 1. Room matching entries
      const roomEntries = targetRoomNorm
        ? relevantDocs.filter((e) => {
            const eRoomNorm = normalizeRoom(e.roomCode || e.room || e.roomId || e.roomName || '');
            return eRoomNorm === targetRoomNorm;
          })
        : [];

      // 2. Section matching entries
      const sectionEntries = targetSecNorm
        ? relevantDocs.filter((e) => {
            const eSecNorm = String(e.section || e.sectionName || '').trim().toUpperCase();
            return eSecNorm === targetSecNorm;
          })
        : [];

      // 3. Teacher matching entries (only if specific teacher is provided and not TBA)
      const cleanTeacherName = typeof teacher === 'object' ? (teacher?.name || teacher?.displayName || '') : String(teacher || '');
      const cleanTeacherEmail = typeof teacher === 'object' ? (teacher?.email || '') : '';
      const isTba = !cleanTeacherName || cleanTeacherName.toLowerCase().includes('tba') || cleanTeacherName.toLowerCase().includes('to be assigned');

      const teacherEntries = (!isTba && (cleanTeacherName || cleanTeacherEmail))
        ? relevantDocs.filter((e) => {
            const inst = (e.instructor || '').trim().toLowerCase();
            const instEmail = (e.instructorEmail || '').trim().toLowerCase();
            if (!inst || inst.includes('tba') || inst.includes('to be assigned')) return false;

            const matchesName = cleanTeacherName && (
              inst === cleanTeacherName.toLowerCase() ||
              inst.includes(cleanTeacherName.toLowerCase()) ||
              cleanTeacherName.toLowerCase().includes(inst)
            );
            const matchesEmail = cleanTeacherEmail && (
              instEmail === cleanTeacherEmail.toLowerCase() ||
              inst.includes(cleanTeacherEmail.toLowerCase())
            );
            return matchesName || matchesEmail;
          })
        : [];

      // Sort by day and startHour
      const sortFn = (a, b) => {
        const dayA = a.day ?? 0;
        const dayB = b.day ?? 0;
        if (dayA !== dayB) return dayA - dayB;
        return (a.startHour ?? 0) - (b.startHour ?? 0);
      };

      roomEntries.sort(sortFn);
      sectionEntries.sort(sortFn);
      teacherEntries.sort(sortFn);

      if (onData) onData({ roomEntries, sectionEntries, teacherEntries });
    },
    (err) => {
      console.error(`subscribePlotEntriesForRoomAndSection error:`, err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to all plot entries for a specific teacher across all sections
 * Used for displaying teacher's personal schedule view
 */
export function subscribePlotEntriesForTeacher(
  teacherInput,
  semester,
  schoolYearIdOrOnData,
  onDataOrOnError,
  possibleOnError
) {
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

  const teacherName = typeof teacherInput === 'object' ? (teacherInput?.name || teacherInput?.displayName || '') : String(teacherInput || '');
  const teacherEmail = typeof teacherInput === 'object' ? (teacherInput?.email || '') : '';
  const cleanName = teacherName.trim();
  const cleanEmail = teacherEmail.trim().toLowerCase();

  if (!cleanName && !cleanEmail) {
    console.warn('subscribePlotEntriesForTeacher: teacher name or email is required');
    if (onData) onData([]);
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
        // Match school year
        if (!matchSchoolYear(e, schoolYearId)) {
          return false;
        }

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
 * Subscribe to ALL plot entries across all sections and deans in the current semester
 * Used by AddPlotEntryModalEnhanced to evaluate teacher availability and conflicts
 */
export function subscribeAllSemesterPlotEntries(
  semester,
  scheduleMode = 'regular',
  schoolYearId = null,
  onData,
  onError
) {
  const entriesRef = collectionGroup(db, 'entries');

  return onSnapshot(
    entriesRef,
    (snapshot) => {
      const allDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const relevantDocs = allDocs.filter((e) => {
        if (!matchSchoolYear(e, schoolYearId)) return false;
        if (!matchSemesterHelper(e.semester, semester)) return false;
        if (scheduleMode) {
          const entryMode = e.scheduleMode || 'regular';
          if (entryMode !== scheduleMode) return false;
        }
        return true;
      });

      if (onData) onData(relevantDocs);
    },
    (err) => {
      console.error('subscribeAllSemesterPlotEntries error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribe to ALL course schedule entries for a specific room (from ALL deans and sections)
 * Used in Room Details page to show the complete schedule for a room
 */
export function subscribeAllPlotEntriesForRoom(
  roomCode,
  semester,
  scheduleMode,
  schoolYearIdOrOnData,
  onDataOrOnError,
  possibleOnError
) {
  if (!roomCode) {
    if (typeof schoolYearIdOrOnData === 'function') schoolYearIdOrOnData([]);
    return () => {};
  }

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

  const normalizeRoom = (str) => String(str || '').replace(/[\s\-_]/g, '').toUpperCase();
  const targetRoomNorm = normalizeRoom(roomCode);

  if (!targetRoomNorm) {
    if (onData) onData([]);
    return () => {};
  }

  const entriesRef = collectionGroup(db, 'entries');

  return onSnapshot(
    entriesRef,
    (snapshot) => {
      const allDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const matchingEntries = allDocs.filter((entry) => {
        // Match school year
        if (!matchSchoolYear(entry, schoolYearId)) {
          return false;
        }

        // Match room code / name / ID (normalized to ignore spacing, dashes, underscores)
        const eRoomNorm = normalizeRoom(entry.roomCode || entry.room || entry.roomId || entry.roomName || '');
        if (eRoomNorm !== targetRoomNorm) {
          return false;
        }

        // Match semester if specified
        if (semester && entry.semester !== undefined && entry.semester !== null) {
          const eSem = String(entry.semester).toLowerCase().trim();
          const targetSem = String(semester).toLowerCase().trim();
          const matchesSem =
            eSem === targetSem ||
            (targetSem === '1' && (eSem.includes('1st') || eSem.includes('first') || eSem === '1')) ||
            (targetSem === '2' && (eSem.includes('2nd') || eSem.includes('second') || eSem === '2')) ||
            ((targetSem === '3' || targetSem.includes('summer')) && eSem.includes('summer'));

          if (!matchesSem) return false;
        }

        // Match scheduleMode if specified
        if (scheduleMode) {
          const entryMode = entry.scheduleMode || 'regular';
          if (entryMode !== scheduleMode) {
            return false;
          }
        }

        return true;
      });

      if (onData) onData(matchingEntries);
    },
    (err) => {
      console.error(`[subscribeAllPlotEntriesForRoom] Error for room ${roomCode}:`, err);
      if (onError) onError(err);
    }
  );
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

/**
 * Fetch all plot entries for multiple rooms (for bulk printing)
 * Returns Map/Object: { [roomCode]: Array<entry> }
 */
export async function fetchPlotEntriesForMultipleRooms(roomCodes = [], semester, scheduleMode = 'regular') {
  if (!roomCodes || roomCodes.length === 0) return {};

  const normalizeRoom = (str) => String(str || '').replace(/[\s\-_]/g, '').toUpperCase();

  // Create dictionary for results keyed by each requested room code
  const schedulesByRoom = {};
  const normMap = new Map();
  roomCodes.forEach((rc) => {
    schedulesByRoom[rc] = [];
    normMap.set(normalizeRoom(rc), rc);
  });

  try {
    const entriesRef = collectionGroup(db, 'entries');
    const snapshot = await getDocs(entriesRef);
    const allEntries = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    allEntries.forEach((entry) => {
      const eRoomNorm = normalizeRoom(entry.roomCode || entry.room || entry.roomId || entry.roomName || '');
      if (!eRoomNorm) return;

      const matchedKey = normMap.get(eRoomNorm);
      if (!matchedKey) return;

      // Semester filtering
      if (semester) {
        const eSem = String(entry.semester || '1').toLowerCase().trim();
        const targetSem = String(semester).toLowerCase().trim();
        const matchesSem =
          eSem === targetSem ||
          (targetSem === '1' && (eSem.includes('1st') || eSem.includes('first') || eSem === '1')) ||
          (targetSem === '2' && (eSem.includes('2nd') || eSem.includes('second') || eSem === '2')) ||
          ((targetSem === '3' || targetSem.includes('summer')) && eSem.includes('summer'));
        if (!matchesSem) return;
      }

      // ScheduleMode filtering
      if (scheduleMode) {
        const entryMode = entry.scheduleMode || 'regular';
        if (entryMode !== scheduleMode) return;
      }

      if (!schedulesByRoom[matchedKey]) {
        schedulesByRoom[matchedKey] = [];
      }
      schedulesByRoom[matchedKey].push(entry);
    });

    console.log('[fetchPlotEntriesForMultipleRooms] Fetched schedules for rooms:', schedulesByRoom);
    return schedulesByRoom;
  } catch (error) {
    console.error('Error fetching plot entries for multiple rooms:', error);
    return schedulesByRoom;
  }
}
