import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  BookOpen,
  Building2,
} from 'lucide-react';
import {
  downloadBulkCourseTemplate,
  parseBulkCourseSpreadsheet,
  toTitleCase,
} from '../../utils/excelTemplate';
import { addCourse, updateCourse } from '../../services/courseService';
import { subscribeColleges } from '../../services/collegeService';
import { notifyServiceCollegeDeans } from '../../services/notificationService';
import CustomSelect from '../ui/CustomSelect';
import { useModal } from '../../hooks/useModal';
import { ModalRenderer } from './ModalProvider';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer'];
const COURSE_TYPES = [
  { value: 'lecture', label: 'Lecture Only' },
  { value: 'laboratory', label: 'Laboratory Only' },
  { value: 'both', label: 'Both (Lecture & Lab)' },
];

export default function AddCourseModal({
  onClose,
  collegeCode = '',
  collegeName = '',
  existingCourses = [],
  onSaveSuccess,
  editingCourse = null,
  programs = [],
  defaultProgramCode = '',
  centralized = false,
}) {
  const { showConfirm, confirmState, notificationState } = useModal();
  const [activeTab, setActiveTab] = useState(centralized ? 'bulk' : 'individual'); // 'individual' | 'bulk'
  const [allColleges, setAllColleges] = useState([]);

  const resolveCollegeCode = (value, programHint = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    const normalizedProgram = String(programHint || '').trim().toLowerCase();
    if (!normalized && !normalizedProgram) return '';
    const exact = allColleges.find((college) =>
      String(college.code || '').trim().toLowerCase() === normalized ||
      String(college.name || '').trim().toLowerCase() === normalized ||
      (normalizedProgram && (
        String(college.code || '').trim().toLowerCase() === normalizedProgram ||
        college.programs?.some((program) => String(program.code || '').trim().toLowerCase() === normalizedProgram)
      ))
    );
    if (exact) return String(exact.code || exact.name || '').trim().toUpperCase();
    const canonicalize = (input) => String(input || '').toLowerCase()
      .replace(/\binformation\s+(?:and\s+)?technology\b/g, 'it')
      .replace(/\barts?\s+(?:and|&)\s+sciences?\b/g, 'arts science')
      .replace(/\b(rehabilitative|rehabilitation|rehab)\b/g, 'rehabilitation')
      .replace(/\bsciences\b/g, 'science')
      .replace(/\b(college|school|department|of|the|and)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const wanted = canonicalize(normalized);
    const scored = allColleges.map((college) => {
      const candidates = [college.code, college.name, ...(college.aliases || [])].map(canonicalize).filter(Boolean);
      const score = candidates.reduce((best, candidate) => {
        if (candidate === wanted) return Math.max(best, 100);
        if (wanted.length >= 4 && candidate.length >= 4 && (candidate.includes(wanted) || wanted.includes(candidate))) return Math.max(best, 90);
        const wantedTokens = new Set(wanted.split(' ').filter(Boolean));
        const candidateTokens = new Set(candidate.split(' ').filter(Boolean));
        const overlap = [...wantedTokens].filter((token) => candidateTokens.has(token)).length;
        const ratio = overlap / Math.max(wantedTokens.size, candidateTokens.size, 1);
        return Math.max(best, ratio >= 0.75 ? ratio * 80 : 0);
      }, 0);
      return { college, score };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0];
    const runnerUp = scored[1];
    const isConfident = best?.score >= 75 && (!runnerUp || best.score - runnerUp.score >= 15);
    return isConfident ? String(best.college.code || best.college.name || '').trim().toUpperCase() : '';
  };

  useEffect(() => {
    const unsub = subscribeColleges((data) => {
      setAllColleges(data || []);
    });
    return unsub;
  }, []);

  // Helper functions for initial parsing of units and hours
  const getInitialLecUnits = (course) => {
    if (!course) return '3';
    if (course.lecUnits !== undefined && course.lecUnits !== null && course.lecUnits !== '') return String(course.lecUnits);
    if (course.type === 'laboratory') return '0';
    return String(course.units || '3');
  };

  const getInitialLabUnits = (course) => {
    if (!course) return '0';
    if (course.labUnits !== undefined && course.labUnits !== null && course.labUnits !== '') return String(course.labUnits);
    if (course.type === 'laboratory') return String(course.units || '3');
    return '0';
  };

  const getInitialLecHours = (course, lecUnitsStr) => {
    if (course?.lecHours !== undefined && course?.lecHours !== null && course?.lecHours !== '') return String(course.lecHours);
    const u = parseFloat(lecUnitsStr) || 0;
    return String(u * 1.0);
  };

  const getInitialLabHours = (course, labUnitsStr) => {
    if (course?.labHours !== undefined && course?.labHours !== null && course?.labHours !== '') return String(course.labHours);
    const u = parseFloat(labUnitsStr) || 0;
    return String(u * 3.0);
  };

  // Individual Form State
  const initialLecUnits = getInitialLecUnits(editingCourse);
  const initialLabUnits = getInitialLabUnits(editingCourse);
  const initialLecHours = getInitialLecHours(editingCourse, initialLecUnits);
  const initialLabHours = getInitialLabHours(editingCourse, initialLabUnits);
  const initialTotalUnits = String((parseFloat(initialLecUnits) || 0) + (parseFloat(initialLabUnits) || 0));
  const initialTotalHours = String((parseFloat(initialLecHours) || 0) + (parseFloat(initialLabHours) || 0));

  const [individualForm, setIndividualForm] = useState({
    code: editingCourse?.code || '',
    title: editingCourse?.title || '',
    programCode: editingCourse?.programCode || defaultProgramCode || (programs?.[0]?.code || ''),
    yearLevel: editingCourse?.yearLevel || '1st Year',
    semester: editingCourse?.semester || '1st Semester',
    lecUnits: initialLecUnits,
    labUnits: initialLabUnits,
    units: initialTotalUnits,
    lecHours: initialLecHours,
    labHours: initialLabHours,
    totalHours: initialTotalHours,
    type: editingCourse?.type || (parseFloat(initialLabUnits) > 0 && parseFloat(initialLecUnits) > 0 ? 'both' : (parseFloat(initialLabUnits) > 0 ? 'laboratory' : 'lecture')),
    requiresServiceCollege: Boolean(editingCourse?.requiresServiceCollege || editingCourse?.lecServiceCollege || editingCourse?.labServiceCollege),
    lecServiceCollege: editingCourse?.lecServiceCollege || '',
    labServiceCollege: editingCourse?.labServiceCollege || '',
  });
  const [individualError, setIndividualError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingCourse) {
      const lUnits = getInitialLecUnits(editingCourse);
      const lbUnits = getInitialLabUnits(editingCourse);
      const lHours = getInitialLecHours(editingCourse, lUnits);
      const lbHours = getInitialLabHours(editingCourse, lbUnits);
      const tUnits = String((parseFloat(lUnits) || 0) + (parseFloat(lbUnits) || 0));
      const tHours = String((parseFloat(lHours) || 0) + (parseFloat(lbHours) || 0));

      setIndividualForm({
        code: editingCourse.code || '',
        title: editingCourse.title || '',
        programCode: editingCourse.programCode || defaultProgramCode || (programs?.[0]?.code || ''),
        yearLevel: editingCourse.yearLevel || '1st Year',
        semester: editingCourse.semester || '1st Semester',
        lecUnits: lUnits,
        labUnits: lbUnits,
        units: tUnits,
        lecHours: lHours,
        labHours: lbHours,
        totalHours: tHours,
        type: editingCourse.type || (parseFloat(lbUnits) > 0 && parseFloat(lUnits) > 0 ? 'both' : (parseFloat(lbUnits) > 0 ? 'laboratory' : 'lecture')),
        requiresServiceCollege: Boolean(editingCourse.requiresServiceCollege || editingCourse.lecServiceCollege || editingCourse.labServiceCollege),
        lecServiceCollege: editingCourse.lecServiceCollege || '',
        labServiceCollege: editingCourse.labServiceCollege || '',
      });
      setActiveTab('individual');
    } else if (defaultProgramCode) {
      setIndividualForm((prev) => ({
        ...prev,
        programCode: defaultProgramCode,
      }));
    }
  }, [editingCourse, defaultProgramCode]);

  // Bulk Upload State
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [importedProgress, setImportedProgress] = useState(0);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewStatus, setPreviewStatus] = useState('all');
  const [previewCollege, setPreviewCollege] = useState('');
  const [previewProgram, setPreviewProgram] = useState('');
  const [previewYear, setPreviewYear] = useState('');
  const [previewSemester, setPreviewSemester] = useState('');
  const [previewSort, setPreviewSort] = useState('row');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState(25);
  const [mappingSource, setMappingSource] = useState('');
  const [parseProgress, setParseProgress] = useState({ stage: 'reading', percent: 0, message: 'Preparing spreadsheet' });

  useEffect(() => {
    if (!isBulkImporting) return undefined;
    const blockKeyboardClose = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('keydown', blockKeyboardClose, true);
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => {
      window.removeEventListener('keydown', blockKeyboardClose, true);
      window.removeEventListener('beforeunload', warnBeforeLeaving);
    };
  }, [isBulkImporting]);

  const previewFilterOptions = useMemo(() => ({
    colleges: [...new Set(parsedRows.map((row) => row.resolvedCollegeName || row.collegeName || row.collegeCode).filter(Boolean))].sort(),
    programs: [...new Set(parsedRows
      .filter((row) => !previewCollege || (row.resolvedCollegeName || row.collegeName || row.collegeCode) === previewCollege)
      .map((row) => row.programCode).filter(Boolean))].sort(),
    years: [...new Set(parsedRows.map((row) => row.yearLevel).filter(Boolean))].sort(),
    semesters: [...new Set(parsedRows.map((row) => row.semester).filter(Boolean))].sort(),
  }), [parsedRows, previewCollege]);

  const filteredPreviewRows = useMemo(() => {
    const query = previewSearch.trim().toLowerCase();
    const rows = parsedRows.filter((row) =>
      (!query || [row.code, row.title, row.collegeCode, row.collegeName, row.resolvedCollegeName, row.programCode]
        .some((value) => String(value || '').toLowerCase().includes(query))) &&
      (previewStatus === 'all' || (previewStatus === 'valid' ? row.isValid : !row.isValid)) &&
      (!previewCollege || (row.resolvedCollegeName || row.collegeName || row.collegeCode) === previewCollege) &&
      (!previewProgram || row.programCode === previewProgram) &&
      (!previewYear || row.yearLevel === previewYear) &&
      (!previewSemester || row.semester === previewSemester)
    );
    if (previewSort === 'row') return rows;
    const descending = previewSort.endsWith('-desc');
    const field = previewSort.replace('-desc', '');
    const fieldMap = { code: 'code', title: 'title', college: 'collegeCode', program: 'programCode', year: 'yearLevel', semester: 'semester' };
    return [...rows].sort((a, b) => {
      const result = String(a[fieldMap[field]] || a.collegeName || '').localeCompare(String(b[fieldMap[field]] || b.collegeName || ''), undefined, { numeric: true });
      return descending ? -result : result;
    });
  }, [parsedRows, previewSearch, previewStatus, previewCollege, previewProgram, previewYear, previewSemester, previewSort]);

  const previewPageCount = Math.max(1, Math.ceil(filteredPreviewRows.length / previewPageSize));
  const visiblePreviewRows = filteredPreviewRows.slice((previewPage - 1) * previewPageSize, previewPage * previewPageSize);

  useEffect(() => {
    setPreviewPage(1);
  }, [previewSearch, previewStatus, previewCollege, previewProgram, previewYear, previewSemester, previewSort, previewPageSize]);

  const updateParsedRow = (id, field, value) => {
    setParsedRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };
        if (field === 'lecUnits' || field === 'labUnits') {
          const lec = parseFloat(field === 'lecUnits' ? value : updated.lecUnits) || 0;
          const lab = parseFloat(field === 'labUnits' ? value : updated.labUnits) || 0;
          updated.units = lec + lab;
          updated.lecHours = lec * 1.0;
          updated.labHours = lab * 3.0;
          updated.totalHours = updated.lecHours + updated.labHours;
          if (lab > 0 && lec > 0) updated.type = 'both';
          else if (lab > 0) updated.type = 'laboratory';
          else updated.type = 'lecture';
        }
        if (field === 'lecHours' || field === 'labHours') {
          const lH = parseFloat(field === 'lecHours' ? value : updated.lecHours) || 0;
          const labH = parseFloat(field === 'labHours' ? value : updated.labHours) || 0;
          updated.totalHours = lH + labH;
        }
        return updated;
      })
    );
  };

  const removeParsedRow = (id) => {
    setParsedRows((prev) => prev.filter((r) => r.id !== id));
  };

  // ----------------------------------------------------
  // INDIVIDUAL SAVE / UPDATE HANDLER
  // ----------------------------------------------------
  const handleIndividualSubmit = async (e) => {
    e.preventDefault();
    setIndividualError('');

    const code = individualForm.code.trim().toUpperCase();
    const title = toTitleCase(individualForm.title);
    const numLec = parseFloat(individualForm.lecUnits) || 0;
    const numLab = parseFloat(individualForm.labUnits) || 0;
    const totalUnits = parseFloat(individualForm.units) || (numLec + numLab);
    const numLecHours = parseFloat(individualForm.lecHours) !== undefined && !isNaN(parseFloat(individualForm.lecHours))
      ? parseFloat(individualForm.lecHours)
      : numLec * 1.0;
    const numLabHours = parseFloat(individualForm.labHours) !== undefined && !isNaN(parseFloat(individualForm.labHours))
      ? parseFloat(individualForm.labHours)
      : numLab * 3.0;
    const totalHours = parseFloat(individualForm.totalHours) || (numLecHours + numLabHours);

    if (!code) {
      setIndividualError('Course code is required.');
      return;
    }
    if (!title) {
      setIndividualError('Course title is required.');
      return;
    }
    if (isNaN(totalUnits) || totalUnits <= 0) {
      setIndividualError('Total units must be a positive number greater than 0.');
      return;
    }

    // Check duplicate code (excluding current course being edited)
    const duplicate = existingCourses.find(
      (c) => (c.code || '').toUpperCase() === code && c.id !== editingCourse?.id
    );
    if (duplicate) {
      setIndividualError(`A course with code "${code}" already exists in ${collegeCode}.`);
      return;
    }

    const isEditing = Boolean(editingCourse);
    const confirmed = await showConfirm({
      title: isEditing ? 'Save Changes to Course?' : 'Add Course?',
      message: isEditing
        ? `Are you sure you want to save changes to "${code} - ${title}"?`
        : `Are you sure you want to add the course "${code} - ${title}" to ${collegeCode}?`,
      confirmText: isEditing ? 'Save Changes' : 'Add Course',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const reqSvc = Boolean(individualForm.lecServiceCollege || individualForm.labServiceCollege);
      const coursePayload = {
        code,
        title,
        programCode: individualForm.programCode || defaultProgramCode || '',
        yearLevel: individualForm.yearLevel,
        semester: individualForm.semester,
        lecUnits: numLec,
        labUnits: numLab,
        units: totalUnits,
        lecHours: numLecHours,
        labHours: numLabHours,
        totalHours: totalHours,
        type: individualForm.type || (numLab > 0 && numLec > 0 ? 'both' : (numLab > 0 ? 'laboratory' : 'lecture')),
        collegeCode,
        requiresServiceCollege: reqSvc,
        lecServiceCollege: individualForm.lecServiceCollege ? String(individualForm.lecServiceCollege).trim().toUpperCase() : null,
        labServiceCollege: individualForm.labServiceCollege ? String(individualForm.labServiceCollege).trim().toUpperCase() : null,
        serviceStatus: editingCourse?.serviceStatus || 'pending',
      };

      if (editingCourse?.id) {
        await updateCourse(editingCourse.id, coursePayload);
        if (onSaveSuccess) {
          onSaveSuccess(`Course ${code} updated successfully.`);
        }
      } else {
        await addCourse(coursePayload);
        if (onSaveSuccess) {
          onSaveSuccess(`Course ${code} saved successfully.`);
        }
      }

      // Send notification to Service College Dean(s)
      if (individualForm.lecServiceCollege) {
        notifyServiceCollegeDeans({
          serviceCollegeCode: individualForm.lecServiceCollege,
          motherCollege: collegeName || collegeCode,
          courseCode: coursePayload.code,
          courseTitle: coursePayload.title,
          component: 'Lecture',
          statusType: 'assigned',
        });
      }
      if (individualForm.labServiceCollege) {
        notifyServiceCollegeDeans({
          serviceCollegeCode: individualForm.labServiceCollege,
          motherCollege: collegeName || collegeCode,
          courseCode: coursePayload.code,
          courseTitle: coursePayload.title,
          component: 'Laboratory',
          statusType: 'assigned',
        });
      }

      onClose();
    } catch (err) {
      console.error('Error saving individual course:', err);
      setIndividualError(err.message || 'Failed to save course.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ----------------------------------------------------
  // BULK FILE UPLOAD HANDLER
  // ----------------------------------------------------
  const handleFileUpload = async (file) => {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setParseError('Invalid file format. Please upload an Excel (.xlsx) or CSV file.');
      return;
    }

    setIsParsing(true);
    setParseError('');
    setParseProgress({ stage: 'reading', percent: 3, message: 'Preparing spreadsheet' });
    try {
      const result = await parseBulkCourseSpreadsheet(file, existingCourses, setParseProgress);
      if (!result.rows?.length && result.errors?.length) {
        setParsedRows([]);
        setMappingSource(result.mappingSource || '');
        setParseError(result.errors.join(' '));
        return;
      }
      const resolvedRows = result.rows.map((row) => {
        const targetCollegeCode = row.collegeName || row.programCode
          ? resolveCollegeCode(row.collegeName, row.programCode)
          : collegeCode;
        const lectureServiceCode = row.lecServiceCollegeName ? resolveCollegeCode(row.lecServiceCollegeName) : '';
        const laboratoryServiceCode = row.labServiceCollegeName ? resolveCollegeCode(row.labServiceCollegeName) : '';
        const errors = [...(row.errors || [])];
        if (centralized && !targetCollegeCode) errors.push(`Owning college "${row.collegeName || 'blank'}" was not found`);
        if (row.lecServiceCollegeName && !lectureServiceCode) errors.push(`Lecture service college "${row.lecServiceCollegeName}" was not found`);
        if (row.labServiceCollegeName && !laboratoryServiceCode) errors.push(`Laboratory service college "${row.labServiceCollegeName}" was not found`);
        const targetCollege = allColleges.find((college) => String(college.code || '').toUpperCase() === targetCollegeCode);
        const lectureServiceCollege = allColleges.find((college) => String(college.code || '').toUpperCase() === lectureServiceCode);
        const laboratoryServiceCollege = allColleges.find((college) => String(college.code || '').toUpperCase() === laboratoryServiceCode);
        if (centralized && row.programCode && targetCollege?.programs?.length && !targetCollege.programs.some(
          (program) => String(program.code || '').toUpperCase() === String(row.programCode).toUpperCase()
        )) {
          errors.push(`Program "${row.programCode}" is not registered under ${targetCollegeCode}`);
        }
        return {
          ...row,
          collegeCode: targetCollegeCode,
          resolvedCollegeName: targetCollege?.name || row.collegeName || targetCollegeCode,
          lecServiceCollege: lectureServiceCode,
          labServiceCollege: laboratoryServiceCode,
          resolvedLecServiceCollegeName: lectureServiceCollege?.name || '',
          resolvedLabServiceCollegeName: laboratoryServiceCollege?.name || '',
          errors: [...new Set(errors)],
          isValid: errors.length === 0,
        };
      });
      setParseProgress({ stage: 'validation', percent: 94, message: 'Validating colleges, programs, and service assignments' });
      setParsedRows(resolvedRows);
      setMappingSource(result.mappingSource || 'Smart header matching');
      setPreviewPage(1);
      setParseProgress({ stage: 'complete', percent: 100, message: 'Spreadsheet preview is ready' });
    } catch (err) {
      console.error('Error parsing bulk course spreadsheet:', err);
      setParseError(err.message || 'Failed to parse file. Ensure it follows the template format.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDownloadTemplate = () => {
    downloadBulkCourseTemplate(collegeCode);
  };

  // Execute Bulk Import
  const handleBulkImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setParseError('No valid rows to import.');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Import Courses in Bulk?',
      message: `Are you sure you want to import ${validRows.length} course(s) into ${collegeName || collegeCode}?`,
      confirmText: 'Import Courses',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsBulkImporting(true);
    setImportedProgress(0);
    let successCount = 0;

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      try {
        const lUnits = Number(r.lecUnits) || 0;
        const lbUnits = Number(r.labUnits) || 0;
        const tUnits = Number(r.units) || (lUnits + lbUnits) || 3;
        const lHours = r.lecHours !== undefined ? Number(r.lecHours) : lUnits * 1.0;
        const lbHours = r.labHours !== undefined ? Number(r.labHours) : lbUnits * 3.0;
        const tHours = r.totalHours !== undefined ? Number(r.totalHours) : (lHours + lbHours);

        const targetCollegeCode = r.collegeCode || collegeCode;
        const payload = {
          code: r.code.trim().toUpperCase(),
          title: toTitleCase(r.title),
          programCode: r.programCode || defaultProgramCode || '',
          yearLevel: r.yearLevel,
          semester: r.semester,
          lecUnits: lUnits,
          labUnits: lbUnits,
          units: tUnits,
          lecHours: lHours,
          labHours: lbHours,
          totalHours: tHours,
          type: r.type,
          collegeCode: targetCollegeCode,
          requiresServiceCollege: Boolean(r.lecServiceCollege || r.labServiceCollege),
          lecServiceCollege: r.lecServiceCollege || null,
          labServiceCollege: r.labServiceCollege || null,
          rememberedLecServiceCollege: r.lecServiceCollege || null,
          rememberedLabServiceCollege: r.labServiceCollege || null,
        };
        const existing = existingCourses.find((course) =>
          String(course.code || '').toUpperCase() === payload.code &&
          String(course.programCode || '').toUpperCase() === String(payload.programCode || '').toUpperCase() &&
          String(course.collegeCode || '').toUpperCase() === String(payload.collegeCode || '').toUpperCase() &&
          String(course.yearLevel || '') === String(payload.yearLevel || '') &&
          String(course.semester || '') === String(payload.semester || '')
        );
        if (existing?.id) await updateCourse(existing.id, payload);
        else await addCourse(payload);
        successCount++;
        setImportedProgress(Math.round(((i + 1) / validRows.length) * 100));
      } catch (err) {
        console.error(`Failed to import course ${r.code}:`, err);
      }
    }

    setIsBulkImporting(false);
    if (onSaveSuccess) {
      onSaveSuccess(`Successfully imported ${successCount} of ${validRows.length} course(s).`);
    }
    onClose();
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <div className="modal-overlay z-[100]" onClick={isBulkImporting ? undefined : onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl relative animate-modal-pop flex flex-col overflow-hidden ${
          centralized
            ? 'w-[96vw] max-w-[1500px] max-h-[94vh]'
            : 'w-full max-w-3xl max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Tab Navigation Bar */}
        <div className="bg-gray-50/80 border-b border-gray-200 px-6 pt-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-black text-lg text-dark flex items-center gap-2">
                <BookOpen size={20} className="text-[#7A0808]" />
                {editingCourse
                  ? `Edit Course — ${editingCourse.code || ''} (${collegeName || collegeCode})`
                  : `Add Courses — ${collegeName || collegeCode}`}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {editingCourse
                  ? 'Update course details, units, semester, and course type.'
                  : 'Add courses individually or download the template to import subjects in bulk.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isBulkImporting}
              className="p-1 hover:bg-gray-200/60 rounded-lg transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav Tabs */}
          {!editingCourse && (
            <div className="flex items-center gap-2 border-b border-gray-200 -mb-3">
              {!centralized && <button
                type="button"
                onClick={() => setActiveTab('individual')}
                className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  activeTab === 'individual'
                    ? 'border-[#7A0808] text-[#7A0808]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                Individual Course
              </button>}
              <button
                type="button"
                onClick={() => setActiveTab('bulk')}
                className={`px-4 py-2 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'bulk'
                    ? 'border-[#7A0808] text-[#7A0808]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <FileSpreadsheet size={14} /> Bulk Add Courses
              </button>
            </div>
          )}
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          {activeTab === 'individual' ? (
            /* INDIVIDUAL COURSE FORM */
            <form onSubmit={handleIndividualSubmit} className="space-y-4">
              {individualError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs font-bold text-red-700">{individualError}</p>
                </div>
              )}

              {/* Program Selector if College has programs */}
              {programs && programs.length > 0 && (
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#2B3235' }}>
                    Degree Program <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={individualForm.programCode || ''}
                    onChange={(e) => setIndividualForm({ ...individualForm, programCode: e.target.value })}
                    options={programs.map((p) => ({
                      value: p.code,
                      label: `${p.code} — ${p.name || p.code}`,
                    }))}
                    placeholder="Select Program"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#2B3235' }}>
                    Course Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={individualForm.code}
                    onChange={(e) =>
                      setIndividualForm({ ...individualForm, code: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g., IT101, MATH101"
                    className="form-input w-full font-bold uppercase"
                    maxLength={20}
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#2B3235' }}>
                    Course Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={individualForm.title}
                    onChange={(e) => setIndividualForm({ ...individualForm, title: e.target.value })}
                    onBlur={(e) => setIndividualForm({ ...individualForm, title: toTitleCase(e.target.value.trim()) })}
                    placeholder="e.g., Introduction to Programming"
                    className="form-input w-full font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#2B3235' }}>
                    Year Level <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={individualForm.yearLevel}
                    onChange={(e) => setIndividualForm({ ...individualForm, yearLevel: e.target.value })}
                    options={YEAR_LEVELS}
                    placeholder="Select Year Level"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold mb-1.5" style={{ color: '#2B3235' }}>
                    Semester <span className="text-red-500">*</span>
                  </label>
                  <CustomSelect
                    value={individualForm.semester}
                    onChange={(e) => setIndividualForm({ ...individualForm, semester: e.target.value })}
                    options={SEMESTERS}
                    placeholder="Select Semester"
                  />
                </div>
              </div>

              {/* Section 1: Academic Units (Credit Breakdown) */}
              <div className="bg-gray-50/70 border border-gray-200/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-800 uppercase tracking-wider">
                    1. Academic Credit Units
                  </span>
                  <span className="text-[11px] text-gray-500 font-medium">
                    Total units = Lec + Lab Units (Auto-calculated)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ color: '#2B3235' }}>
                      Lecture Units (Lec)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={individualForm.lecUnits}
                      onChange={(e) => {
                        const cleanLec = e.target.value.replace(/[^0-9.]/g, '');
                        const numLec = parseFloat(cleanLec) || 0;
                        const numLab = parseFloat(individualForm.labUnits || '0') || 0;
                        const total = numLec + numLab;
                        const autoLecHours = numLec > 0 ? numLec * 1.0 : 0;
                        const currentLabHours = numLab > 0 ? (parseFloat(individualForm.labHours || '0') || (numLab * 3.0)) : 0;
                        let type = individualForm.type;
                        if (numLab > 0 && numLec > 0) type = 'both';
                        else if (numLab > 0 && numLec === 0) type = 'laboratory';
                        else if (numLec > 0 && numLab === 0) type = 'lecture';
                        setIndividualForm({
                          ...individualForm,
                          lecUnits: cleanLec,
                          units: String(total),
                          lecHours: String(autoLecHours),
                          totalHours: String(autoLecHours + currentLabHours),
                          type,
                        });
                      }}
                      placeholder="3"
                      className="form-input w-full font-bold bg-white text-center text-xs py-1.5"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ color: '#2B3235' }}>
                      Laboratory Units (Lab)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={individualForm.labUnits}
                      onChange={(e) => {
                        const cleanLab = e.target.value.replace(/[^0-9.]/g, '');
                        const numLab = parseFloat(cleanLab) || 0;
                        const numLec = parseFloat(individualForm.lecUnits || '0') || 0;
                        const total = numLec + numLab;
                        const autoLabHours = numLab > 0 ? numLab * 3.0 : 0;
                        const currentLecHours = numLec > 0 ? (parseFloat(individualForm.lecHours || '0') || (numLec * 1.0)) : 0;
                        let type = individualForm.type;
                        if (numLab > 0 && numLec > 0) type = 'both';
                        else if (numLab > 0 && numLec === 0) type = 'laboratory';
                        else if (numLec > 0 && numLab === 0) type = 'lecture';
                        setIndividualForm({
                          ...individualForm,
                          labUnits: cleanLab,
                          units: String(total),
                          labHours: String(autoLabHours),
                          totalHours: String(currentLecHours + autoLabHours),
                          type,
                        });
                      }}
                      placeholder="0"
                      className="form-input w-full font-bold bg-white text-center text-xs py-1.5"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ color: '#2B3235' }}>
                      Total Units <span className="text-gray-400 font-normal">(Disabled)</span>
                    </label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={individualForm.units}
                      className="form-input w-full font-black bg-gray-100 text-gray-800 cursor-not-allowed text-center text-xs py-1.5 border-dashed"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ color: '#2B3235' }}>
                      Course Type <span className="text-red-500">*</span>
                    </label>
                    <CustomSelect
                      size="sm"
                      value={individualForm.type}
                      onChange={(e) => setIndividualForm({ ...individualForm, type: e.target.value })}
                      options={COURSE_TYPES}
                      placeholder="Select Type"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Required Contact Hours (Weekly Duration) - Conditional on Lec/Lab Units */}
              {(parseFloat(individualForm.lecUnits || '0') > 0 || parseFloat(individualForm.labUnits || '0') > 0) && (
                <div className="bg-amber-50/40 border border-amber-200/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-950 uppercase tracking-wider">
                      2. Required Contact Hours (Weekly Duration)
                    </span>
                    <span className="text-[11px] text-amber-800/80 font-medium">
                      Standard: 1 Lec unit = 1 hr/wk, 1 Lab unit = 3 hrs/wk
                    </span>
                  </div>

                  <div className={`grid grid-cols-1 ${
                    parseFloat(individualForm.lecUnits || '0') > 0 && parseFloat(individualForm.labUnits || '0') > 0
                      ? 'sm:grid-cols-3'
                      : 'sm:grid-cols-2'
                  } gap-3`}>
                    {/* Only ask for Lec Hours if Lec Units > 0 */}
                    {parseFloat(individualForm.lecUnits || '0') > 0 && (
                      <div>
                        <label className="block text-[11px] font-bold mb-1 text-gray-700">
                          Lecture Contact Hours / Wk
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={individualForm.lecHours}
                          onChange={(e) => {
                            const cleanLecH = e.target.value.replace(/[^0-9.]/g, '');
                            const numLecH = parseFloat(cleanLecH) || 0;
                            const numLabH = parseFloat(individualForm.labHours || '0') || 0;
                            setIndividualForm({
                              ...individualForm,
                              lecHours: cleanLecH,
                              totalHours: String(numLecH + numLabH),
                            });
                          }}
                          placeholder="3"
                          className="form-input w-full font-bold bg-white text-center text-xs py-1.5"
                        />
                      </div>
                    )}

                    {/* Only ask for Lab Hours if Lab Units > 0 */}
                    {parseFloat(individualForm.labUnits || '0') > 0 && (
                      <div>
                        <label className="block text-[11px] font-bold mb-1 text-gray-700">
                          Laboratory Contact Hours / Wk
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={individualForm.labHours}
                          onChange={(e) => {
                            const cleanLabH = e.target.value.replace(/[^0-9.]/g, '');
                            const numLabH = parseFloat(cleanLabH) || 0;
                            const numLecH = parseFloat(individualForm.lecHours || '0') || 0;
                            setIndividualForm({
                              ...individualForm,
                              labHours: cleanLabH,
                              totalHours: String(numLecH + numLabH),
                            });
                          }}
                          placeholder="3"
                          className="form-input w-full font-bold bg-white text-center text-xs py-1.5"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-bold mb-1 text-gray-700">
                        Total Weekly Hours <span className="text-gray-400 font-normal">(Disabled)</span>
                      </label>
                      <input
                        type="text"
                        disabled
                        readOnly
                        value={individualForm.totalHours}
                        className="form-input w-full font-black bg-amber-100/50 text-amber-900 cursor-not-allowed text-center text-xs py-1.5 border-dashed"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3: Service College (Inter-College Teaching Assignment) */}
              <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 size={14} className="text-indigo-700" />
                    Service College Assignment (Optional)
                  </span>
                  {(individualForm.lecServiceCollege || individualForm.labServiceCollege) && (
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-100 text-purple-900 border border-purple-300">
                      🏛️ Inter-College Serviced
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-indigo-900/80 font-medium">
                  If faculty from another college will teach this subject (e.g. IT teaching Programming for Dentistry), designate the Service College below:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Lecture Service College */}
                  {parseFloat(individualForm.lecUnits || '0') > 0 && (
                    <div>
                      <label className="block text-[11px] font-bold mb-1 text-indigo-950">
                        {parseFloat(individualForm.labUnits || '0') > 0 ? 'Lecture Service College' : 'Service College (Taught By)'}
                      </label>
                      <select
                        value={individualForm.lecServiceCollege || ''}
                        onChange={(e) => setIndividualForm({ ...individualForm, lecServiceCollege: e.target.value })}
                        className="form-input bg-white text-xs font-semibold py-1.5 px-2.5 rounded-xl border border-indigo-200 focus:border-[#7A0808] w-full"
                      >
                        <option value="">{collegeName || collegeCode || 'Own College'} (Default / Internal)</option>
                        {allColleges
                          .filter((c) => c.code !== collegeCode && c.name !== collegeName)
                          .map((c) => (
                            <option key={c.id || c.code} value={c.code || c.name}>
                              {c.code} - {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* Lab Service College */}
                  {parseFloat(individualForm.labUnits || '0') > 0 && (
                    <div>
                      <label className="block text-[11px] font-bold mb-1 text-indigo-950">
                        {parseFloat(individualForm.lecUnits || '0') > 0 ? 'Laboratory Service College' : 'Service College (Taught By)'}
                      </label>
                      <select
                        value={individualForm.labServiceCollege || ''}
                        onChange={(e) => setIndividualForm({ ...individualForm, labServiceCollege: e.target.value })}
                        className="form-input bg-white text-xs font-semibold py-1.5 px-2.5 rounded-xl border border-indigo-200 focus:border-[#7A0808] w-full"
                      >
                        <option value="">{collegeName || collegeCode || 'Own College'} (Default / Internal)</option>
                        {allColleges
                          .filter((c) => c.code !== collegeCode && c.name !== collegeName)
                          .map((c) => (
                            <option key={c.id || c.code} value={c.code || c.name}>
                              {c.code} - {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-100 font-bold">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-outline-maroon flex-1 justify-center py-2.5"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-maroon flex-1 flex items-center justify-center gap-2 py-2.5 shadow-md"
                  disabled={isSubmitting}
                >
                  <Plus size={16} /> {isSubmitting ? 'Saving...' : editingCourse ? 'Update Course' : 'Save Course'}
                </button>
              </div>
            </form>
          ) : (
            /* BULK ADD COURSES TAB */
            <div className="space-y-5">
              {parseError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs font-bold text-red-700">{parseError}</p>
                </div>
              )}

              {/* Step 1 & 2 Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Download Template Box */}
                <div className="bg-red-50/50 border border-red-100 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 font-bold text-xs text-[#7A0808]">
                    <Download size={16} />
                    <span>Step 1: Download Dynamic Excel Template</span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Download the pre-formatted Excel template with embedded dropdown rules for Year Level, Semester, and Course Type.
                  </p>
                  <button
                    type="button"
                    onClick={() => downloadBulkCourseTemplate(collegeCode)}
                    className="btn-outline-maroon font-bold text-xs py-2 px-3.5 w-full flex items-center justify-center gap-2"
                  >
                    <Download size={14} /> Download (.xlsx) Template
                  </button>
                </div>

                {/* File Upload Dropzone */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                    isDragOver
                      ? 'border-[#7A0808] bg-red-50/70'
                      : 'border-gray-300 hover:border-[#7A0808] bg-gray-50/50'
                  }`}
                >
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    id="bulkCourseFile"
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
                  />
                  <label htmlFor="bulkCourseFile" className="cursor-pointer flex flex-col items-center">
                    <Upload size={22} className="text-[#7A0808] mb-1" />
                    <span className="font-bold text-xs text-gray-800">
                      Step 2: Upload Excel / CSV Sheet
                    </span>
                    <span className="text-[10px] text-gray-400 mt-0.5">
                      Drag & drop your completed file here or click to browse
                    </span>
                  </label>
                </div>
              </div>

              {/* Parsing Loader */}
              {isParsing && (
                <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <RefreshCw size={22} className="animate-spin text-[#7A0808] shrink-0" />
                      <div>
                        <p className="font-bold text-sm text-gray-800">{parseProgress.message}</p>
                        <p className="mt-0.5 text-[11px] text-gray-500">Please keep this window open while the spreadsheet is prepared.</p>
                      </div>
                    </div>
                    <span className="text-sm font-black text-[#7A0808]">{parseProgress.percent}%</span>
                  </div>
                  <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#7A0808] to-[#B91C1C] transition-[width] duration-500 ease-out"
                      style={{ width: `${parseProgress.percent}%` }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {[
                      ['Reading file', 8],
                      ['Finding headers', 35],
                      ['Mapping columns', 48],
                      ['Processing rows', 65],
                      ['Combining components', 82],
                      ['Validating data', 94],
                    ].map(([label, threshold]) => {
                      const done = parseProgress.percent > threshold;
                      const active = parseProgress.percent >= threshold && !done;
                      return (
                        <div key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-bold ${
                          done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : active ? 'border-red-200 bg-red-50 text-[#7A0808]' : 'border-gray-200 bg-white text-gray-400'
                        }`}>
                          {done ? <CheckCircle2 size={13} /> : active ? <RefreshCw size={13} className="animate-spin" /> : <span className="h-3 w-3 rounded-full border border-current" />}
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Parsed Preview Table with Horizontal & Vertical Scroll */}
              {!isParsing && parsedRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-xs text-gray-800">
                        Spreadsheet Preview ({parsedRows.length} total)
                      </span>
                      {mappingSource && (
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px]">
                          {mappingSource}
                        </span>
                      )}
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]">
                        {validCount} Valid
                      </span>
                      {invalidCount > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold text-[10px]">
                          {invalidCount} Invalid
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setParsedRows([]); setPreviewPage(1); }}
                      className="text-xs text-gray-400 hover:text-red-600 font-bold"
                    >
                      Clear File
                    </button>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
                      <input
                        value={previewSearch}
                        onChange={(e) => setPreviewSearch(e.target.value)}
                        placeholder="Search code, title..."
                        className="form-input text-[11px] xl:col-span-2"
                      />
                      <select value={previewStatus} onChange={(e) => setPreviewStatus(e.target.value)} className="form-input text-[11px]">
                        <option value="all">All Statuses</option><option value="invalid">Invalid Only</option><option value="valid">Valid Only</option>
                      </select>
                      <select value={previewCollege} onChange={(e) => { setPreviewCollege(e.target.value); setPreviewProgram(''); }} className="form-input text-[11px]">
                        <option value="">All Colleges</option>{previewFilterOptions.colleges.map((value) => <option key={value}>{value}</option>)}
                      </select>
                      <select value={previewProgram} onChange={(e) => setPreviewProgram(e.target.value)} className="form-input text-[11px]">
                        <option value="">All Programs</option>{previewFilterOptions.programs.map((value) => <option key={value}>{value}</option>)}
                      </select>
                      <select value={previewYear} onChange={(e) => setPreviewYear(e.target.value)} className="form-input text-[11px]">
                        <option value="">All Years</option>{previewFilterOptions.years.map((value) => <option key={value}>{value}</option>)}
                      </select>
                      <select value={previewSemester} onChange={(e) => setPreviewSemester(e.target.value)} className="form-input text-[11px]">
                        <option value="">All Semesters</option>{previewFilterOptions.semesters.map((value) => <option key={value}>{value}</option>)}
                      </select>
                      <select value={previewSort} onChange={(e) => setPreviewSort(e.target.value)} className="form-input text-[11px]">
                        <option value="row">Original Order</option><option value="code">Code A–Z</option><option value="code-desc">Code Z–A</option><option value="title">Title A–Z</option><option value="college">College A–Z</option><option value="program">Program A–Z</option><option value="year">Year Level</option><option value="semester">Semester</option>
                      </select>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-semibold text-gray-500">
                      <span>Showing {filteredPreviewRows.length} of {parsedRows.length} rows</span>
                      <button type="button" onClick={() => { setPreviewSearch(''); setPreviewStatus('all'); setPreviewCollege(''); setPreviewProgram(''); setPreviewYear(''); setPreviewSemester(''); setPreviewSort('row'); }} className="font-bold text-[#7A0808] hover:underline">Clear Filters</button>
                    </div>
                  </div>

                  <div className={`border border-gray-200 rounded-xl overflow-auto shadow-2xs ${centralized ? 'max-h-[55vh]' : 'max-h-72'}`}>
                    <table className={`w-full text-left text-xs ${centralized ? 'min-w-[1420px]' : 'min-w-[1320px]'}`}>
                      <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 w-10 text-center">#</th>
                          <th className="p-2.5 min-w-[100px]">Code</th>
                          <th className="p-2.5 min-w-[180px]">Title</th>
                          {centralized && <th className="p-2.5 min-w-[150px]">Owning College</th>}
                          <th className="p-2.5 min-w-[100px]">Program</th>
                          <th className="p-2.5 min-w-[110px]">Year Level</th>
                          <th className="p-2.5 min-w-[120px]">Semester</th>
                          <th className="p-2.5 w-14 text-center">Lec U</th>
                          <th className="p-2.5 w-14 text-center">Lab U</th>
                          <th className="p-2.5 w-14 text-center">Total U</th>
                          <th className="p-2.5 w-16 text-center">Lec Hr</th>
                          <th className="p-2.5 w-16 text-center">Lab Hr</th>
                          <th className="p-2.5 min-w-[110px]">Type</th>
                          <th className="p-2.5 min-w-[180px]">Component Service</th>
                          <th className="p-2.5 min-w-[260px]">Status / Required Corrections</th>
                          <th className="p-2.5 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {visiblePreviewRows.map((row, idx) => (
                          <tr key={row.id} className={!row.isValid ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                            <td className="p-2.5 text-center font-bold text-gray-400">{(previewPage - 1) * previewPageSize + idx + 1}</td>
                            <td className="p-2">
                              <input
                                type="text"
                                className="form-input bg-white text-xs font-bold uppercase py-1"
                                value={row.code}
                                onChange={(e) => updateParsedRow(row.id, 'code', e.target.value.toUpperCase())}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                className="form-input bg-white text-xs font-semibold py-1"
                                value={row.title}
                                onChange={(e) => updateParsedRow(row.id, 'title', e.target.value)}
                              />
                            </td>
                            {centralized && (
                              <td className="p-2 font-bold text-[#7A0808]">{row.resolvedCollegeName || row.collegeName || 'Unresolved'}</td>
                            )}
                            <td className="p-2 font-bold text-gray-700">{row.programCode || '—'}</td>
                            <td className="p-2 min-w-[115px]">
                              <CustomSelect
                                size="sm"
                                value={row.yearLevel}
                                onChange={(e) => updateParsedRow(row.id, 'yearLevel', e.target.value)}
                                options={YEAR_LEVELS}
                                placeholder="Year Level"
                              />
                            </td>
                            <td className="p-2 min-w-[125px]">
                              <CustomSelect
                                size="sm"
                                value={row.semester}
                                onChange={(e) => updateParsedRow(row.id, 'semester', e.target.value)}
                                options={SEMESTERS}
                                placeholder="Semester"
                              />
                            </td>
                            <td className="p-2 text-center min-w-[55px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="form-input bg-white text-xs font-bold text-center py-1 w-12 mx-auto"
                                value={row.lecUnits !== undefined ? row.lecUnits : 3}
                                onChange={(e) => updateParsedRow(row.id, 'lecUnits', e.target.value.replace(/[^0-9.]/g, ''))}
                                placeholder="3"
                              />
                            </td>
                            <td className="p-2 text-center min-w-[55px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="form-input bg-white text-xs font-bold text-center py-1 w-12 mx-auto"
                                value={row.labUnits !== undefined ? row.labUnits : 0}
                                onChange={(e) => updateParsedRow(row.id, 'labUnits', e.target.value.replace(/[^0-9.]/g, ''))}
                                placeholder="0"
                              />
                            </td>
                            <td className="p-2 text-center min-w-[55px]">
                              <span className="font-black text-gray-800 text-xs">
                                {row.units || 3}
                              </span>
                            </td>
                            <td className="p-2 text-center min-w-[60px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="form-input bg-white text-xs font-bold text-center py-1 w-12 mx-auto"
                                value={row.lecHours !== undefined ? row.lecHours : (Number(row.lecUnits || 3) * 1.0)}
                                onChange={(e) => updateParsedRow(row.id, 'lecHours', e.target.value.replace(/[^0-9.]/g, ''))}
                                placeholder="3"
                              />
                            </td>
                            <td className="p-2 text-center min-w-[60px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                className="form-input bg-white text-xs font-bold text-center py-1 w-12 mx-auto"
                                value={row.labHours !== undefined ? row.labHours : (Number(row.labUnits || 0) * 3.0)}
                                onChange={(e) => updateParsedRow(row.id, 'labHours', e.target.value.replace(/[^0-9.]/g, ''))}
                                placeholder="0"
                              />
                            </td>
                            <td className="p-2 min-w-[130px]">
                              <CustomSelect
                                size="sm"
                                value={row.type}
                                onChange={(e) => updateParsedRow(row.id, 'type', e.target.value)}
                                options={COURSE_TYPES}
                                placeholder="Course Type"
                              />
                            </td>
                            <td className="p-2 text-[10px] leading-relaxed">
                              {row.lecServiceCollege && <span className="block font-bold text-[#7A0808]" title={`Sheet: ${row.lecServiceCollegeName || '—'} → Resolved: ${row.resolvedLecServiceCollegeName || row.lecServiceCollege}`}>Lec: {row.resolvedLecServiceCollegeName || row.lecServiceCollege}</span>}
                              {row.labServiceCollege && <span className="block font-bold text-[#7A0808]" title={`Sheet: ${row.labServiceCollegeName || '—'} → Resolved: ${row.resolvedLabServiceCollegeName || row.labServiceCollege}`}>Lab: {row.resolvedLabServiceCollegeName || row.labServiceCollege}</span>}
                              {(row.lecServiceCollegeName || row.labServiceCollegeName) && (
                                <span className="mt-0.5 block max-w-[220px] truncate text-[9px] font-medium text-gray-400" title={`Original sheet value: ${row.lecServiceCollegeName || row.labServiceCollegeName}`}>
                                  Sheet: {row.lecServiceCollegeName || row.labServiceCollegeName}
                                </span>
                              )}
                              {!row.lecServiceCollege && !row.labServiceCollege && <span className="text-gray-400">Internal</span>}
                            </td>
                            <td className="p-2">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px]">
                                  <CheckCircle2 size={12} /> Ready
                                </span>
                              ) : (
                                <div className="space-y-0.5">
                                  {row.errors.map((err, errIdx) => (
                                    <span key={errIdx} className="block text-red-600 font-bold text-[10px]">
                                      • {err}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeParsedRow(row.id)}
                                className="p-1 text-gray-400 hover:text-red-600 rounded"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px]">
                    <div className="flex items-center gap-2 text-gray-600">
                      <span>Rows per page</span>
                      <select value={previewPageSize} onChange={(e) => setPreviewPageSize(Number(e.target.value))} className="rounded-lg border border-gray-200 bg-white px-2 py-1 font-bold">
                        {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </div>
                    <div className="font-semibold text-gray-600">
                      Page {Math.min(previewPage, previewPageCount)} of {previewPageCount} · {filteredPreviewRows.length} filtered row(s)
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" disabled={previewPage <= 1} onClick={() => setPreviewPage(1)} className="rounded-lg border border-gray-200 bg-white px-2 py-1 font-bold text-[#7A0808] disabled:opacity-40">First</button>
                      <button type="button" disabled={previewPage <= 1} onClick={() => setPreviewPage((page) => Math.max(1, page - 1))} className="rounded-lg border border-gray-200 bg-white px-2 py-1 font-bold text-[#7A0808] disabled:opacity-40">Previous</button>
                      <button type="button" disabled={previewPage >= previewPageCount} onClick={() => setPreviewPage((page) => Math.min(previewPageCount, page + 1))} className="rounded-lg border border-gray-200 bg-white px-2 py-1 font-bold text-[#7A0808] disabled:opacity-40">Next</button>
                      <button type="button" disabled={previewPage >= previewPageCount} onClick={() => setPreviewPage(previewPageCount)} className="rounded-lg border border-gray-200 bg-white px-2 py-1 font-bold text-[#7A0808] disabled:opacity-40">Last</button>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>

        {activeTab === 'bulk' && parsedRows.length > 0 && !isParsing && (
          <div className="flex flex-shrink-0 items-center justify-between border-t border-gray-200 bg-white px-6 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
            <span className="text-xs font-medium text-gray-500">
              {validCount > 0 ? `Ready to add ${validCount} course(s)` : 'Fix validation errors above before importing'}
            </span>
            <button type="button" onClick={handleBulkImport} disabled={validCount === 0 || isBulkImporting} className="btn-maroon flex items-center gap-2 px-5 py-2.5 text-xs font-bold shadow-md disabled:opacity-50">
              <Plus size={16} /><span>Import {validCount} Courses</span>
            </button>
          </div>
        )}

        {isBulkImporting && (
          <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-[2px]" onClick={(event) => event.stopPropagation()}>
            <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 text-center shadow-2xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-[#7A0808]">
                <RefreshCw size={26} className="animate-spin" />
              </div>
              <h4 className="mt-4 text-lg font-black text-gray-900">Importing Courses</h4>
              <p className="mt-1 text-xs font-medium text-gray-500">Saving validated course records and service-college assignments. Please do not close or refresh this page.</p>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-gradient-to-r from-[#7A0808] to-red-600 transition-[width] duration-300" style={{ width: `${importedProgress}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-bold">
                <span className="text-gray-500">{Math.min(validCount, Math.round((importedProgress / 100) * validCount))} of {validCount} courses</span>
                <span className="text-[#7A0808]">{importedProgress}%</span>
              </div>
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">Actions are temporarily disabled until the import finishes.</div>
            </div>
          </div>
        )}
      </div>

      {/* Global Confirmation & Notification Modal */}
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />
    </div>
  );
}
