import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  BookOpen,
  Layers,
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { addCollege, updateCollege } from '../../services/collegeService';
import { addCourse, subscribeCollegeCourses } from '../../services/courseService';
import {
  downloadBulkCourseTemplate,
  parseBulkCourseSpreadsheet,
  toTitleCase,
} from '../../utils/excelTemplate';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer'];
const COURSE_TYPES = [
  { value: 'lecture', label: 'Lecture Only' },
  { value: 'laboratory', label: 'Laboratory Only' },
  { value: 'both', label: 'Both (Lecture & Lab)' },
];

const createEmptyCourse = () => ({
  id: `crs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  code: '',
  title: '',
  yearLevel: '1st Year',
  semester: '1st Semester',
  units: '3',
  type: 'lecture',
});

const createEmptyProgram = () => ({
  id: `prg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  code: '',
  name: '',
  courses: [createEmptyCourse()],
});

export default function AddCollegeModal({ onClose, onSaveSuccess, colleges = [], editingCollege = null }) {
  const [form, setForm] = useState({
    code: editingCollege?.code || '',
    name: editingCollege?.name || '',
    programs: editingCollege?.programs?.length
      ? editingCollege.programs.map((p) => ({
          id: p.id || `prg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          code: p.code || '',
          name: p.name || '',
          courses: p.courses?.length ? p.courses : [createEmptyCourse()],
        }))
      : [createEmptyProgram()],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Tab state per program index: { 0: 'individual', 1: 'bulk' }
  const [programCourseTabs, setProgramCourseTabs] = useState({ 0: 'individual' });

  // Bulk Upload State per program index
  const [isDragOver, setIsDragOver] = useState({});
  const [bulkError, setBulkError] = useState({});
  const [isParsing, setIsParsing] = useState({});
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState({});

  // If editing an existing college, fetch its existing courses to populate the programs
  useEffect(() => {
    if (!editingCollege?.code) return;
    const unsub = subscribeCollegeCourses(
      editingCollege.code,
      (existingCourses) => {
        if (existingCourses && existingCourses.length > 0) {
          setForm((prev) => {
            const updatedPrograms = [...prev.programs];
            if (updatedPrograms.length === 0) updatedPrograms.push(createEmptyProgram());

            existingCourses.forEach((crs) => {
              const matchedPrgIdx = updatedPrograms.findIndex(
                (p) => p.code && crs.programCode && p.code.toUpperCase() === crs.programCode.toUpperCase()
              );
              const targetIdx = matchedPrgIdx !== -1 ? matchedPrgIdx : 0;
              const existsInPrg = updatedPrograms[targetIdx].courses.some(
                (c) => c.code && c.code.toUpperCase() === crs.code.toUpperCase()
              );
              if (!existsInPrg) {
                const formattedCrs = {
                  ...crs,
                  title: toTitleCase(crs.title),
                  semester: crs.semester || '1st Semester',
                  units: String(crs.units || 3),
                };
                if (
                  updatedPrograms[targetIdx].courses.length === 1 &&
                  !updatedPrograms[targetIdx].courses[0].code
                ) {
                  updatedPrograms[targetIdx].courses = [formattedCrs];
                } else {
                  updatedPrograms[targetIdx].courses.push(formattedCrs);
                }
              }
            });

            return { ...prev, programs: updatedPrograms };
          });
        }
      },
      (err) => console.error('Error loading existing courses for college edit:', err)
    );
    return unsub;
  }, [editingCollege]);

  const setCourseTabForProgram = (pIdx, tab) => {
    setProgramCourseTabs((prev) => ({ ...prev, [pIdx]: tab }));
  };

  // Program Management Helpers
  const addProgram = () => {
    setForm((prev) => ({
      ...prev,
      programs: [...prev.programs, createEmptyProgram()],
    }));
  };

  const removeProgram = (pIdx) => {
    if (form.programs.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      programs: prev.programs.filter((_, idx) => idx !== pIdx),
    }));
  };

  const updateProgramField = (pIdx, field, value) => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      const val = field === 'name' ? toTitleCase(value) : value.toUpperCase();
      updatedPrgs[pIdx] = { ...updatedPrgs[pIdx], [field]: val };
      return { ...prev, programs: updatedPrgs };
    });
  };

  // Course Management Helpers per Program
  const addCourseToProgram = (pIdx) => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      updatedPrgs[pIdx] = {
        ...updatedPrgs[pIdx],
        courses: [...updatedPrgs[pIdx].courses, createEmptyCourse()],
      };
      return { ...prev, programs: updatedPrgs };
    });
  };

  const removeCourseFromProgram = (pIdx, cIdx) => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      const updatedCourses = updatedPrgs[pIdx].courses.filter((_, idx) => idx !== cIdx);
      updatedPrgs[pIdx] = { ...updatedPrgs[pIdx], courses: updatedCourses };
      return { ...prev, programs: updatedPrgs };
    });
  };

  const updateCourseField = (pIdx, cIdx, field, value) => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      const updatedCourses = [...updatedPrgs[pIdx].courses];
      let val = value;
      if (field === 'code') val = value.toUpperCase();
      if (field === 'title') val = toTitleCase(value);
      updatedCourses[cIdx] = { ...updatedCourses[cIdx], [field]: val };
      updatedPrgs[pIdx] = { ...updatedPrgs[pIdx], courses: updatedCourses };
      return { ...prev, programs: updatedPrgs };
    });
  };

  // Handle Sheet File Upload for Program Courses: AUTOMATICALLY POPULATES COURSES!
  const handleProgramSheetUpload = async (file, pIdx) => {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setBulkError((prev) => ({
        ...prev,
        [pIdx]: 'Invalid file format. Please upload an Excel (.xlsx) or CSV file.',
      }));
      return;
    }

    setIsParsing((prev) => ({ ...prev, [pIdx]: true }));
    setBulkError((prev) => ({ ...prev, [pIdx]: '' }));
    setBulkSuccessMsg((prev) => ({ ...prev, [pIdx]: '' }));

    try {
      const result = await parseBulkCourseSpreadsheet(file);
      const validRows = result.rows.filter((r) => r.isValid);

      if (validRows.length === 0) {
        setBulkError((prev) => ({
          ...prev,
          [pIdx]: 'No valid course data found in the spreadsheet.',
        }));
        setIsParsing((prev) => ({ ...prev, [pIdx]: false }));
        return;
      }

      const formattedNewCourses = validRows.map((r) => ({
        id: `crs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        code: r.code.trim().toUpperCase(),
        title: toTitleCase(r.title),
        yearLevel: r.yearLevel,
        semester: r.semester,
        units: String(r.units),
        type: r.type,
      }));

      // AUTOMATICALLY POPULATE INTO form.programs[pIdx].courses
      setForm((prev) => {
        const updatedPrgs = [...prev.programs];
        if (updatedPrgs[pIdx]) {
          const existingNonEmpty = updatedPrgs[pIdx].courses.filter((c) => c.code.trim() !== '');
          updatedPrgs[pIdx] = {
            ...updatedPrgs[pIdx],
            courses: [...existingNonEmpty, ...formattedNewCourses],
          };
        }
        return { ...prev, programs: updatedPrgs };
      });

      // Show success message and automatically switch tab to 'individual' so the user sees all populated subjects!
      setBulkSuccessMsg((prev) => ({
        ...prev,
        [pIdx]: `Successfully imported and populated ${validRows.length} subject(s) into this program!`,
      }));

      // Automatically switch to 'individual' tab to view populated subjects
      setCourseTabForProgram(pIdx, 'individual');
    } catch (err) {
      console.error('Error parsing program course sheet:', err);
      setBulkError((prev) => ({
        ...prev,
        [pIdx]: err.message || 'Failed to parse course spreadsheet.',
      }));
    } finally {
      setIsParsing((prev) => ({ ...prev, [pIdx]: false }));
    }
  };

  const handleDrop = (e, pIdx) => {
    e.preventDefault();
    setIsDragOver((prev) => ({ ...prev, [pIdx]: false }));
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProgramSheetUpload(e.dataTransfer.files[0], pIdx);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const code = form.code.trim().toUpperCase();
    const name = toTitleCase(form.name);

    if (!name) {
      setError('College Name is required.');
      return;
    }
    if (!code) {
      setError('College Code is required.');
      return;
    }

    if (!editingCollege || editingCollege.code !== code) {
      const duplicate = colleges.find((c) => c.code.toLowerCase() === code.toLowerCase());
      if (duplicate) {
        setError(`A college with code "${code}" already exists.`);
        return;
      }
    }

    // Validate Programs
    for (let i = 0; i < form.programs.length; i++) {
      const prg = form.programs[i];
      const prgNum = form.programs.length > 1 ? ` (Program #${i + 1})` : '';
      if (!prg.code.trim()) {
        setError(`Program Code is required${prgNum}.`);
        return;
      }
      if (!prg.name.trim()) {
        setError(`Program Name / Title is required${prgNum}.`);
        return;
      }
    }

    setLoading(true);
    try {
      const cleanPrograms = form.programs.map((p) => ({
        code: p.code.trim().toUpperCase(),
        name: toTitleCase(p.name),
      }));

      if (editingCollege) {
        await updateCollege(editingCollege.id, {
          code,
          name,
          programs: cleanPrograms,
        });
      } else {
        await addCollege({
          code,
          name,
          programs: cleanPrograms,
        });
      }

      // Save/Write all courses inside programs to Firestore
      for (const prg of form.programs) {
        const prgCode = prg.code.trim().toUpperCase();
        for (const crs of prg.courses) {
          if (crs.code.trim() && crs.title.trim()) {
            await addCourse({
              code: crs.code.trim().toUpperCase(),
              title: toTitleCase(crs.title),
              yearLevel: crs.yearLevel || '1st Year',
              semester: crs.semester || '1st Semester',
              units: parseFloat(crs.units) || 3,
              type: crs.type || 'lecture',
              collegeCode: code,
              programCode: prgCode,
            });
          }
        }
      }

      if (onSaveSuccess) {
        onSaveSuccess(code);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save college.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay z-[100]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full relative animate-modal-pop max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="bg-gray-50/80 border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-black text-lg text-dark">
              {editingCollege ? 'Edit College & Programs' : 'Add New College'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Enter college details, programs offered, and courses/subjects offered inside each program.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-200/60 rounded-lg transition-colors text-gray-400 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs font-bold text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section 1: College Details */}
            <div className="space-y-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
              <h4 className="font-bold text-xs text-[#7A0808] uppercase tracking-wider flex items-center gap-1.5">
                <Layers size={14} /> College Information
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="form-label font-bold text-gray-700 mb-1">
                    College Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: toTitleCase(e.target.value) })}
                    placeholder="e.g., College of Engineering & Tech"
                    className="form-input w-full font-bold"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="form-label font-bold text-gray-700 mb-1">
                    College Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., CEIT"
                    className="form-input w-full font-bold uppercase"
                    maxLength={10}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Programs Offered */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs text-[#7A0808] uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen size={14} /> Programs Offered ({form.programs.length})
                </h4>
              </div>

              {form.programs.map((program, pIdx) => {
                const activeCourseTab = programCourseTabs[pIdx] || 'individual';

                return (
                  <div
                    key={program.id || pIdx}
                    className="border border-gray-200 rounded-2xl p-4 space-y-4 bg-white shadow-xs relative"
                  >
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <span className="font-bold text-xs text-gray-800 flex items-center gap-1.5">
                        Program #{pIdx + 1}
                      </span>
                      {form.programs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProgram(pIdx)}
                          className="text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-lg transition-colors flex items-center gap-1 font-bold"
                          title="Remove Program"
                        >
                          <Trash2 size={14} /> Remove Program
                        </button>
                      )}
                    </div>

                    {/* Program Code & Program Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="form-label font-bold text-gray-700 mb-1">
                          Program Code <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={program.code}
                          onChange={(e) => updateProgramField(pIdx, 'code', e.target.value.toUpperCase())}
                          placeholder="e.g., BSIT"
                          className="form-input w-full font-bold uppercase"
                          required
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="form-label font-bold text-gray-700 mb-1">
                          Program Name / Title <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={program.name}
                          onChange={(e) => updateProgramField(pIdx, 'name', e.target.value)}
                          placeholder="e.g., BS in Information Technology"
                          className="form-input w-full font-bold"
                          required
                        />
                      </div>
                    </div>

                    {/* Courses / Subjects Offered Section */}
                    <div className="pt-3 border-t border-gray-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="form-label font-bold text-gray-800 mb-0 flex items-center gap-1.5 text-xs">
                          <span>Courses / Subjects Offered in {program.code || `Program #${pIdx + 1}`} ({program.courses.filter(c=>c.code).length})</span>
                        </label>
                      </div>

                      {/* TABS SPECIFICALLY FOR ADDING COURSES / SUBJECTS */}
                      <div className="flex border border-gray-200 bg-gray-100/70 p-1 rounded-xl gap-1">
                        <button
                          type="button"
                          onClick={() => setCourseTabForProgram(pIdx, 'individual')}
                          className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                            activeCourseTab === 'individual'
                              ? 'bg-white text-[#7A0808] shadow-sm border border-gray-200'
                              : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                          }`}
                        >
                          <BookOpen size={14} />
                          Individual Adding (Default)
                        </button>
                        <button
                          type="button"
                          onClick={() => setCourseTabForProgram(pIdx, 'bulk')}
                          className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                            activeCourseTab === 'bulk'
                              ? 'bg-white text-[#7A0808] shadow-sm border border-gray-200'
                              : 'text-gray-500 hover:text-gray-800 hover:bg-white/50'
                          }`}
                        >
                          <FileSpreadsheet size={14} />
                          Bulk Add (Sheet Upload)
                        </button>
                      </div>

                      {/* INDIVIDUAL ADDING COURSE TAB */}
                      {activeCourseTab === 'individual' ? (
                        <div className="space-y-3">
                          {bulkSuccessMsg[pIdx] && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                              <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                                <CheckCircle2 size={15} /> {bulkSuccessMsg[pIdx]}
                              </p>
                            </div>
                          )}

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => addCourseToProgram(pIdx)}
                              className="text-xs text-[#7A0808] bg-red-50 hover:bg-red-100 font-bold px-3 py-1.5 rounded-lg border border-red-200 transition-colors flex items-center gap-1"
                            >
                              <Plus size={13} /> Add Subject
                            </button>
                          </div>

                          {program.courses.length === 0 ? (
                            <p className="text-[11px] text-gray-400 italic">No subjects added to this program yet.</p>
                          ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                              {program.courses.map((crs, cIdx) => (
                                <div
                                  key={crs.id || cIdx}
                                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-gray-50/80 p-2.5 rounded-xl border border-gray-200 items-center"
                                >
                                  <div className="sm:col-span-2">
                                    <input
                                      type="text"
                                      className="form-input bg-white text-xs font-bold uppercase"
                                      placeholder="Code (e.g. IT101)"
                                      value={crs.code}
                                      onChange={(e) => updateCourseField(pIdx, cIdx, 'code', e.target.value)}
                                    />
                                  </div>

                                  <div className="sm:col-span-4">
                                    <input
                                      type="text"
                                      className="form-input bg-white text-xs font-semibold"
                                      placeholder="Subject Title (e.g. Programming 1)"
                                      value={crs.title}
                                      onChange={(e) => updateCourseField(pIdx, cIdx, 'title', e.target.value)}
                                    />
                                  </div>

                                  <div className="sm:col-span-2">
                                    <select
                                      className="form-input bg-white text-xs font-semibold"
                                      value={crs.yearLevel}
                                      onChange={(e) => updateCourseField(pIdx, cIdx, 'yearLevel', e.target.value)}
                                    >
                                      {YEAR_LEVELS.map((y) => (
                                        <option key={y} value={y}>
                                          {y}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="sm:col-span-2">
                                    <select
                                      className="form-input bg-white text-xs font-semibold text-[#7A0808]"
                                      value={crs.semester}
                                      onChange={(e) => updateCourseField(pIdx, cIdx, 'semester', e.target.value)}
                                    >
                                      {SEMESTERS.map((s) => (
                                        <option key={s} value={s}>
                                          {s}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="sm:col-span-1">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className="form-input bg-white text-xs font-bold text-center"
                                      placeholder="Units"
                                      value={crs.units}
                                      onChange={(e) => updateCourseField(pIdx, cIdx, 'units', e.target.value.replace(/[^0-9.]/g, ''))}
                                    />
                                  </div>

                                  <div className="sm:col-span-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeCourseFromProgram(pIdx, cIdx)}
                                      className="p-1 text-gray-400 hover:text-red-600 rounded"
                                      title="Remove Subject"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* BULK ADD COURSES TAB FOR THIS PROGRAM */
                        <div className="bg-gray-50/70 p-4 rounded-xl border border-gray-200 space-y-4">
                          {bulkError[pIdx] && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                              <p className="text-xs font-bold text-red-700">{bulkError[pIdx]}</p>
                            </div>
                          )}

                          {/* Controls Box */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Step 1: Download Template */}
                            <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-2">
                              <div className="flex items-center gap-1.5 font-bold text-xs text-[#7A0808]">
                                <Download size={14} />
                                <span>1. Download Excel Template</span>
                              </div>
                              <p className="text-[10px] text-gray-500">
                                Download pre-formatted spreadsheet with dropdowns for Year Level, Semester, and Type.
                              </p>
                              <button
                                type="button"
                                onClick={() => downloadBulkCourseTemplate(form.code || 'college')}
                                className="btn-outline-maroon text-xs py-1.5 px-3 w-full flex items-center justify-center gap-1.5 font-bold"
                              >
                                <Download size={13} /> Download (.xlsx)
                              </button>
                            </div>

                            {/* Step 2: Upload Dropzone */}
                            <div
                              onDragOver={(e) => {
                                e.preventDefault();
                                setIsDragOver((prev) => ({ ...prev, [pIdx]: true }));
                              }}
                              onDragLeave={() => setIsDragOver((prev) => ({ ...prev, [pIdx]: false }))}
                              onDrop={(e) => handleDrop(e, pIdx)}
                              className={`border-2 border-dashed rounded-xl p-3 text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                                isDragOver[pIdx]
                                  ? 'border-[#7A0808] bg-red-50/70'
                                  : 'border-gray-300 hover:border-[#7A0808] bg-white'
                              }`}
                            >
                              <input
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                id={`programSheet_${pIdx}`}
                                onChange={(e) =>
                                  e.target.files && handleProgramSheetUpload(e.target.files[0], pIdx)
                                }
                              />
                              <label htmlFor={`programSheet_${pIdx}`} className="cursor-pointer flex flex-col items-center">
                                <Upload size={18} className="text-[#7A0808] mb-1" />
                                <span className="font-bold text-xs text-gray-800">
                                  2. Upload Courses Sheet
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  Click or drop file to automatically import subjects
                                </span>
                              </label>
                            </div>
                          </div>

                          {isParsing[pIdx] && (
                            <div className="p-4 text-center bg-white rounded-xl border border-gray-200">
                              <RefreshCw size={18} className="animate-spin text-[#7A0808] mx-auto mb-1" />
                              <p className="font-bold text-xs text-gray-700">Reading and populating courses into program...</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add Another Program Offered Button */}
              <button
                type="button"
                onClick={addProgram}
                className="w-full py-3 border-2 border-dashed border-[#7A0808] text-[#7A0808] hover:bg-red-50/50 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-2xs"
              >
                <Plus size={16} /> Add Another Program Offered
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-100 font-bold">
              <button
                type="button"
                onClick={onClose}
                className="btn-outline-maroon flex-1 justify-center py-2.5"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-maroon flex-1 flex items-center justify-center gap-2 py-2.5 shadow-md"
                disabled={loading}
              >
                <Plus size={16} /> {loading ? 'Saving...' : editingCollege ? 'Save Changes' : 'Save College & Programs'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
