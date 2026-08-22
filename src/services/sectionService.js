import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase/firebase';

const PROGRAM_SECTIONS_COLLECTION = 'program_sections';

// Year number → letter mapping
const YEAR_LETTERS = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F', 7: 'G' };

/**
 * Generate section names for a given program, year level, and count.
 * Format: {PROGRAM_CODE}{YEAR_NUMBER} - {YEAR_LETTER}{SECTION_NUMBER}
 * e.g. BSIT1-A1, BSIT1-A2, BSIT2-B1
 */
export function generateSectionNames(programCode, yearNumber, sectionCount) {
  const letter = YEAR_LETTERS[yearNumber] || String.fromCharCode(64 + yearNumber);
  const names = [];
  for (let i = 1; i <= sectionCount; i++) {
    names.push(`${programCode}${yearNumber}-${letter}${i}`);
  }
  return names;
}

/**
 * Get a year label string from a year number.
 */
export function getYearLabel(yearNumber) {
  const labels = {
    1: '1st Year',
    2: '2nd Year',
    3: '3rd Year',
    4: '4th Year',
    5: '5th Year',
    6: '6th Year',
    7: '7th Year',
  };
  return labels[yearNumber] || `Year ${yearNumber}`;
}

/**
 * Build the Firestore document ID for a program+year combination.
 */
function sectionDocId(programCode, yearNumber) {
  return `${String(programCode).toUpperCase()}_Y${yearNumber}`;
}

/**
 * Save (upsert) section count for a specific program and year.
 * Generates and stores all section names.
 */
export async function upsertProgramYearSections(collegeCode, programCode, yearNumber, sectionCount) {
  if (!programCode || !yearNumber) throw new Error('Program code and year number are required.');

  const code = String(programCode).toUpperCase();
  const year = Number(yearNumber);
  const count = Number(sectionCount) || 0;

  const sections = count > 0 ? generateSectionNames(code, year, count) : [];

  const docId = sectionDocId(code, year);
  const ref = doc(db, PROGRAM_SECTIONS_COLLECTION, docId);

  await setDoc(ref, {
    collegeCode: String(collegeCode).toUpperCase(),
    programCode: code,
    yearNumber: year,
    yearLabel: getYearLabel(year),
    sectionCount: count,
    sections,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(), // setDoc with merge keeps original createdAt if exists via merge
  }, { merge: true });

  // Fix: overwrite createdAt only on first create — above setDoc merge handles it.
  return sections;
}

/**
 * Subscribe to all year-level section documents for a specific program in real-time.
 * onData receives an array sorted by yearNumber.
 */
export function subscribeProgramSections(programCode, onData, onError) {
  if (!programCode) {
    onData([]);
    return () => {};
  }

  const code = String(programCode).toUpperCase();
  const q = query(
    collection(db, PROGRAM_SECTIONS_COLLECTION),
    where('programCode', '==', code)
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => a.yearNumber - b.yearNumber);
      onData(rows);
    },
    onError
  );
}

/**
 * Subscribe to all sections across all programs in a college.
 * Returns a flat array of section name strings, sorted.
 */
export function subscribeCollegeProgramSections(collegeCode, onData, onError) {
  if (!collegeCode) {
    onData([]);
    return () => {};
  }

  const code = String(collegeCode).toUpperCase();
  const q = query(
    collection(db, PROGRAM_SECTIONS_COLLECTION),
    where('collegeCode', '==', code)
  );

  return onSnapshot(
    q,
    (snap) => {
      const allSections = snap.docs.flatMap((d) => d.data().sections || []);
      allSections.sort();
      onData(allSections);
    },
    onError
  );
}

/**
 * Subscribe to sections for a specific program as flat section name strings.
 * Used by the Dean's course scheduling section dropdown.
 */
export function subscribeProgramSectionNames(programCode, onData, onError) {
  if (!programCode) {
    onData([]);
    return () => {};
  }

  return subscribeProgramSections(
    programCode,
    (rows) => {
      const names = rows.flatMap((r) => r.sections || []);
      onData(names);
    },
    onError
  );
}

/**
 * Get all sections for a college once (Promise).
 */
export async function getCollegeProgramSections(collegeCode) {
  if (!collegeCode) return [];
  const code = String(collegeCode).toUpperCase();
  const q = query(
    collection(db, PROGRAM_SECTIONS_COLLECTION),
    where('collegeCode', '==', code)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Delete all section documents for a specific program.
 * Call when a program is removed.
 */
export async function deleteProgramSections(programCode) {
  if (!programCode) return;
  const code = String(programCode).toUpperCase();
  const q = query(
    collection(db, PROGRAM_SECTIONS_COLLECTION),
    where('programCode', '==', code)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

