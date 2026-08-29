import React, { useState, useEffect } from 'react';
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
}) {
  const [activeTab, setActiveTab] = useState('individual'); // 'individual' | 'bulk'
  const [allColleges, setAllColleges] = useState([]);

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
  }, [editingCourse, defaultProgramCode, programs]);

  // Bulk Upload State
  const [isDragOver, setIsDragOver] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [importedProgress, setImportedProgress] = useState(0);

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
    try {
      const result = await parseBulkCourseSpreadsheet(file, existingCourses);
      setParsedRows(result.rows);
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

        await addCourse({
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
          collegeCode,
        });
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
    <div className="modal-overlay z-[100]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full relative animate-modal-pop max-h-[90vh] flex flex-col overflow-hidden"
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
              className="p-1 hover:bg-gray-200/60 rounded-lg transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav Tabs */}
          {!editingCourse && (
            <div className="flex items-center gap-2 border-b border-gray-200 -mb-3">
              <button
                type="button"
                onClick={() => setActiveTab('individual')}
                className={`px-4 py-2 text-xs font-bold transition-all border-b-2 cursor-pointer ${
                  activeTab === 'individual'
                    ? 'border-[#7A0808] text-[#7A0808]'
                    : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                Individual Course
              </button>
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
                <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-100">
                  <RefreshCw size={24} className="animate-spin text-[#7A0808] mx-auto mb-2" />
                  <p className="font-bold text-xs text-gray-700">Reading and validating course spreadsheet...</p>
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
                      onClick={() => setParsedRows([])}
                      className="text-xs text-gray-400 hover:text-red-600 font-bold"
                    >
                      Clear File
                    </button>
                  </div>

                  <div className="border border-gray-200 rounded-xl overflow-x-auto overflow-y-auto max-h-72 shadow-2xs">
                    <table className="w-full text-left text-xs min-w-[980px]">
                      <thead className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider text-[10px] sticky top-0 z-10">
                        <tr>
                          <th className="p-2.5 w-10 text-center">#</th>
                          <th className="p-2.5 min-w-[100px]">Code</th>
                          <th className="p-2.5 min-w-[180px]">Title</th>
                          <th className="p-2.5 min-w-[110px]">Year Level</th>
                          <th className="p-2.5 min-w-[120px]">Semester</th>
                          <th className="p-2.5 w-14 text-center">Lec U</th>
                          <th className="p-2.5 w-14 text-center">Lab U</th>
                          <th className="p-2.5 w-14 text-center">Total U</th>
                          <th className="p-2.5 w-16 text-center">Lec Hr</th>
                          <th className="p-2.5 w-16 text-center">Lab Hr</th>
                          <th className="p-2.5 min-w-[110px]">Type</th>
                          <th className="p-2.5 min-w-[110px]">Status</th>
                          <th className="p-2.5 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-medium">
                        {parsedRows.map((row, idx) => (
                          <tr key={row.id} className={!row.isValid ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                            <td className="p-2.5 text-center font-bold text-gray-400">{idx + 1}</td>
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

                  {/* Bulk Import Action Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500 font-medium">
                      {validCount > 0
                        ? `Ready to add ${validCount} course(s)`
                        : 'Fix validation errors above before importing'}
                    </span>
                    <button
                      type="button"
                      onClick={handleBulkImport}
                      disabled={validCount === 0 || isBulkImporting}
                      className="btn-maroon font-bold text-xs px-5 py-2.5 flex items-center gap-2 shadow-md disabled:opacity-50"
                    >
                      {isBulkImporting ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Importing ({importedProgress}/{validCount})...</span>
                        </>
                      ) : (
                        <>
                          <Plus size={16} />
                          <span>Import {validCount} Courses</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
