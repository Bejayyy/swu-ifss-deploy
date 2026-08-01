import * as XLSX from 'xlsx';
import { INSTITUTIONAL_EMAIL_DOMAIN } from '../firebase/constants';
import { requiresCollege } from '../constants/colleges';

/**
 * Downloads a dynamic Excel (.xlsx) template for bulk adding users.
 * Automatically configures in-cell Data Validation (dropdowns) for Roles and Colleges
 * referencing the Roles & Colleges Reference tab and inline list.
 */
export function downloadBulkUserTemplate(roleOptions = [], colleges = []) {
  const wb = XLSX.utils.book_new();

  // Primary Sheet: Users Template
  const templateHeaders = [
    ['First Name *', 'Middle Name *', 'Last Name *', 'Email *', 'Role *', 'College'],
  ];

  const sampleRole = roleOptions[0]?.label || 'Dean';
  const sampleCollege = colleges[0]?.code || 'CAS';

  // Exactly ONE example row for user reference
  const sampleRows = [
    ['Juan', 'Dela', 'Cruz', `juan.cruz@${INSTITUTIONAL_EMAIL_DOMAIN}`, sampleRole, sampleCollege],
  ];

  const wsData = [...templateHeaders, ...sampleRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths for clean presentation
  ws['!cols'] = [
    { wch: 18 }, // First Name
    { wch: 18 }, // Middle Name
    { wch: 18 }, // Last Name
    { wch: 32 }, // Email
    { wch: 24 }, // Role
    { wch: 18 }, // College
  ];

  // Configure Data Validation (Dropdowns) for Role (Column E) and College (Column F)
  const roleListStr = roleOptions.map((r) => r.label).join(',');
  const collegeListStr = colleges.map((c) => c.code).join(',');

  ws['!dataValidation'] = [
    {
      sqref: 'E2:E200',
      type: 'list',
      operator: 'equal',
      formula1: roleOptions.length > 0 ? `'Roles & Colleges Reference'!$A$2:$A$${roleOptions.length + 1}` : `"${roleListStr}"`,
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Invalid Role',
      error: 'Please select a role from the dropdown list.',
    },
    {
      sqref: 'F2:F200',
      type: 'list',
      operator: 'equal',
      formula1: colleges.length > 0 ? `'Roles & Colleges Reference'!$C$2:$C$${colleges.length + 1}` : `"${collegeListStr}"`,
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Invalid College',
      error: 'Please select a college from the dropdown list.',
    },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Users Template');

  // Secondary Sheet: Roles & Colleges Reference
  const refHeaders = [['Valid Roles (Label)', 'Role Key (Internal)', 'College Code', 'College Full Name']];
  const maxRows = Math.max(roleOptions.length, colleges.length);
  const refRows = [];

  for (let i = 0; i < maxRows; i++) {
    const r = roleOptions[i];
    const c = colleges[i];
    refRows.push([
      r ? r.label : '',
      r ? r.value : '',
      c ? c.code : '',
      c ? c.name : '',
    ]);
  }

  const wsRef = XLSX.utils.aoa_to_sheet([...refHeaders, ...refRows]);
  wsRef['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsRef, 'Roles & Colleges Reference');

  // Write and trigger download
  XLSX.writeFile(wb, `swu_bulk_users_template.xlsx`);
}

/**
 * Parses an uploaded Excel or CSV file and validates each row.
 * Filters out the template's example row automatically.
 */
export async function parseBulkUserSpreadsheet(file, roleOptions = [], roleDefinitions = {}, colleges = []) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get first worksheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to 2D array
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rawRows || rawRows.length === 0) {
          return resolve({ rows: [], errors: ['The uploaded file is empty.'] });
        }

        // Find header index
        let headerIndex = -1;
        for (let i = 0; i < rawRows.length; i++) {
          const rowStr = rawRows[i].map((c) => String(c).toLowerCase()).join(' ');
          if (rowStr.includes('first name') || rowStr.includes('email') || rowStr.includes('role')) {
            headerIndex = i;
            break;
          }
        }

        if (headerIndex === -1) {
          headerIndex = 0; // fallback to line 0
        }

        const headers = rawRows[headerIndex].map((h) => String(h).trim().toLowerCase());
        const dataRows = rawRows.slice(headerIndex + 1);

        // Find column indices
        const fnIdx = headers.findIndex((h) => h.includes('first'));
        const mnIdx = headers.findIndex((h) => h.includes('middle'));
        const lnIdx = headers.findIndex((h) => h.includes('last'));
        const emailIdx = headers.findIndex((h) => h.includes('email'));
        const roleIdx = headers.findIndex((h) => h.includes('role'));
        const collegeIdx = headers.findIndex((h) => h.includes('college'));

        const parsedRows = [];
        const seenEmails = new Set();

        dataRows.forEach((row, rowIdx) => {
          // Skip entirely empty rows
          if (!row || row.every((val) => String(val).trim() === '')) return;

          const rawFn = fnIdx !== -1 && row[fnIdx] !== undefined ? String(row[fnIdx]).trim() : '';
          const rawMn = mnIdx !== -1 && row[mnIdx] !== undefined ? String(row[mnIdx]).trim() : '';
          const rawLn = lnIdx !== -1 && row[lnIdx] !== undefined ? String(row[lnIdx]).trim() : '';
          const rawEmail = emailIdx !== -1 && row[emailIdx] !== undefined ? String(row[emailIdx]).trim().toLowerCase() : '';
          const rawRole = roleIdx !== -1 && row[roleIdx] !== undefined ? String(row[roleIdx]).trim() : '';
          const rawCollege = collegeIdx !== -1 && row[collegeIdx] !== undefined ? String(row[collegeIdx]).trim().toUpperCase() : '';

          // Filter out template's single example row (e.g. Juan Dela Cruz, juan.cruz@swu.edu.ph)
          const isExampleRow =
            (rawFn.toLowerCase() === 'juan' && rawLn.toLowerCase() === 'cruz' && rawEmail.includes('juan.cruz')) ||
            rawEmail === `juan.cruz@${INSTITUTIONAL_EMAIL_DOMAIN}` ||
            rawEmail.includes('sample.user') ||
            rawEmail.includes('example.user');

          if (isExampleRow) {
            return; // Exclude sample row from import
          }

          // Match role to role value
          let matchedRoleValue = '';
          const foundRole = roleOptions.find((r) =>
            r.value.toLowerCase() === rawRole.toLowerCase() ||
            r.label.toLowerCase() === rawRole.toLowerCase() ||
            r.label.toLowerCase().replace(/\s+/g, '') === rawRole.toLowerCase().replace(/\s+/g, '')
          );
          if (foundRole) {
            matchedRoleValue = foundRole.value;
          } else if (roleOptions.length > 0) {
            matchedRoleValue = roleOptions[0].value;
          }

          // Match college code
          let matchedCollege = '';
          const foundCollege = colleges.find((c) =>
            c.code.toLowerCase() === rawCollege.toLowerCase() ||
            c.name.toLowerCase() === rawCollege.toLowerCase()
          );
          if (foundCollege) {
            matchedCollege = foundCollege.code;
          } else {
            matchedCollege = rawCollege;
          }

          const rowErrors = [];

          if (!rawFn) rowErrors.push('First name is required');
          if (!rawMn) rowErrors.push('Middle name is required');
          if (!rawLn) rowErrors.push('Last name is required');
          if (!rawEmail) {
            rowErrors.push('Email is required');
          } else if (!rawEmail.endsWith(`@${INSTITUTIONAL_EMAIL_DOMAIN}`)) {
            rowErrors.push(`Email must end with @${INSTITUTIONAL_EMAIL_DOMAIN}`);
          } else if (seenEmails.has(rawEmail)) {
            rowErrors.push(`Duplicate email in file`);
          } else {
            seenEmails.add(rawEmail);
          }

          if (!foundRole && rawRole) {
            rowErrors.push(`Unrecognized role "${rawRole}"`);
          }

          const showCollege = requiresCollege(matchedRoleValue, roleDefinitions);
          if (showCollege && !matchedCollege) {
            rowErrors.push(`College is required for role`);
          } else if (matchedCollege && colleges.length > 0) {
            const validCol = colleges.some((c) => c.code.toLowerCase() === matchedCollege.toLowerCase());
            if (!validCol && showCollege) {
              rowErrors.push(`Invalid college code "${matchedCollege}"`);
            }
          }

          parsedRows.push({
            id: `bulk_${Date.now()}_${rowIdx}_${Math.random().toString(36).substring(2, 6)}`,
            firstName: rawFn,
            middleName: rawMn,
            lastName: rawLn,
            email: rawEmail,
            role: matchedRoleValue || (roleOptions[0]?.value || 'dean'),
            rawRole: rawRole,
            college: matchedCollege,
            rawCollege: rawCollege,
            useCustomAccess: false,
            permissions: [],
            navKeys: [],
            isValid: rowErrors.length === 0,
            errors: rowErrors,
          });
        });

        resolve({ rows: parsedRows });
      } catch (err) {
        reject(new Error('Failed to parse spreadsheet file: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}
