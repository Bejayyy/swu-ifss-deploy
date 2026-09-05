import * as XLSX from 'xlsx';
import * as CFB from 'cfb';
import { requiresCollege } from '../constants/colleges';

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// SheetJS Community Edition reads validation rules but does not serialize
// worksheet data validations. Inject the standard OOXML nodes into sheet1 so
// the downloaded workbook contains real Excel dropdown controls.
const writeWorkbookWithValidations = (workbook, filename, validations) => {
  const workbookBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  // XLSX returns an ArrayBuffer in browsers, while CFB expects an indexed byte
  // array. Passing the ArrayBuffer directly causes CFB's header parser to fail.
  const archive = CFB.read(new Uint8Array(workbookBytes), { type: 'array' });
  const sheetIndex = archive.FullPaths.findIndex((path) =>
    String(path || '').replace(/\\/g, '/').endsWith('/xl/worksheets/sheet1.xml')
  );
  if (sheetIndex < 0) throw new Error('Unable to prepare Excel dropdown validation.');
  const sheetPath = archive.FullPaths[sheetIndex];
  const sheetFile = archive.FileIndex[sheetIndex];

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let xml = decoder.decode(sheetFile.content);
  const validationXml = `<dataValidations count="${validations.length}">${validations.map((validation) =>
    `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="${escapeXml(validation.errorTitle)}" error="${escapeXml(validation.error)}" sqref="${escapeXml(validation.sqref)}"><formula1>${escapeXml(validation.formula1)}</formula1></dataValidation>`
  ).join('')}</dataValidations>`;
  const insertionPoint = /(<hyperlinks\b|<printOptions\b|<pageMargins\b|<pageSetup\b|<headerFooter\b|<drawing\b|<legacyDrawing\b|<tableParts\b|<extLst\b|<\/worksheet>)/;
  xml = xml.replace(insertionPoint, `${validationXml}$1`);
  // Do not use `unsafe` here: it appends a second ZIP entry with the same path,
  // which makes Excel repair the workbook and discard the validation rules.
  CFB.utils.cfb_add(archive, sheetPath, encoder.encode(xml));

  const output = CFB.write(archive, { fileType: 'zip', type: 'array', compression: true });
  const url = URL.createObjectURL(new Blob([output], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

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

const COURSE_IMPORT_FIELDS = new Set([
  'code', 'title', 'college', 'program', 'year', 'sem', 'lecUnits', 'labUnits',
  'totalUnits', 'lecHours', 'labHours', 'type', 'serviceCollege',
  'lecServiceCollege', 'labServiceCollege',
]);

const getDeterministicCourseColumnMap = (headers = []) => {
  const colMap = {};
  headers.forEach((rawHeader, cIdx) => {
    const colHeader = String(rawHeader || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (/^(course |subject )?code\b/.test(colHeader) || colHeader === 'code') colMap.code = cIdx;
    else if (colHeader.includes('subject description') || colHeader.includes('course title') || colHeader.includes('subject title') || colHeader === 'title') colMap.title = cIdx;
    else if (colHeader.includes('lecture service') || colHeader.includes('lec service')) colMap.lecServiceCollege = cIdx;
    else if (colHeader.includes('laboratory service') || colHeader.includes('lab service')) colMap.labServiceCollege = cIdx;
    else if (colHeader === 'service college' || colHeader.includes('servicing college')) colMap.serviceCollege = cIdx;
    else if (colHeader === 'department' || colHeader.includes('owning college') || colHeader.includes('target college') || colHeader.includes('mother college')) colMap.college = cIdx;
    else if (colHeader === 'program' || colHeader.includes('degree program')) colMap.program = cIdx;
    else if (colHeader.includes('year level')) colMap.year = cIdx;
    else if (colHeader.includes('semester') || colHeader === 'term') colMap.sem = cIdx;
    else if (colHeader.includes('lec') && (colHeader.includes('hour') || colHeader.includes('hr') || colHeader.includes('time'))) colMap.lecHours ??= cIdx;
    else if (colHeader.includes('lab') && (colHeader.includes('hour') || colHeader.includes('hr') || colHeader.includes('time'))) colMap.labHours ??= cIdx;
    else if (colHeader.includes('lec') && colHeader.includes('unit')) colMap.lecUnits = cIdx;
    else if (colHeader.includes('lab') && colHeader.includes('unit')) colMap.labUnits = cIdx;
    else if ((colHeader.includes('total') && colHeader.includes('unit')) || colHeader === 'units' || colHeader === 'units *') colMap.totalUnits = cIdx;
    else if (colHeader.includes('type')) colMap.type = cIdx;
  });
  return colMap;
};

const findCourseHeaderRow = (rows = []) => {
  let best = { index: -1, map: {}, score: 0 };
  rows.slice(0, 75).forEach((row, index) => {
    const map = getDeterministicCourseColumnMap(row);
    const mappedCount = Object.keys(map).length;
    const requiredCount = Number(map.code !== undefined) + Number(map.title !== undefined);
    const score = (requiredCount * 20) + mappedCount;
    if (score > best.score) best = { index, map, score };
  });
  return best.score >= 2 ? best : { index: -1, map: {}, score: 0 };
};

const mergeCourseColumnMaps = (aiMap = {}, exactMap = {}) => {
  const merged = { ...exactMap };
  const usedIndexes = new Set(Object.values(exactMap));
  Object.entries(aiMap).forEach(([field, index]) => {
    if (merged[field] !== undefined || usedIndexes.has(index)) return;
    merged[field] = index;
    usedIndexes.add(index);
  });
  return merged;
};

const getAiCourseColumnMap = async (headers, sampleRows) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) return null;
  const compactSamples = sampleRows.slice(0, 5).map((row) => headers.map((_, index) => String(row[index] ?? '').slice(0, 120)));
  const prompt = `Map spreadsheet columns to the course-import schema. Return JSON only: canonical field names mapped to zero-based column indexes. Use null when absent and never move values between rows. Fields: code, title, college, program, year, sem, lecUnits, labUnits, totalUnits, lecHours, labHours, type, serviceCollege, lecServiceCollege, labServiceCollege. DEPARTMENT means owning college; SUBJECT DESCRIPTION means title; TERM means semester; SERVICE COLLEGE means teaching provider.\nHeaders: ${JSON.stringify(headers)}\nSample rows: ${JSON.stringify(compactSamples)}`;
  for (const model of ['gemini-3.6-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
      });
      if (!response.ok) continue;
      const payload = await response.json();
      const rawText = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
      const parsed = JSON.parse(rawText.replace(/^```json\s*|\s*```$/g, '').trim());
      const validMap = {};
      Object.entries(parsed || {}).forEach(([field, index]) => {
        if (COURSE_IMPORT_FIELDS.has(field) && Number.isInteger(index) && index >= 0 && index < headers.length) validMap[field] = index;
      });
      if (validMap.code !== undefined && validMap.title !== undefined) return validMap;
    } catch {
      // Try the next model, then fall back to local header aliases.
    }
  }
  return null;
};

/**
 * Generates an Excel template file (.xlsx) for bulk importing users.
 */
export function downloadBulkUserTemplate(roles = [], colleges = []) {
  const roleOptions = (roles || [])
    .map((role) => typeof role === 'string'
      ? { value: role, label: role }
      : { value: role.value || role.key || role.id, label: role.label || role.name || role.value })
    .filter((role) => role.value);
  const collegeOptions = [
    { code: 'None', name: 'No College / Department Required' },
    ...(colleges || [])
    .map((college) => ({
      code: String(college.code || college.value || college.id || '').trim(),
      name: String(college.name || college.label || college.code || '').trim(),
    }))
    .filter((college) => college.code),
  ];

  const headers = [
    'First Name *',
    'Middle Name (Optional)',
    'Last Name *',
    'Role *',
    'Email Address *',
    'College / Department (Select None if N/A)',
  ];

  const sampleRows = [
    [
      'Juan',
      'Dela',
      'Cruz',
      roleOptions[0]?.value || 'student',
      'juan.cruz@swu.edu.ph',
      collegeOptions[0]?.code || '',
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

  const optionsData = [
    ['Role Value', 'Role Name', 'College Code', 'College Name'],
    ...Array.from({ length: Math.max(roleOptions.length, collegeOptions.length, 1) }, (_, index) => [
      roleOptions[index]?.value || '',
      roleOptions[index]?.label || '',
      collegeOptions[index]?.code || '',
      collegeOptions[index]?.name || '',
    ]),
  ];
  const optionsWorksheet = XLSX.utils.aoa_to_sheet(optionsData);
  optionsWorksheet['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 18 }, { wch: 42 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'User Import Template');
  XLSX.utils.book_append_sheet(workbook, optionsWorksheet, 'Reference Options');

  // Desktop Excel does not allow a data-validation list to directly reference
  // another worksheet. Workbook-level names are the compatible bridge.
  workbook.Workbook = workbook.Workbook || {};
  workbook.Workbook.Names = [
    {
      Name: 'UserRoleOptions',
      Ref: `'Reference Options'!$A$2:$A$${Math.max(2, roleOptions.length + 1)}`,
    },
    {
      Name: 'UserCollegeOptions',
      Ref: `'Reference Options'!$C$2:$C$${Math.max(2, collegeOptions.length + 1)}`,
    },
  ];

  const validations = [
    {
      sqref: 'D2:D1000',
      type: 'list',
      operator: 'equal',
      formula1: 'UserRoleOptions',
      showErrorMessage: true,
      errorTitle: 'Invalid Role',
      error: 'Please select a valid role from the dropdown list.',
    },
    {
      sqref: 'F2:F1000',
      type: 'list',
      operator: 'equal',
      formula1: 'UserCollegeOptions',
      showErrorMessage: true,
      errorTitle: 'Invalid College',
      error: 'Please select a valid college code from the dropdown list.',
    },
  ];

  writeWorkbookWithValidations(workbook, 'swu_bulk_user_import_template.xlsx', validations);
}

/**
 * Parses and validates an uploaded Excel/CSV file containing users.
 */
export function parseBulkUserSpreadsheet(file, roles = [], roleDefinitions = {}, colleges = [], existingUsers = []) {
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

        const roleOptions = (roles || []).map((role) => typeof role === 'string'
          ? { value: role, label: role }
          : { value: role.value || role.key || role.id, label: role.label || role.name || role.value });
        const roleLookup = new Map();
        roleOptions.forEach((role) => {
          if (!role.value) return;
          roleLookup.set(String(role.value).trim().toLowerCase(), role.value);
          if (role.label) roleLookup.set(String(role.label).trim().toLowerCase(), role.value);
        });
        const collegeLookup = new Map();
        (colleges || []).forEach((college) => {
          const code = String(college.code || college.value || college.id || '').trim();
          const name = String(college.name || college.label || '').trim();
          if (code) collegeLookup.set(code.toLowerCase(), code);
          if (name && code) collegeLookup.set(name.toLowerCase(), code);
        });

        dataRows.forEach((row, rowIdx) => {
          if (!row || row.length === 0 || row.every((cell) => String(cell).trim() === '')) {
            return;
          }

          const rawFirstName = String(row[0] || '').trim();
          const rawMiddleName = String(row[1] || '').trim();
          const rawLastName = String(row[2] || '').trim();
          const rawRole = String(row[3] || '').trim();
          const rawEmail = String(row[4] || '').trim().toLowerCase();
          const rawCollege = String(row[5] || '').trim();
          const resolvedRole = roleLookup.get(rawRole.toLowerCase()) || '';
          const resolvedCollege = collegeLookup.get(rawCollege.toLowerCase()) || '';
          const isNoCollege = rawCollege.toLowerCase() === 'none';

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
          } else if (!resolvedRole) {
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

          const requiresCol = resolvedRole ? requiresCollege(resolvedRole, roleDefinitions) : false;
          if (requiresCol && (!rawCollege || isNoCollege)) {
            rowErrors.push(`College code required for role "${rawRole}"`);
          } else if (rawCollege && !isNoCollege && !resolvedCollege) {
            rowErrors.push(`Invalid college "${rawCollege}"`);
          }

          parsedRows.push({
            id: `bulk_usr_${Date.now()}_${rowIdx}_${Math.random().toString(36).substring(2, 6)}`,
            firstName: toTitleCase(rawFirstName),
            middleName: rawMiddleName ? toTitleCase(rawMiddleName) : '',
            lastName: toTitleCase(rawLastName),
            role: resolvedRole || roleOptions[0]?.value || 'student',
            email: rawEmail,
            college: isNoCollege ? '' : resolvedCollege,
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
    'Owning College / Department',
    'Degree Program (Optional)',
    'Year Level *',
    'Semester *',
    'Lecture Units (Lec)',
    'Laboratory Units (Lab)',
    'Total Credit Units (Sum)',
    'Lec Hours/Wk (Default: Lec x 1)',
    'Lab Hours/Wk (Default: Lab x 3)',
    'Course Type *',
    'Lecture Service College (Optional)',
    'Laboratory Service College (Optional)',
  ];

  const sampleRows = [
    [
      'IT101',
      'Programming 1',
      'College of IT',
      'BSIT',
      '1st Year',
      '1st Semester',
      2,
      1,
      3,
      2,
      3,
      'both',
      '',
      'College of Engineering',
    ],
  ];

  const sheetData = [headers, ...sampleRows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

  worksheet['!cols'] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 34 },
    { wch: 24 },
    { wch: 16 },
    { wch: 34 },
    { wch: 36 },
    { wch: 18 },
    { wch: 20 },
    { wch: 22 },
    { wch: 24 },
    { wch: 30 },
    { wch: 30 },
    { wch: 16 },
  ];

  const validYears = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
  const validSemesters = ['1st Semester', '2nd Semester', 'Summer'];
  const validTypes = ['lecture', 'laboratory', 'both'];

  const optionsData = [
    ['Year Levels', 'Semesters', 'Course Types', 'Template Guidelines / Notes'],
    ['1st Year', '1st Semester', 'lecture', '• Lecture Units: Academic credit for lecture components.'],
    ['2nd Year', '2nd Semester', 'laboratory', '• Laboratory Units: Academic credit for laboratory components.'],
    ['3rd Year', 'Summer', 'both', '• Total Units: Combined credit units (Lec + Lab).'],
    ['4th Year', '', '', '• Lec Hours/Wk: Weekly contact time (Defaults to 1.0 hr per Lec Unit).'],
    ['5th Year', '', '', '• Lab Hours/Wk: Weekly contact time (Defaults to 3.0 hrs per Lab Unit).'],
  ];
  const optionsWorksheet = XLSX.utils.aoa_to_sheet(optionsData);
  optionsWorksheet['!cols'] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 60 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Course Import Template');
  XLSX.utils.book_append_sheet(workbook, optionsWorksheet, 'Reference Options');

  worksheet['!dataValidation'] = [
    {
      sqref: 'E2:E1000',
      type: 'list',
      formula1: "'Reference Options'!$A$2:$A$6",
      showErrorMessage: true,
      errorTitle: 'Invalid Year Level',
      error: 'Please select a valid Year Level from the dropdown list.',
    },
    {
      sqref: 'F2:F1000',
      type: 'list',
      formula1: "'Reference Options'!$B$2:$B$4",
      showErrorMessage: true,
      errorTitle: 'Invalid Semester',
      error: 'Please select a valid Semester from the dropdown list.',
    },
    {
      sqref: 'L2:L1000',
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
export function parseBulkCourseSpreadsheet(file, existingCourses = [], onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    onProgress({ stage: 'reading', percent: 8, message: 'Reading the uploaded spreadsheet' });

    reader.onload = async (e) => {
      try {
        onProgress({ stage: 'workbook', percent: 20, message: 'Opening workbook and locating course data' });
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

        onProgress({ stage: 'headers', percent: 35, message: 'Finding the header row and recognizing columns' });
        // Score candidate rows instead of assuming headers are on row 1 or in a fixed order.
        const headerMatch = findCourseHeaderRow(rawRows);
        const headerIndex = headerMatch.index;
        let colMap = headerMatch.map;

        const dataRows = headerIndex !== -1 ? rawRows.slice(headerIndex + 1) : rawRows;
        let mappingSource = 'Smart header matching';
        if (headerIndex !== -1) {
          onProgress({ stage: 'mapping', percent: 48, message: 'Aligning spreadsheet columns with AI' });
          const samples = dataRows.filter((row) => row?.some((cell) => String(cell).trim())).slice(0, 5);
          const aiMap = await getAiCourseColumnMap(rawRows[headerIndex], samples);
          if (aiMap) {
            // Exact aliases stay authoritative. AI fills only unmapped, non-conflicting columns.
            colMap = mergeCourseColumnMaps(aiMap, colMap);
            mappingSource = 'AI-assisted header matching';
          }
        }
        onProgress({ stage: 'rows', percent: 65, message: 'Reading and normalizing course rows' });
        if (colMap.code === undefined || colMap.title === undefined) {
          return resolve({
            rows: [],
            errors: ['Could not identify the course code and course title columns. Add recognizable headers or enable AI mapping.'],
            mappingSource,
            columnMap: colMap,
          });
        }
        const parsedRows = [];

        dataRows.forEach((row, rowIdx) => {
          if (!row || row.length === 0 || row.every((cell) => String(cell).trim() === '')) {
            return;
          }

          const rawCode = String(row[colMap.code] || '').trim().toUpperCase();
          const rawTitle = toTitleCase(String(row[colMap.title] || ''));
          const rawProgram = String(colMap.program !== undefined ? row[colMap.program] : '').trim().toUpperCase();
          const rawYear = String(colMap.year !== undefined ? row[colMap.year] : '').trim();
          const rawSem = String(colMap.sem !== undefined ? row[colMap.sem] : '').trim();
          const rawCollege = String(colMap.college !== undefined ? row[colMap.college] : '').trim();
          const rawServiceCollege = String(colMap.serviceCollege !== undefined ? row[colMap.serviceCollege] : '').trim();
          const rawLecServiceCollege = String(colMap.lecServiceCollege !== undefined ? row[colMap.lecServiceCollege] : '').trim();
          const rawLabServiceCollege = String(colMap.labServiceCollege !== undefined ? row[colMap.labServiceCollege] : '').trim();

          const rawLecU = colMap.lecUnits !== undefined ? Number(row[colMap.lecUnits]) : null;
          const rawLabU = colMap.labUnits !== undefined ? Number(row[colMap.labUnits]) : null;
          const rawTotalU = colMap.totalUnits !== undefined ? Number(row[colMap.totalUnits]) : NaN;

          const rawLecH = colMap.lecHours !== undefined ? Number(row[colMap.lecHours]) : null;
          const rawLabH = colMap.labHours !== undefined ? Number(row[colMap.labHours]) : null;

          const rawType = String(colMap.type !== undefined ? row[colMap.type] : '').trim();

          // Auto-exclude sample row ("IT101", "Programming 1")
          if (rawCode === 'IT101' && rawTitle.toLowerCase() === 'programming 1') {
            return;
          }

          const rowErrors = [];

          if (!rawCode) {
            rowErrors.push('Course code is required');
          } else if (!rawCollege && existingCourses.some((c) => (c.code || '').toUpperCase() === rawCode)) {
            rowErrors.push(`Course code "${rawCode}" already exists in college`);
          }

          if (!rawTitle) {
            rowErrors.push('Course title is required');
          }

          // Smart Normalizers
          const yearLevel = normalizeYearLevel(rawYear);
          const semester = normalizeSemester(rawSem);
          let type = normalizeCourseType(rawType);

          // Units calculation
          let lecUnits = rawLecU !== null && !isNaN(rawLecU) ? rawLecU : (type === 'laboratory' ? 0 : 3);
          let labUnits = rawLabU !== null && !isNaN(rawLabU) ? rawLabU : (type === 'laboratory' ? (rawTotalU || 3) : 0);

          if (rawLecU !== null && rawLabU !== null) {
            if (labUnits > 0 && lecUnits > 0) type = 'both';
            else if (labUnits > 0) type = 'laboratory';
            else type = 'lecture';
          }

          let units = !isNaN(rawTotalU) && rawTotalU > 0 ? rawTotalU : (lecUnits + labUnits);
          if (units <= 0) units = 3;

          // Hours calculation
          let lecHours = rawLecH !== null && !isNaN(rawLecH) ? rawLecH : (lecUnits * 1.0);
          let labHours = rawLabH !== null && !isNaN(rawLabH) ? rawLabH : (labUnits * 3.0);
          let totalHours = lecHours + labHours;
          const isExternalService = rawServiceCollege && rawCollege
            ? rawServiceCollege.toLowerCase() !== rawCollege.toLowerCase()
            : Boolean(rawServiceCollege);
          const lecServiceCollegeName = rawLecServiceCollege || (isExternalService && lecUnits > 0 ? rawServiceCollege : '');
          const labServiceCollegeName = rawLabServiceCollege || (isExternalService && labUnits > 0 ? rawServiceCollege : '');

          parsedRows.push({
            id: `bulk_crs_${Date.now()}_${rowIdx}_${Math.random().toString(36).substring(2, 6)}`,
            code: rawCode,
            title: rawTitle,
            programCode: rawProgram,
            collegeName: rawCollege,
            serviceCollegeName: rawServiceCollege,
            lecServiceCollegeName,
            labServiceCollegeName,
            yearLevel,
            semester,
            lecUnits,
            labUnits,
            units,
            lecHours,
            labHours,
            totalHours,
            type,
            isValid: rowErrors.length === 0,
            errors: rowErrors,
          });
        });

        onProgress({ stage: 'components', percent: 82, message: 'Combining lecture and laboratory components' });
        // Merge split lecture/laboratory rows only when they represent the same
        // subject assignment. Repeated subjects for different programs remain separate.
        const mergedRows = new Map();
        parsedRows.forEach((row) => {
          const mergeKey = [row.collegeName, row.programCode, row.code, row.title, row.yearLevel, row.semester]
            .map((value) => String(value || '').trim().toUpperCase())
            .join('|');
          const existing = mergedRows.get(mergeKey);
          if (!existing) {
            mergedRows.set(mergeKey, { ...row });
            return;
          }
          const existingIsComplete = Number(existing.lecUnits) > 0 && Number(existing.labUnits) > 0;
          const rowIsComplete = Number(row.lecUnits) > 0 && Number(row.labUnits) > 0;
          if (rowIsComplete && !existingIsComplete) {
            existing.lecUnits = Number(row.lecUnits) || 0;
            existing.labUnits = Number(row.labUnits) || 0;
            existing.lecHours = Number(row.lecHours) || 0;
            existing.labHours = Number(row.labHours) || 0;
          } else if (!existingIsComplete) {
            existing.lecUnits = Math.max(Number(existing.lecUnits) || 0, Number(row.lecUnits) || 0);
            existing.labUnits = Math.max(Number(existing.labUnits) || 0, Number(row.labUnits) || 0);
            existing.lecHours = Math.max(Number(existing.lecHours) || 0, Number(row.lecHours) || 0);
            existing.labHours = Math.max(Number(existing.labHours) || 0, Number(row.labHours) || 0);
          }
          existing.units = existing.lecUnits + existing.labUnits;
          existing.totalHours = existing.lecHours + existing.labHours;
          existing.type = existing.lecUnits > 0 && existing.labUnits > 0
            ? 'both'
            : (existing.labUnits > 0 ? 'laboratory' : 'lecture');
          existing.lecServiceCollegeName ||= row.lecServiceCollegeName;
          existing.labServiceCollegeName ||= row.labServiceCollegeName;
          existing.errors = [...new Set([...(existing.errors || []), ...(row.errors || [])])];
          existing.isValid = existing.errors.length === 0;
        });

        onProgress({ stage: 'preview', percent: 88, message: 'Preparing rows for final validation' });
        resolve({ rows: [...mergedRows.values()], mappingSource, columnMap: colMap });
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

