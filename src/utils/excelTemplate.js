import * as XLSX from 'xlsx';

/**
 * Smart Title Case Formatter: Capitalizes the first letter of each word.
 * e.g., "john mark" -> "John Mark", "de la cruz" -> "De La Cruz"
 */
export const toTitleCase = (str) => {
  if (!str) return '';
  return String(str)
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Smart Normalizer for Course Type:
 * Handles inputs like "laboratory and lecture", "lecture/laboratory", "lab & lec", "both" -> "both"
 * "laboratory", "lab" -> "laboratory"
 * "lecture", "lec" -> "lecture"
 */
export const normalizeCourseType = (rawType) => {
  if (!rawType) return 'lecture';
  const s = String(rawType).toLowerCase().trim();
  const hasLab = s.includes('lab') || s.includes('laboratory');
  const hasLec = s.includes('lec') || s.includes('lecture');

  if (s === 'both' || (hasLab && hasLec) || (s.includes('both') && (hasLab || hasLec))) {
    return 'both';
  }
  if (hasLab && hasLec) return 'both';
  if (hasLab) return 'laboratory';
  if (hasLec) return 'lecture';
  return 'lecture';
};

/**
 * Smart Normalizer for Year Level
 */
export const normalizeYearLevel = (rawYear) => {
  if (!rawYear) return '1st Year';
  const s = String(rawYear).toLowerCase().trim();
  if (s.includes('5') || s.includes('fifth')) return '5th Year';
  if (s.includes('4') || s.includes('fourth')) return '4th Year';
  if (s.includes('3') || s.includes('third')) return '3rd Year';
  if (s.includes('2') || s.includes('second')) return '2nd Year';
  if (s.includes('1') || s.includes('first')) return '1st Year';
  return '1st Year';
};

/**
 * Smart Normalizer for Semester
 */
export const normalizeSemester = (rawSem) => {
  if (!rawSem) return '1st Semester';
  const s = String(rawSem).toLowerCase().trim();
  if (s.includes('summer') || s.includes('midyear')) return 'Summer';
  if (s.includes('2') || s.includes('second') || s.includes('2nd')) return '2nd Semester';
  if (s.includes('1') || s.includes('first') || s.includes('1st')) return '1st Semester';
  return '1st Semester';
};

/**
 * Generates an Excel template file (.xlsx) for bulk importing users.
 */
export function downloadBulkUserTemplate() {
  const headers = [
    'First Name *',
    'Middle Name (Optional)',
    'Last Name *',
    'Role *',
    'Email Address *',
    'College Code (Req for Registrar/Teacher/Student)',
  ];

  const sampleRows = [
    [
      'Juan',
      'Dela',
      'Cruz',
      'student',
      'juan.cruz@swu.edu.ph',
      'CEIT',
    ],
  ];

  const sheetData = [headers, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 30 },
    { wch: 45 },
  ];

  const validRoles = [
    'super_admin',
    'asset_manager',
    'department_head',
    'working_scholar',
    'custodian',
    'registrar',
    'teacher',
    'student',
  ];

  const optionsData = [
    ['Valid Roles'],
    ...validRoles.map((role) => [role]),
  ];
  const optionsWorksheet = XLSX.utils.aoa_to_sheet(optionsData);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'User Import Template');
  XLSX.utils.book_append_sheet(workbook, optionsWorksheet, 'Reference Options');

  worksheet['!dataValidation'] = [
    {
      sqref: 'D2:D1000',
      type: 'list',
      operator: 'equal',
      formula1: "'Reference Options'!$A$2:$A$9",
      showErrorMessage: true,
      errorTitle: 'Invalid Role',
      error: 'Please select a valid role from the dropdown list.',
    },
  ];

  XLSX.writeFile(workbook, 'swu_bulk_user_import_template.xlsx');
}

/**
 * Parses and validates an uploaded Excel/CSV file containing users.
 */
export function parseBulkUserSpreadsheet(file, roleDefinitions = {}, colleges = [], existingUsers = []) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          return resolve({ rows: [], errors: ['No worksheets found in the file.'] });
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rawRows || rawRows.length === 0) {
          return resolve({ rows: [], errors: ['The uploaded file is empty.'] });
        }

        // Locate header row
        let headerIndex = -1;
        for (let i = 0; i < rawRows.length; i++) {
          const rowStr = rawRows[i].map((c) => String(c).toLowerCase()).join(' ');
          if (rowStr.includes('first name') || rowStr.includes('email') || rowStr.includes('role')) {
            headerIndex = i;
            break;
          }
        }

        const dataRows = headerIndex !== -1 ? rawRows.slice(headerIndex + 1) : rawRows;
        const parsedRows = [];
        const seenEmails = new Set();

        const validRoleValues = [
          'super_admin',
          'asset_manager',
          'department_head',
          'working_scholar',
          'custodian',
          'registrar',
          'teacher',
          'student',
        ];

        dataRows.forEach((row, rowIdx) => {
          if (!row || row.length === 0 || row.every((cell) => String(cell).trim() === '')) {
            return;
          }

          const rawFirstName = String(row[0] || '').trim();
          const rawMiddleName = String(row[1] || '').trim();
          const rawLastName = String(row[2] || '').trim();
          const rawRole = String(row[3] || '').trim().toLowerCase();
          const rawEmail = String(row[4] || '').trim().toLowerCase();
          const rawCollegeCode = String(row[5] || '').trim().toUpperCase();

          // Exclude sample row ("Juan", "Dela", "Cruz", "student", "juan.cruz@swu.edu.ph")
          if (rawEmail === 'juan.cruz@swu.edu.ph' && rawFirstName.toLowerCase() === 'juan') {
            return;
          }

          const rowErrors = [];

          if (!rawFirstName) rowErrors.push('First name is required');
          // Middle name is optional
          if (!rawLastName) rowErrors.push('Last name is required');

          if (!rawRole) {
            rowErrors.push('Role is required');
          } else if (!validRoleValues.includes(rawRole)) {
            rowErrors.push(`Invalid role "${rawRole}"`);
          }

          if (!rawEmail) {
            rowErrors.push('Email is required');
          } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
            rowErrors.push('Invalid email format');
          } else if (seenEmails.has(rawEmail)) {
            rowErrors.push(`Duplicate email "${rawEmail}" in file`);
          } else if (existingUsers.some((u) => (u.email || '').toLowerCase() === rawEmail)) {
            rowErrors.push(`Email "${rawEmail}" already registered`);
          } else {
            seenEmails.add(rawEmail);
          }

          const requiresCol = ['registrar', 'teacher', 'student'].includes(rawRole);
          if (requiresCol && !rawCollegeCode) {
            rowErrors.push(`College code required for role "${rawRole}"`);
          }

          parsedRows.push({
            id: `bulk_usr_${Date.now()}_${rowIdx}_${Math.random().toString(36).substring(2, 6)}`,
            firstName: toTitleCase(rawFirstName),
            middleName: rawMiddleName ? toTitleCase(rawMiddleName) : '',
            lastName: toTitleCase(rawLastName),
            role: validRoleValues.includes(rawRole) ? rawRole : 'student',
            email: rawEmail,
            collegeCode: rawCollegeCode,
            isValid: rowErrors.length === 0,
            errors: rowErrors,
          });
        });

        resolve({ rows: parsedRows });
      } catch (err) {
        reject(new Error('Failed to parse user spreadsheet: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generates a dynamic Excel template file (.xlsx) for bulk importing courses/subjects.
 */
export function downloadBulkCourseTemplate(collegeCode = 'COLLEGE') {
  const headers = [
    'Course Code *',
    'Course Title *',
    'Year Level *',
    'Semester *',
    'Units *',
    'Course Type *',
  ];

  const sampleRows = [
    [
      'IT101',
      'Programming 1',
      '1st Year',
      '1st Semester',
      3,
      'lecture',
    ],
  ];

  const sheetData = [headers, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 16 },
    { wch: 18 },
    { wch: 10 },
    { wch: 16 },
  ];

  const validYears = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
  const validSemesters = ['1st Semester', '2nd Semester', 'Summer'];
  const validTypes = ['lecture', 'laboratory', 'both'];

  const optionsData = [
    ['Year Levels', 'Semesters', 'Course Types'],
    ['1st Year', '1st Semester', 'lecture'],
    ['2nd Year', '2nd Semester', 'laboratory'],
    ['3rd Year', 'Summer', 'both'],
    ['4th Year', '', ''],
    ['5th Year', '', ''],
  ];
  const optionsWorksheet = XLSX.utils.aoa_to_sheet(optionsData);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Course Import Template');
  XLSX.utils.book_append_sheet(workbook, optionsWorksheet, 'Reference Options');

  worksheet['!dataValidation'] = [
    {
      sqref: 'C2:C1000',
      type: 'list',
      formula1: "'Reference Options'!$A$2:$A$6",
      showErrorMessage: true,
      errorTitle: 'Invalid Year Level',
      error: 'Please select a valid Year Level from the dropdown list.',
    },
    {
      sqref: 'D2:D1000',
      type: 'list',
      formula1: "'Reference Options'!$B$2:$B$4",
      showErrorMessage: true,
      errorTitle: 'Invalid Semester',
      error: 'Please select a valid Semester from the dropdown list.',
    },
    {
      sqref: 'F2:F1000',
      type: 'list',
      formula1: "'Reference Options'!$C$2:$C$4",
      showErrorMessage: true,
      errorTitle: 'Invalid Course Type',
      error: 'Please select a valid Course Type from the dropdown list.',
    },
  ];

  const filename = `swu_bulk_courses_template_${collegeCode.toLowerCase()}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

/**
 * Parses and validates an uploaded Excel/CSV file containing courses/subjects.
 * Automatically excludes sample rows and applies smart normalization for Title, Year Level, Semester, and Type.
 */
export function parseBulkCourseSpreadsheet(file, existingCourses = []) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          return resolve({ rows: [], errors: ['No worksheets found in the file.'] });
        }

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rawRows || rawRows.length === 0) {
          return resolve({ rows: [], errors: ['The uploaded file is empty.'] });
        }

        // Locate header row
        let headerIndex = -1;
        for (let i = 0; i < rawRows.length; i++) {
          const rowStr = rawRows[i].map((c) => String(c).toLowerCase()).join(' ');
          if (rowStr.includes('course code') || rowStr.includes('course title') || rowStr.includes('units')) {
            headerIndex = i;
            break;
          }
        }

        const dataRows = headerIndex !== -1 ? rawRows.slice(headerIndex + 1) : rawRows;
        const parsedRows = [];
        const seenCodes = new Set();

        dataRows.forEach((row, rowIdx) => {
          if (!row || row.length === 0 || row.every((cell) => String(cell).trim() === '')) {
            return;
          }

          const rawCode = String(row[0] || '').trim().toUpperCase();
          // Smart Title Case: Capitalizes first letter of each word
          const rawTitle = toTitleCase(String(row[1] || ''));
          const rawYear = String(row[2] || '').trim();
          const rawSem = String(row[3] || '').trim();
          const rawUnits = Number(row[4]);
          const rawType = String(row[5] || '').trim();

          // Auto-exclude sample row ("IT101", "Programming 1")
          if (rawCode === 'IT101' && rawTitle.toLowerCase() === 'programming 1') {
            return;
          }

          const rowErrors = [];

          if (!rawCode) {
            rowErrors.push('Course code is required');
          } else if (seenCodes.has(rawCode)) {
            rowErrors.push(`Duplicate course code "${rawCode}" in file`);
          } else if (existingCourses.some((c) => (c.code || '').toUpperCase() === rawCode)) {
            rowErrors.push(`Course code "${rawCode}" already exists in college`);
          } else {
            seenCodes.add(rawCode);
          }

          if (!rawTitle) {
            rowErrors.push('Course title is required');
          }

          // Smart Normalizers
          const yearLevel = normalizeYearLevel(rawYear);
          const semester = normalizeSemester(rawSem);
          const type = normalizeCourseType(rawType);

          let units = isNaN(rawUnits) || rawUnits <= 0 ? 3 : rawUnits;
          if (isNaN(rawUnits) || rawUnits <= 0) {
            rowErrors.push('Units must be a positive number');
          }

          parsedRows.push({
            id: `bulk_crs_${Date.now()}_${rowIdx}_${Math.random().toString(36).substring(2, 6)}`,
            code: rawCode,
            title: rawTitle,
            yearLevel,
            semester,
            units,
            type,
            isValid: rowErrors.length === 0,
            errors: rowErrors,
          });
        });

        resolve({ rows: parsedRows });
      } catch (err) {
        reject(new Error('Failed to parse course spreadsheet: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Generates an Excel template file (.xlsx) for bulk importing activities (Academic and Non-Academic).
 */
export function downloadBulkActivityTemplate(colleges = []) {
  const headers = [
    'Category * (Academic / Non-Academic)',
    'Activity Name *',
    'Activity Objective',
    'Belonging Colleges * (Comma-separated codes, e.g. CIT, COE, COA or ALL)',
  ];

  const collegeCodesStr = colleges.map(c => c.code).filter(Boolean).join(', ') || 'CIT, COE, COA';

  const sampleRows = [
    [
      'Academic',
      'Research Colloquium 2026',
      'Presentation of capstone projects and research findings.',
      collegeCodesStr || 'CIT, COE',
    ],
    [
      'Non-Academic',
      'University Sports Fest',
      'Annual intra-school athletics competition and camaraderie.',
      'ALL',
    ],
  ];

  const sheetData = [headers, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  worksheet['!cols'] = [
    { wch: 30 },
    { wch: 35 },
    { wch: 45 },
    { wch: 50 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Activities Template');
  XLSX.writeFile(workbook, 'SWU_Activities_Bulk_Import_Template.xlsx');
}

/**
 * Parses an uploaded Excel / CSV spreadsheet for bulk activity import.
 */
export function parseBulkActivitySpreadsheet(file, availableColleges = []) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (!jsonRows || jsonRows.length < 2) {
          reject(new Error('Spreadsheet appears to be empty or has no data rows.'));
          return;
        }

        const parsedRows = [];
        const seenNames = new Set();

        jsonRows.slice(1).forEach((row, idx) => {
          if (!row || row.length === 0 || row.every((val) => val == null || String(val).trim() === '')) {
            return;
          }

          const rawCategory = String(row[0] || '').toLowerCase().trim();
          const rawName = String(row[1] || '').trim();
          const rawObjective = String(row[2] || '').trim();
          const rawCollegesStr = String(row[3] || '').trim();

          // Auto-exclude sample rows
          if (rawName === 'Research Colloquium 2026' || rawName === 'University Sports Fest') {
            return;
          }

          const rowErrors = [];

          // Category
          const category = rawCategory.includes('non') ? 'non-academic' : 'academic';

          // Name validation
          if (!rawName) {
            rowErrors.push('Activity name is required');
          } else if (seenNames.has(rawName.toLowerCase())) {
            rowErrors.push(`Duplicate activity name "${rawName}" in file`);
          } else {
            seenNames.add(rawName.toLowerCase());
          }

          // Colleges parsing
          let selectedColleges = [];
          if (!rawCollegesStr) {
            rowErrors.push('At least one belonging college is required');
          } else if (rawCollegesStr.toUpperCase() === 'ALL') {
            selectedColleges = availableColleges.map(c => c.code || c.id);
          } else {
            const splitCodes = rawCollegesStr.split(/[,;\/|]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
            const matchedCodes = [];
            const invalidCodes = [];

            splitCodes.forEach(code => {
              const matchedCol = availableColleges.find(c => (c.code || c.id || '').toUpperCase() === code);
              if (matchedCol) {
                matchedCodes.push(matchedCol.code || matchedCol.id);
              } else {
                invalidCodes.push(code);
              }
            });

            if (invalidCodes.length > 0) {
              rowErrors.push(`Unknown college code(s): ${invalidCodes.join(', ')}`);
            }
            if (matchedCodes.length === 0 && invalidCodes.length === 0) {
              rowErrors.push('No valid belonging colleges found');
            }
            selectedColleges = matchedCodes;
          }

          parsedRows.push({
            id: `bulk_act_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
            category,
            name: rawName,
            objective: rawObjective,
            colleges: selectedColleges,
            isValid: rowErrors.length === 0,
            errors: rowErrors,
          });
        });

        resolve({ rows: parsedRows });
      } catch (err) {
        reject(new Error('Failed to parse activity spreadsheet: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

