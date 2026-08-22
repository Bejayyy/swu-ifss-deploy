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
import { EMPTY_EXAM_PERIODS } from '../utils/academicCalendarUtils';

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
  return `sy_${(label || '').replace(/\s+/g, '_').toLowerCase()}`;
}

export function subscribeSchoolYears(onData, onError) {
  const q = query(collection(db, COLLECTIONS.ACADEMIC_CALENDARS), orderBy('label'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  const displayLabel = label.startsWith('SY ') ? label : `SY ${label}`;
  
  // Normalize semesters array
  const formattedSemesters = Array.isArray(semesters)
    ? semesters.map((s, idx) => ({
        id: s.id || `sem_${idx + 1}`,
        name: (s.name || '').trim() || `Semester ${idx + 1}`,
        start: s.start || '',
        end: s.end || '',
      }))
    : [];

  const sem1Start = formattedSemesters[0]?.start ?? semester1Start ?? '';
  const sem1End = formattedSemesters[0]?.end ?? semester1End ?? '';
  const sem2Start = formattedSemesters[1]?.start ?? semester2Start ?? '';
  const sem2End = formattedSemesters[1]?.end ?? semester2End ?? '';

  await setDoc(
    schoolYearRef(schoolYearId),
    {
      label,
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

  const snap = await getDoc(schoolYearRef(schoolYearId));
  if (!snap.data()?.examPeriods) {
    await updateDoc(schoolYearRef(schoolYearId), { examPeriods: EMPTY_EXAM_PERIODS });
  }
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
 * - Upserts school year configuration (semesters, label)
 * - Updates exam period date ranges if detected
 * - Batches all parsed events, holidays, and no-class records
 */
export async function applyAiParsedCalendar(schoolYearId, parsedData, options = {}) {
  const { clearExisting = false } = options;
  const batch = writeBatch(db);

  // 1. Update School Year Configuration & Semesters
  const syDocRef = schoolYearRef(schoolYearId);
  const sySnap = await getDoc(syDocRef);
  const existingSy = sySnap.exists() ? sySnap.data() : {};

  const label = parsedData.schoolYear || existingSy.label || '2026-2027';
  const displayLabel = label.startsWith('SY ') ? label : `SY ${label}`;

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

  // 2. Clear existing events if requested
  if (clearExisting) {
    const existingEventsSnap = await getDocs(calendarEventsRef(schoolYearId));
    existingEventsSnap.forEach((d) => batch.delete(d.ref));
  }

  // 3. Batch Save All Events
  if (Array.isArray(parsedData.events)) {
    for (const ev of parsedData.events) {
      if (!ev.title || !ev.startDate) continue;
      const evRef = doc(calendarEventsRef(schoolYearId));
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
        const holRef = doc(holidaysRef(schoolYearId));
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
  return { success: true, count: parsedData.events?.length || 0 };
}

