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

  const emit = () => onData({ config, holidays, noClassPeriods });

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

  return () => {
    unsubConfig();
    unsubHolidays();
    unsubNoClass();
  };
}

export async function saveSchoolYearConfig(schoolYearId, {
  label,
  semester1Start,
  semester1End,
  semester2Start,
  semester2End,
}) {
  const displayLabel = label.startsWith('SY ') ? label : `SY ${label}`;
  await setDoc(
    schoolYearRef(schoolYearId),
    {
      label,
      displayLabel,
      semester1Start,
      semester1End,
      semester2Start,
      semester2End,
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
