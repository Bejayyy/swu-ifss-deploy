import {
  collection,
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
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import { EMPTY_EXAM_PERIODS, normalizeSchoolYearLabel } from '../utils/academicCalendarUtils';
import { resetMultipleDeansSchedules } from './plotScheduleService';

function schoolYearRef(id) {
  return doc(db, COLLECTIONS.ACADEMIC_CALENDARS, id);
}

function holidaysRef(schoolYearId) {
  return collection(db, COLLECTIONS.ACADEMIC_CALENDARS, schoolYearId, COLLECTIONS.HOLIDAYS);
}

function noClassRef(schoolYearId) {
  return collection(db, COLLECTIONS.ACADEMIC_CALENDARS, schoolYearId, COLLECTIONS.NO_CLASS_PERIODS);
}

export function buildSchoolYearId(label) {
  const canonical = normalizeSchoolYearLabel(label);
  return `sy_${canonical.replace(/[^\w-]/g, '_').toLowerCase()}`;
}

/**
 * Finds an existing school year in Firestore matching a target label (e.g. "2026-2027", "AY 2026-2027", or "SY 2026-2027")
 */
export async function findExistingSchoolYearByLabel(label) {
  if (!label) return null;
  const targetCanonical = normalizeSchoolYearLabel(label);
  const targetClean = targetCanonical.replace(/[\s_-]+/g, '').toLowerCase();

  try {
    const snap = await getDocs(collection(db, COLLECTIONS.ACADEMIC_CALENDARS));
    for (const docSnap of snap.docs) {
      if (docSnap.id === 'school_calendar_pdf' || docSnap.id.includes('_pdf')) continue;
      const data = docSnap.data() || {};
      const raw = data.label || data.displayLabel || docSnap.id;
      const docCanonical = normalizeSchoolYearLabel(raw);
      const docClean = docCanonical.replace(/[\s_-]+/g, '').toLowerCase();

      if (
        docClean === targetClean ||
        docSnap.id.toLowerCase() === `sy_${targetCanonical.toLowerCase()}` ||
        docSnap.id.toLowerCase() === `sy_${targetClean}` ||
        docSnap.id.toLowerCase() === `sy_${targetCanonical.replace('-', '_').toLowerCase()}`
      ) {
        return { id: docSnap.id, canonicalLabel: docCanonical, ...data };
      }
    }
  } catch (err) {
    console.error('Error finding school year by label:', err);
  }
  return null;
}

/**
 * Fetches summary of existing calendar data for a school year
 */
export async function getSchoolYearDataSummary(schoolYearId) {
  if (!schoolYearId) return { exists: false, eventCount: 0, hasSemesters: false };
  try {
    const syDoc = await getDoc(schoolYearRef(schoolYearId));
    if (!syDoc.exists()) return { exists: false, eventCount: 0, hasSemesters: false };
    const eventsSnap = await getDocs(calendarEventsRef(schoolYearId));
    const data = syDoc.data();
    const hasSemesters = Array.isArray(data.semesters) && data.semesters.some((s) => s.start || s.end);
    const canonical = normalizeSchoolYearLabel(data.label || data.displayLabel || schoolYearId);
    return {
      exists: true,
      label: canonical,
      displayLabel: `SY ${canonical}`,
      eventCount: eventsSnap.size,
      hasSemesters,
    };
  } catch (err) {
    console.error('Error fetching SY summary:', err);
    return { exists: false, eventCount: 0, hasSemesters: false };
  }
}

export function subscribeSchoolYears(onData, onError) {
  const colRef = collection(db, COLLECTIONS.ACADEMIC_CALENDARS);
  return onSnapshot(
    colRef,
    (snap) => {
      const rawList = snap.docs
        .filter((d) => d.id !== 'school_calendar_pdf' && !d.id.includes('_pdf'))
        .map((d) => {
          const data = d.data() || {};
          const rawLabel = data.label || data.displayLabel || data.name || d.id.replace(/^sy_/i, '').replace(/_/g, '-');
          const canonicalLabel = normalizeSchoolYearLabel(rawLabel);
          return {
            ...data,
            id: d.id,
            label: canonicalLabel,
            displayLabel: `SY ${canonicalLabel}`,
          };
        });

      // Deduplicate school years by canonical label (e.g. merge "SY 2026-2027" and "SY AY 2026-2027")
      const mapByCanonical = new Map();
      rawList.forEach((sy) => {
        const key = sy.label;
        if (!mapByCanonical.has(key)) {
          mapByCanonical.set(key, sy);
        } else {
          // If duplicate exists, prefer standard canonical ID or the one with configured semesters
          const existing = mapByCanonical.get(key);
          const hasSemesters = Array.isArray(sy.semesters) && sy.semesters.some((s) => s.start || s.end);
          const existingHasSemesters = Array.isArray(existing.semesters) && existing.semesters.some((s) => s.start || s.end);

          if (!existingHasSemesters && hasSemesters) {
            mapByCanonical.set(key, sy);
          } else if (sy.id === `sy_${key}` || sy.id === `sy_${key.replace('-', '_')}`) {
            mapByCanonical.set(key, sy);
          }
        }
      });

      const list = Array.from(mapByCanonical.values());

      // Sort chronologically (e.g. 2026-2027 before 2027-2028)
      list.sort((a, b) => {
        const getYearNum = (str) => {
          const m = String(str).match(/(\d{4})/);
          return m ? parseInt(m[1], 10) : 0;
        };
        const yearA = getYearNum(a.label || a.id);
        const yearB = getYearNum(b.label || b.id);
        if (yearA && yearB && yearA !== yearB) return yearA - yearB;
        return (a.label || a.id).localeCompare(b.label || b.id);
      });

      // Only auto-seed default SY 2026-2027 if the entire collection is completely empty (first installation)
      if (rawList.length === 0) {
        saveSchoolYearConfig('sy_2026-2027', {
          label: '2026-2027',
          semester1Start: '2026-07-06',
          semester1End: '2026-11-07',
          semester2Start: '2026-11-16',
          semester2End: '2027-04-10',
          semesters: [
            { id: 'sem_1', name: 'Semester 1', start: '2026-07-06', end: '2026-11-07' },
            { id: 'sem_2', name: 'Semester 2', start: '2026-11-16', end: '2027-04-10' },
          ],
        }).catch((err) => console.error('Error initializing default SY 2026-2027 on empty database:', err));
      }

      onData(list);
    },
    onError,
  );
}

export function subscribeCalendarBundle(schoolYearId, onData, onError) {
  if (!schoolYearId) {
    onData({ config: null, holidays: [], noClassPeriods: [] });
    return () => {};
  }

  let config = null;
  let holidays = [];
  let noClassPeriods = [];
  let events = [];

  const emit = () => onData({ config, holidays, noClassPeriods, events });

  const unsubConfig = onSnapshot(
    schoolYearRef(schoolYearId),
    (snap) => {
      config = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      emit();
    },
    onError,
  );

  const unsubHolidays = onSnapshot(
    query(holidaysRef(schoolYearId), orderBy('date')),
    (snap) => {
      holidays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit();
    },
    onError,
  );

  const unsubNoClass = onSnapshot(
    query(noClassRef(schoolYearId), orderBy('start')),
    (snap) => {
      noClassPeriods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit();
    },
    onError,
  );

  const unsubEvents = onSnapshot(
    query(calendarEventsRef(schoolYearId), orderBy('startDate')),
    (snap) => {
      events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      emit();
    },
    onError,
  );

  return () => {
    unsubConfig();
    unsubHolidays();
    unsubNoClass();
    unsubEvents();
  };
}

export async function saveSchoolYearConfig(schoolYearId, {
  label,
  semester1Start,
  semester1End,
  semester2Start,
  semester2End,
  semesters,
}) {
  const canonical = normalizeSchoolYearLabel(label || schoolYearId);
  const displayLabel = `SY ${canonical}`;

  let targetId = schoolYearId;
  if (!targetId || targetId.includes('_ay_') || !targetId.startsWith('sy_')) {
    const existing = await findExistingSchoolYearByLabel(canonical);
    targetId = existing ? existing.id : buildSchoolYearId(canonical);
  }
  
  // Normalize semesters array
  const formattedSemesters = Array.isArray(semesters)
    ? semesters.map((s, idx) => ({
        id: s.id || `sem_${idx + 1}`,
        name: (s.name || '').trim() || (idx === 2 ? 'Summer' : `Semester ${idx + 1}`),
        start: s.start || '',
        end: s.end || '',
      }))
    : [];

  const sem1Start = formattedSemesters[0]?.start ?? semester1Start ?? '';
  const sem1End = formattedSemesters[0]?.end ?? semester1End ?? '';
  const sem2Start = formattedSemesters[1]?.start ?? semester2Start ?? '';
  const sem2End = formattedSemesters[1]?.end ?? semester2End ?? '';

  await setDoc(
    schoolYearRef(targetId),
    {
      label: canonical,
      displayLabel,
      semester1Start: sem1Start,
      semester1End: sem1End,
      semester2Start: sem2Start,
      semester2End: sem2End,
      semesters: formattedSemesters,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  const snap = await getDoc(schoolYearRef(targetId));
  if (!snap.data()?.examPeriods) {
    await updateDoc(schoolYearRef(targetId), { examPeriods: EMPTY_EXAM_PERIODS });
  }

  return targetId;
}

/**
 * Helper to execute Firestore batch deletes in chunks of 400 with fallback to individual deleteDoc
 */
async function executeBatchDeletes(docRefs) {
  if (!docRefs || !docRefs.length) return;
  console.log(`[deleteSchoolYear] Starting deletion of ${docRefs.length} documents...`);
  const CHUNK_SIZE = 400;
  for (let i = 0; i < docRefs.length; i += CHUNK_SIZE) {
    const chunk = docRefs.slice(i, i + CHUNK_SIZE);
    try {
      const batch = writeBatch(db);
      chunk.forEach((ref) => {
        batch.delete(ref);
      });
      await batch.commit();
    } catch (batchErr) {
      console.warn('[deleteSchoolYear] Batch commit failed, executing fallback individual deleteDoc:', batchErr);
      for (const ref of chunk) {
        try {
          await deleteDoc(ref);
        } catch (singleErr) {
          console.warn(`[deleteSchoolYear] Failed individual delete on ${ref.path}:`, singleErr);
        }
      }
    }
  }
  console.log(`[deleteSchoolYear] Finished deleting ${docRefs.length} documents.`);
}

/**
 * Permanently delete a school year and cascadingly wipe ALL associated data:
 * - Subcollections (events, holidays, no-class periods)
 * - Schedule access control documents
 * - Course schedules & plotted class entries across all deans, sections, and subcollections
 * - Plot requests & plot entries
 * - Schedule control sessions
 * - Room reservations associated with this school year or date range
 * - Maintenance schedules & issue reports associated with this school year or date range
 * - No-class days associated with this school year or date range
 * - Parent school year document and any unnormalized alias documents
 */
export async function deleteSchoolYear(schoolYearId) {
  if (!schoolYearId || schoolYearId === 'school_calendar_pdf') return;

  // 1. Fetch target school year metadata to obtain labels and semester date boundaries
  let cleanLabel = '';
  let semStart = null;
  let semEnd = null;

  try {
    const syDoc = await getDoc(schoolYearRef(schoolYearId));
    if (syDoc.exists()) {
      const syData = syDoc.data() || {};
      const rawLabel = syData.label || syData.displayLabel || schoolYearId.replace(/^sy_/i, '').replace(/_/g, '-');
      cleanLabel = normalizeSchoolYearLabel(rawLabel);
      semStart = syData.semesters?.[0]?.start || syData.semester1Start || null;
      semEnd = syData.semesters?.[syData.semesters?.length - 1]?.end || syData.semester2End || null;
    }
  } catch (err) {
    console.warn('Notice when fetching school year info for cascading deletion:', err);
  }

  if (!cleanLabel) {
    cleanLabel = normalizeSchoolYearLabel(schoolYearId);
  }

  const canonicalLabel = cleanLabel;
  const cleanTargetSy = canonicalLabel.replace(/[\s_-]+/g, '').toLowerCase();

  const isMatchingSchoolYear = (data, defaultDate = null) => {
    if (!data) return false;
    
    // Direct schoolYearId match
    if (data.schoolYearId) {
      const idCanonical = normalizeSchoolYearLabel(data.schoolYearId);
      if (
        data.schoolYearId === schoolYearId ||
        idCanonical === canonicalLabel ||
        String(data.schoolYearId).toLowerCase().includes(cleanTargetSy)
      ) {
        return true;
      }
    }

    // Explicit school year fields
    const rawDataSy = data.schoolYear || data.schoolYearLabel || data.academicYear || data.sy || data.school_year;
    if (rawDataSy) {
      const entryCanonical = normalizeSchoolYearLabel(rawDataSy);
      if (
        entryCanonical === canonicalLabel ||
        String(rawDataSy).toLowerCase().replace(/[\s_-]+/g, '').includes(cleanTargetSy)
      ) {
        return true;
      }
    }

    // Date boundary match if dates are configured
    const dateToCheck = defaultDate || data.dateOfActivity || data.date || data.startDate || data.activityDate || data.start;
    if (dateToCheck && semStart && semEnd) {
      if (dateToCheck >= semStart && dateToCheck <= semEnd) return true;
    }

    // If target is canonical 2026-2027 and doc has NO schoolYear field, it is a default 2026-2027 item!
    if (canonicalLabel === '2026-2027') {
      if (!rawDataSy && !data.schoolYearId) {
        return true;
      }
    }

    return false;
  };

  const docRefsToDelete = [];

  // A. Academic Calendar Subcollections (events, holidays, no_class_periods)
  try {
    const eventsSnap = await getDocs(calendarEventsRef(schoolYearId));
    eventsSnap.forEach((d) => docRefsToDelete.push(d.ref));

    const holidaysSnap = await getDocs(holidaysRef(schoolYearId));
    holidaysSnap.forEach((d) => docRefsToDelete.push(d.ref));

    const noClassSnap = await getDocs(noClassRef(schoolYearId));
    noClassSnap.forEach((d) => docRefsToDelete.push(d.ref));
  } catch (e) {
    console.warn('Error reading academic_calendars subcollections:', e);
  }

  // B. Schedule Access Control
  for (let sem = 1; sem <= 4; sem++) {
    docRefsToDelete.push(doc(db, 'schedule_access_control', `${schoolYearId}_sem${sem}`));
    docRefsToDelete.push(doc(db, 'schedule_access_control', `sy_${canonicalLabel}_sem${sem}`));
    docRefsToDelete.push(doc(db, 'schedule_access_control', `${canonicalLabel}_sem${sem}`));
  }
  try {
    const accessSnap = await getDocs(collection(db, 'schedule_access_control'));
    accessSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data())) docRefsToDelete.push(d.ref);
    });
  } catch (e) {}

  // C. Course Schedules & Plotted Entries across ALL deans, program sections, and collection groups
  try {
    // 1. Collect all known deans and user identifiers
    const allDeanUids = new Set();
    const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
    usersSnap.forEach((uDoc) => {
      allDeanUids.add(uDoc.id);
      const uData = uDoc.data() || {};
      if (uData.email) allDeanUids.add(uData.email);
      if (uData.uid) allDeanUids.add(uData.uid);
    });

    const collegesSnap = await getDocs(collection(db, COLLECTIONS.COLLEGES));
    collegesSnap.forEach((cDoc) => {
      const cData = cDoc.data() || {};
      if (cData.deanUid) allDeanUids.add(cData.deanUid);
      if (cData.deanEmail) allDeanUids.add(cData.deanEmail);
    });

    // 2. Invoke the Course Scheduling Reset Engine across all deans
    const deanList = Array.from(allDeanUids);
    if (deanList.length > 0) {
      try {
        await resetMultipleDeansSchedules(deanList, null, schoolYearId);
        await resetMultipleDeansSchedules(deanList, null, canonicalLabel);
      } catch (resetErr) {
        console.warn('[deleteSchoolYear] resetMultipleDeansSchedules warning:', resetErr);
      }
    }

    // 3. Collect all known section names from program_sections & colleges
    const allSectionNames = new Set(['exam-schedule']);
    const progSectionsSnap = await getDocs(collection(db, 'program_sections'));
    progSectionsSnap.forEach((psDoc) => {
      const psData = psDoc.data() || {};
      (psData.sections || []).forEach((s) => s && allSectionNames.add(s));
      if (psData.sectionName) allSectionNames.add(psData.sectionName);
      if (psData.name) allSectionNames.add(psData.name);
      if (psDoc.id) allSectionNames.add(psDoc.id);
    });

    // 4. Direct Dean x Section Traversal (Bypasses Firestore virtual parent doc limitations)
    for (const deanUid of allDeanUids) {
      // Check physical section documents under course_schedules if any
      try {
        const schedColSnap = await getDocs(collection(db, COLLECTIONS.USERS, deanUid, 'course_schedules'));
        schedColSnap.forEach((sDoc) => {
          if (sDoc.id) allSectionNames.add(sDoc.id);
        });
      } catch (e) {}

      // Query entries subcollection for each known section
      for (const sectionName of allSectionNames) {
        try {
          const secEntriesSnap = await getDocs(
            collection(db, COLLECTIONS.USERS, deanUid, 'course_schedules', sectionName, 'entries')
          );
          secEntriesSnap.forEach((eDoc) => {
            if (isMatchingSchoolYear(eDoc.data(), eDoc.data()?.date)) {
              docRefsToDelete.push(eDoc.ref);
            }
          });
        } catch (err) {}

        try {
          const secEntriesSnap2 = await getDocs(
            collection(db, COLLECTIONS.USERS, deanUid, 'sections', sectionName, 'entries')
          );
          secEntriesSnap2.forEach((eDoc) => {
            if (isMatchingSchoolYear(eDoc.data(), eDoc.data()?.date)) {
              docRefsToDelete.push(eDoc.ref);
            }
          });
        } catch (err) {}
      }
    }
  } catch (directTraverseErr) {
    console.warn('[deleteSchoolYear] Direct dean traversal error:', directTraverseErr);
  }

  try {
    // 4. entries collectionGroup
    const entriesSnap = await getDocs(collectionGroup(db, 'entries'));
    entriesSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data(), d.data()?.date)) docRefsToDelete.push(d.ref);
    });
  } catch (e) {}

  try {
    // 5. schedule_entries collectionGroup
    const schedEntriesSnap = await getDocs(collectionGroup(db, 'schedule_entries'));
    schedEntriesSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data(), d.data()?.date)) docRefsToDelete.push(d.ref);
    });
  } catch (e) {}

  try {
    // 6. plotEntries collectionGroup
    const plotEntriesSnap = await getDocs(collectionGroup(db, 'plotEntries'));
    plotEntriesSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data(), d.data()?.date)) docRefsToDelete.push(d.ref);
    });
  } catch (e) {}

  try {
    // 7. schedule_plot_requests & their subcollections
    const plotReqSnap = await getDocs(collection(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS));
    for (const pDoc of plotReqSnap.docs) {
      if (isMatchingSchoolYear(pDoc.data())) {
        docRefsToDelete.push(pDoc.ref);
        try {
          const subSnap = await getDocs(collection(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS, pDoc.id, 'schedule_entries'));
          subSnap.forEach((sd) => docRefsToDelete.push(sd.ref));
        } catch (subErr) {}
        try {
          const subSnap2 = await getDocs(collection(db, COLLECTIONS.SCHEDULE_PLOT_REQUESTS, pDoc.id, 'entries'));
          subSnap2.forEach((sd) => docRefsToDelete.push(sd.ref));
        } catch (subErr) {}
      }
    }
  } catch (e) {}

  try {
    // 8. schedule_control_sessions
    const controlSnap = await getDocs(collection(db, 'schedule_control_sessions'));
    controlSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data())) docRefsToDelete.push(d.ref);
    });
  } catch (e) {}

  // D. Room Reservations
  try {
    const resSnap = await getDocs(collection(db, COLLECTIONS.ROOM_RESERVATIONS));
    resSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data(), d.data()?.dateOfActivity || d.data()?.date)) {
        docRefsToDelete.push(d.ref);
      }
    });
  } catch (e) {}

  // E. Facility Maintenance (Schedules & Reports)
  try {
    const maintSchedSnap = await getDocs(collection(db, COLLECTIONS.MAINTENANCE_SCHEDULES));
    maintSchedSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data(), d.data()?.startDate || d.data()?.date)) {
        docRefsToDelete.push(d.ref);
      }
    });
  } catch (e) {}

  try {
    const maintRepSnap = await getDocs(collection(db, COLLECTIONS.MAINTENANCE_REPORTS));
    maintRepSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data(), d.data()?.date)) {
        docRefsToDelete.push(d.ref);
      }
    });
  } catch (e) {}

  // F. No-Class Days
  try {
    const noClassDaysSnap = await getDocs(collection(db, COLLECTIONS.NO_CLASS_DAYS));
    noClassDaysSnap.forEach((d) => {
      if (isMatchingSchoolYear(d.data(), d.data()?.date)) {
        docRefsToDelete.push(d.ref);
      }
    });
  } catch (e) {}

  // G. Parent School Year Document & Any Duplicate Alias Documents
  try {
    const calSnap = await getDocs(collection(db, COLLECTIONS.ACADEMIC_CALENDARS));
    calSnap.forEach((d) => {
      if (d.id === 'school_calendar_pdf' || d.id.includes('_pdf')) return;
      const dCanonical = normalizeSchoolYearLabel(d.data()?.label || d.data()?.displayLabel || d.id);
      if (dCanonical === canonicalLabel || d.id === schoolYearId) {
        docRefsToDelete.push(d.ref);
      }
    });
  } catch (e) {}

  // Deduplicate and execute batch deletes
  const uniqueDocRefsMap = new Map();
  docRefsToDelete.forEach((ref) => {
    if (ref && ref.path) uniqueDocRefsMap.set(ref.path, ref);
  });

  const uniqueRefs = Array.from(uniqueDocRefsMap.values());
  await executeBatchDeletes(uniqueRefs);
}

export async function addHoliday(schoolYearId, { date, name, desc }) {
  const ref = doc(holidaysRef(schoolYearId));
  await setDoc(ref, {
    date,
    name: name.trim(),
    desc: (desc || '').trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteHoliday(schoolYearId, holidayId) {
  await deleteDoc(doc(holidaysRef(schoolYearId), holidayId));
}

export async function addNoClassPeriod(schoolYearId, { start, end, reason, desc }) {
  const ref = doc(noClassRef(schoolYearId));
  await setDoc(ref, {
    start,
    end,
    reason: reason.trim(),
    desc: (desc || '').trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteNoClassPeriod(schoolYearId, periodId) {
  await deleteDoc(doc(noClassRef(schoolYearId), periodId));
}

export async function saveExamPeriodRange(schoolYearId, semester, periodKey, level, start, end) {
  const ref = schoolYearRef(schoolYearId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? snap.data().examPeriods || EMPTY_EXAM_PERIODS : EMPTY_EXAM_PERIODS;
  const semKey = String(semester);
  const updated = {
    ...existing,
    [semKey]: {
      ...(existing[semKey] || EMPTY_EXAM_PERIODS[semKey]),
      [periodKey]: {
        ...(existing[semKey]?.[periodKey] || EMPTY_EXAM_PERIODS[semKey][periodKey]),
        [level]: { start, end },
      },
    },
  };
  await updateDoc(ref, { examPeriods: updated, updatedAt: serverTimestamp() });
}

function pdfCalendarRef() {
  return doc(db, COLLECTIONS.ACADEMIC_CALENDARS, 'school_calendar_pdf');
}

function pdfChunksCollection() {
  return collection(db, COLLECTIONS.ACADEMIC_CALENDARS, 'school_calendar_pdf', 'chunks');
}

export function subscribeSchoolCalendarPdf(onData, onError) {
  const ref = pdfCalendarRef();
  return onSnapshot(
    ref,
    async (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }

      const data = snap.data();
      if (data.isChunked && data.totalChunks) {
        try {
          const chunksSnap = await getDocs(query(pdfChunksCollection(), orderBy('chunkIndex')));
          const sortedChunks = chunksSnap.docs.map((d) => d.data());
          const fullPdfUrl = sortedChunks.map((c) => c.chunkData).join('');
          onData({
            ...data,
            pdfUrl: fullPdfUrl,
          });
        } catch (err) {
          console.error('Error assembling PDF chunks:', err);
          onData(data);
        }
      } else {
        onData(data);
      }
    },
    onError
  );
}

export async function saveSchoolCalendarPdf({ pdfUrl, pdfFileName, uploadedBy }) {
  const parentRef = pdfCalendarRef();

  // Clean up existing chunks first
  try {
    const existingChunks = await getDocs(pdfChunksCollection());
    if (!existingChunks.empty) {
      const batch = writeBatch(db);
      existingChunks.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('Error clearing old chunks:', err);
  }

  // Chunk size: 300KB per chunk to safely stay under 1MB Firestore limit
  const CHUNK_SIZE = 300 * 1024;
  const totalChunks = Math.ceil(pdfUrl.length / CHUNK_SIZE);

  if (totalChunks > 1) {
    // Save metadata in parent doc
    await setDoc(parentRef, {
      pdfFileName: pdfFileName || 'School_Calendar.pdf',
      uploadedBy: uploadedBy || 'Registrar',
      uploadedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isChunked: true,
      totalChunks,
    });

    // Save chunks in batches
    for (let i = 0; i < totalChunks; i++) {
      const chunkData = pdfUrl.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkDocRef = doc(pdfChunksCollection(), `chunk_${i}`);
      await setDoc(chunkDocRef, {
        chunkIndex: i,
        chunkData,
      });
    }
  } else {
    // Single chunk fits in document directly
    await setDoc(parentRef, {
      pdfUrl,
      pdfFileName: pdfFileName || 'School_Calendar.pdf',
      uploadedBy: uploadedBy || 'Registrar',
      uploadedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isChunked: false,
      totalChunks: 1,
    });
  }
}

export async function deleteSchoolCalendarPdf() {
  const parentRef = pdfCalendarRef();
  try {
    const existingChunks = await getDocs(pdfChunksCollection());
    if (!existingChunks.empty) {
      const batch = writeBatch(db);
      existingChunks.forEach((d) => batch.delete(d.ref));
      batch.delete(parentRef);
      await batch.commit();
    } else {
      await deleteDoc(parentRef);
    }
  } catch (err) {
    console.error('Error deleting PDF calendar:', err);
    await deleteDoc(parentRef);
  }
}

// ----------------------------------------------------
// CALENDAR EVENTS (Interactive UI & AI-Generated)
// ----------------------------------------------------
function calendarEventsRef(schoolYearId) {
  return collection(db, COLLECTIONS.ACADEMIC_CALENDARS, schoolYearId, COLLECTIONS.CALENDAR_EVENTS || 'events');
}

/**
 * Subscribe to all calendar events for a given school year
 */
export function subscribeCalendarEvents(schoolYearId, onData, onError) {
  if (!schoolYearId) {
    onData([]);
    return () => {};
  }
  const q = query(calendarEventsRef(schoolYearId), orderBy('startDate', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      onData(list);
    },
    onError,
  );
}

/**
 * Add a single calendar event
 */
export async function addCalendarEvent(schoolYearId, {
  title,
  startDate,
  endDate,
  category = 'event', // 'holiday' | 'exam' | 'academic' | 'activity' | 'event'
  isNoClass = false,
  description = '',
  source = 'manual',
}) {
  const ref = doc(calendarEventsRef(schoolYearId));
  const cleanData = {
    title: (title || '').trim(),
    startDate: startDate || '',
    endDate: endDate || startDate || '',
    category: category || 'event',
    isNoClass: Boolean(isNoClass),
    description: (description || '').trim(),
    source: source || 'manual',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, cleanData);
  return ref.id;
}

/**
 * Update an existing calendar event
 */
export async function updateCalendarEvent(schoolYearId, eventId, updates) {
  const ref = doc(calendarEventsRef(schoolYearId), eventId);
  const cleanData = {
    ...updates,
    updatedAt: serverTimestamp(),
  };
  if (updates.title !== undefined) cleanData.title = updates.title.trim();
  if (updates.description !== undefined) cleanData.description = updates.description.trim();
  await updateDoc(ref, cleanData);
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(schoolYearId, eventId) {
  await deleteDoc(doc(calendarEventsRef(schoolYearId), eventId));
}

/**
 * Apply AI-parsed calendar data to Firestore:
 * - Upserts school year configuration (semesters, label) to the exact matching doc
 * - Updates exam period date ranges
 * - If clearExisting is true, refreshes AI-scanned events while preserving manual custom entries
 * - Batches all parsed events, holidays, and no-class records without duplicates
 */
export async function applyAiParsedCalendar(targetSchoolYearId, parsedData, options = {}) {
  const { clearExisting = true } = options;

  // Resolve correct school year document ID
  let syId = targetSchoolYearId;
  const parsedLabel = parsedData.schoolYear ? String(parsedData.schoolYear).replace(/^sy\s+/i, '').trim() : '';

  if (!syId && parsedLabel) {
    const existing = await findExistingSchoolYearByLabel(parsedLabel);
    syId = existing ? existing.id : buildSchoolYearId(parsedLabel);
  }

  if (!syId) {
    syId = buildSchoolYearId(parsedLabel || '2026-2027');
  }

  const batch = writeBatch(db);

  // 1. Update School Year Configuration & Semesters
  const syDocRef = schoolYearRef(syId);
  const sySnap = await getDoc(syDocRef);
  const existingSy = sySnap.exists() ? sySnap.data() : {};
  const label = normalizeSchoolYearLabel(parsedLabel || existingSy.label || syId.replace(/^sy_/i, '').replace(/_/g, '-'));
  const displayLabel = `SY ${label}`;

  const semestersToSave = Array.isArray(parsedData.semesters) && parsedData.semesters.length > 0
    ? parsedData.semesters.map((s, idx) => ({
        id: s.id || `sem_${idx + 1}`,
        name: (s.name || '').trim() || (idx === 2 ? 'Summer' : `Semester ${idx + 1}`),
        start: s.start || '',
        end: s.end || '',
      }))
    : (existingSy.semesters || [
        { id: 'sem_1', name: 'Semester 1', start: '', end: '' },
        { id: 'sem_2', name: 'Semester 2', start: '', end: '' },
      ]);

  const syUpdates = {
    label,
    displayLabel,
    semesters: semestersToSave,
    updatedAt: serverTimestamp(),
  };

  if (!sySnap.exists()) {
    syUpdates.createdAt = serverTimestamp();
  }

  // Update Exam Periods if detected
  if (parsedData.examPeriods && Object.keys(parsedData.examPeriods).length > 0) {
    syUpdates.examPeriods = {
      ...(existingSy.examPeriods || EMPTY_EXAM_PERIODS),
      ...parsedData.examPeriods,
    };
  }

  batch.set(syDocRef, syUpdates, { merge: true });

  // 2. Manage existing events (Cleanly replace previous AI-scanned events or merge without duplicates)
  const existingEventsSnap = await getDocs(calendarEventsRef(syId));
  const existingHolidaysSnap = await getDocs(holidaysRef(syId));

  if (clearExisting) {
    // Delete previous AI-scanned events to avoid doubling, but keep user manual custom entries
    existingEventsSnap.forEach((d) => {
      const data = d.data() || {};
      if (data.source === 'ai_scan' || !data.source) {
        batch.delete(d.ref);
      }
    });

    existingHolidaysSnap.forEach((d) => {
      const data = d.data() || {};
      if (data.source === 'ai_scan' || !data.source) {
        batch.delete(d.ref);
      }
    });
  }

  // 3. Batch Save All Parsed Events
  if (Array.isArray(parsedData.events)) {
    const existingKeys = new Set(
      existingEventsSnap.docs.map((d) => {
        const data = d.data() || {};
        return `${String(data.title || '').trim().toLowerCase()}_${data.startDate}`;
      })
    );

    for (const ev of parsedData.events) {
      if (!ev.title || !ev.startDate) continue;
      const key = `${String(ev.title || '').trim().toLowerCase()}_${ev.startDate}`;
      
      // If not clearExisting and event already exists, skip to prevent duplicates
      if (!clearExisting && existingKeys.has(key)) continue;

      const evRef = doc(calendarEventsRef(syId));
      batch.set(evRef, {
        title: (ev.title || '').trim(),
        startDate: ev.startDate || '',
        endDate: ev.endDate || ev.startDate || '',
        category: ev.category || 'event',
        isNoClass: Boolean(ev.isNoClass),
        description: (ev.description || '').trim(),
        source: 'ai_scan',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // If it's a holiday, also sync to holidays collection
      if (ev.category === 'holiday' || ev.isNoClass) {
        const holRef = doc(holidaysRef(syId));
        batch.set(holRef, {
          date: ev.startDate,
          endDate: ev.endDate || ev.startDate,
          name: (ev.title || '').trim(),
          desc: (ev.description || '').trim(),
          isNoClass: Boolean(ev.isNoClass),
          source: 'ai_scan',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  await batch.commit();
  return { success: true, schoolYearId: syId, count: parsedData.events?.length || 0 };
}
