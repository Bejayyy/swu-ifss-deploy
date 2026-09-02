import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Clock,
  Users,
  Building2,
  Filter,
  CircleHelp,
} from 'lucide-react';
import { addCollege, updateCollege, subscribeColleges } from '../../services/collegeService';
import {
  addCourse,
  updateCourse,
  subscribeCollegeCourses,
  deleteProgramCourses,
  deleteCollegeCoursesOutsidePrograms,
} from '../../services/courseService';
import { notifyServiceCollegeDeans } from '../../services/notificationService';
import {
  generateSectionNames,
  getYearLabel,
  upsertProgramYearSections,
  getCollegeProgramSections,
  deleteProgramSections,
} from '../../services/sectionService';
import {
  downloadBulkCourseTemplate,
  parseBulkCourseSpreadsheet,
  toTitleCase,
} from '../../utils/excelTemplate';
import CustomSelect from '../ui/CustomSelect';
import { useModal } from '../../hooks/useModal';
import { ModalRenderer } from './ModalProvider';
import LoadingModal from './LoadingModal';

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
const SEMESTERS = ['1st Semester', '2nd Semester', 'Summer'];
const SERVICE_MODES = {
  INTERNAL: 'internal',
  LECTURE: 'lecture',
  LABORATORY: 'laboratory',
  BOTH: 'both',
};
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
  lecUnits: '3',
  labUnits: '0',
  units: '3',
  lecHours: '3',
  labHours: '0',
  totalHours: '3',
  type: 'lecture',
  requiresServiceCollege: false,
  serviceMode: SERVICE_MODES.INTERNAL,
  lecServiceCollege: '',
  labServiceCollege: '',
});

function inferServiceMode(course = {}) {
  if (Object.values(SERVICE_MODES).includes(course.serviceMode)) return course.serviceMode;
  const hasLectureService = Boolean(course.lecServiceCollege);
  const hasLaboratoryService = Boolean(course.labServiceCollege);
  if (hasLectureService && hasLaboratoryService) return SERVICE_MODES.BOTH;
  if (hasLectureService) return SERVICE_MODES.LECTURE;
  if (hasLaboratoryService) return SERVICE_MODES.LABORATORY;
  return SERVICE_MODES.INTERNAL;
}

function ServiceArrangementGuideCloud({ position }) {
  if (!position) return null;
  const opensBelow = position.placement === 'below';

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[9999] block w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-[#7A0808]/25 bg-white p-4 text-left shadow-2xl"
      style={{
        left: position.left,
        top: position.top,
        transform: `translate(-100%, ${opensBelow ? '0' : '-100%'})`,
      }}
    >
      <div className={`absolute right-4 h-4 w-4 rotate-45 bg-white ${
        opensBelow
          ? '-top-2 border-l border-t border-[#7A0808]/25'
          : '-bottom-2 border-b border-r border-[#7A0808]/25'
      }`} />
      <div className="mb-3 flex items-center gap-2 border-b border-red-100 pb-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-[#7A0808]">
          <CircleHelp size={15} />
        </span>
        <div>
          <p className="m-0 text-xs font-black text-[#7A0808]">Service Arrangement Guide</p>
          <p className="m-0 mt-0.5 text-[10px] font-medium text-gray-500">Choose who will handle each class component.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-[10px] font-medium leading-[1.45] text-gray-700">
        <p className="m-0"><strong className="text-gray-900">Lecture only:</strong> Service college handles lecture; your college handles laboratory.</p>
        <p className="m-0"><strong className="text-gray-900">Laboratory only:</strong> Service college handles laboratory; your college handles lecture.</p>
        <p className="m-0"><strong className="text-gray-900">Both:</strong> Selected service colleges handle both lecture and laboratory.</p>
        <p className="m-0"><strong className="text-gray-900">Internal:</strong> Your college handles both components.</p>
      </div>
    </div>,
    document.body
  );
}

const createEmptyProgram = () => ({
  id: `prg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  code: '',
  name: '',
  courses: [createEmptyCourse()],
  sections: { 1: '', 2: '', 3: '', 4: '' },
  studentCapacities: { 1: '40', 2: '40', 3: '40', 4: '40' },
  ojtModality: { 1: false, 2: false, 3: false, 4: false },
  extraYears: [],
});

export default function AddCollegeModal({ onClose, onSaveSuccess, colleges = [], editingCollege = null }) {
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();
  const [form, setForm] = useState({
    code: editingCollege?.code || '',
    name: editingCollege?.name || '',
    managesGeneralEducationCourses: Boolean(editingCollege?.managesGeneralEducationCourses),
    allowsParallelClasses: Boolean(editingCollege?.allowsParallelClasses),
    noOwnSections: Boolean(editingCollege?.noOwnSections ?? editingCollege?.doesNotHandleSections),
    programs: editingCollege?.programs?.length
      ? editingCollege.programs.map((p) => ({
          id: p.id || `prg_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          code: p.code || '',
          name: p.name || '',
          courses: p.courses?.length ? p.courses : [createEmptyCourse()],
          sections: p.sections || { 1: '', 2: '', 3: '', 4: '' },
          studentCapacities: p.studentCapacities || { 1: '40', 2: '40', 3: '40', 4: '40' },
          ojtModality: p.ojtModality || { 1: false, 2: false, 3: false, 4: false },
          extraYears: p.extraYears || [],
        }))
      : [createEmptyProgram()],
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [closeAfterSuccess, setCloseAfterSuccess] = useState(false);
  const [savedCollegeCode, setSavedCollegeCode] = useState('');
  const [serviceGuidePosition, setServiceGuidePosition] = useState(null);

  const showServiceGuide = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const opensBelow = rect.top < 230;
    setServiceGuidePosition({
      left: Math.min(rect.right + 12, window.innerWidth - 16),
      top: opensBelow ? rect.bottom + 12 : rect.top - 12,
      placement: opensBelow ? 'below' : 'above',
    });
  };

  // Helper to detect duplicate subject codes within a courses list
  const getDuplicateCodes = (courses) => {
    const counts = {};
    (courses || []).forEach((c) => {
      const cd = (c.code || '').trim().toUpperCase();
      if (cd) counts[cd] = (counts[cd] || 0) + 1;
    });
    return new Set(Object.keys(counts).filter((cd) => counts[cd] > 1));
  };

  const [allColleges, setAllColleges] = useState(colleges || []);

  useEffect(() => {
    if (colleges && colleges.length > 0) {
      setAllColleges(colleges);
      return;
    }
    const unsub = subscribeColleges((data) => {
      setAllColleges(data || []);
    });
    return unsub;
  }, [colleges]);

  // Tab state per program index: { 0: 'individual', 1: 'bulk' }
  const [programCourseTabs, setProgramCourseTabs] = useState({ 0: 'individual' });
  // Year-level subject filter per program index. Empty means show every year.
  const [programYearFilters, setProgramYearFilters] = useState({});

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
                const lecU = crs.lecUnits !== undefined ? Number(crs.lecUnits) : (crs.type === 'laboratory' ? 0 : Number(crs.units || 3));
                const labU = crs.labUnits !== undefined ? Number(crs.labUnits) : (crs.type === 'laboratory' ? Number(crs.units || 3) : 0);
                const lecH = crs.lecHours !== undefined ? Number(crs.lecHours) : (lecU > 0 ? lecU * 1 : 0);
                const labH = crs.labHours !== undefined ? Number(crs.labHours) : (labU > 0 ? labU * 3 : 0);
                const totalH = crs.totalHours !== undefined ? Number(crs.totalHours) : (lecH + labH);

                const formattedCrs = {
                  ...crs,
                  title: crs.title || '',
                  yearLevel: crs.yearLevel || '1st Year',
                  semester: crs.semester || '1st Semester',
                  lecUnits: String(lecU),
                  labUnits: String(labU),
                  units: String(crs.units || (lecU + labU) || 3),
                  lecHours: String(lecH),
                  labHours: String(labH),
                  totalHours: String(totalH),
                  type: crs.type || (labU > 0 && lecU > 0 ? 'both' : (labU > 0 ? 'laboratory' : 'lecture')),
                  requiresServiceCollege: Boolean(crs.requiresServiceCollege || crs.lecServiceCollege || crs.labServiceCollege),
                  serviceMode: inferServiceMode(crs),
                  lecServiceCollege: crs.lecServiceCollege || crs.rememberedLecServiceCollege || '',
                  labServiceCollege: crs.labServiceCollege || crs.rememberedLabServiceCollege || '',
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

    // Also fetch existing program sections if editing
    getCollegeProgramSections(editingCollege.code)
      .then((existingSections) => {
        if (existingSections && existingSections.length > 0) {
          setForm((prev) => {
            const updatedPrograms = prev.programs.map((p) => {
              const pCode = p.code?.toUpperCase();
              const matchedSecDocs = existingSections.filter(
                (s) => s.programCode?.toUpperCase() === pCode
              );
              const secCounts = { 1: '', 2: '', 3: '', 4: '', ...(p.sections || {}) };
              const secCaps = { 1: '40', 2: '40', 3: '40', 4: '40', ...(p.studentCapacities || {}) };
              const ojtMods = { 1: false, 2: false, 3: false, 4: false, ...(p.ojtModality || {}) };
              const extraY = [...(p.extraYears || [])];

              matchedSecDocs.forEach((sDoc) => {
                if (sDoc.yearNumber) {
                  secCounts[sDoc.yearNumber] = sDoc.sectionCount !== undefined ? String(sDoc.sectionCount) : '';
                  if (sDoc.studentsPerSection || sDoc.studentCapacity) {
                    secCaps[sDoc.yearNumber] = String(sDoc.studentsPerSection || sDoc.studentCapacity);
                  }
                  ojtMods[sDoc.yearNumber] = Boolean(sDoc.hasOjtAlternatingModality || sDoc.modality === 'ojt_alternating');
                  if (sDoc.yearNumber > 4 && !extraY.includes(sDoc.yearNumber)) {
                    extraY.push(sDoc.yearNumber);
                  }
                }
              });

              return {
                ...p,
                sections: secCounts,
                studentCapacities: secCaps,
                ojtModality: ojtMods,
                extraYears: extraY.sort((a, b) => a - b),
              };
            });

            return { ...prev, programs: updatedPrograms };
          });
        }
      })
      .catch((err) => console.error('Error loading sections for college edit:', err));

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
      const val = field === 'name' ? value : value.toUpperCase();
      updatedPrgs[pIdx] = { ...updatedPrgs[pIdx], [field]: val };
      return { ...prev, programs: updatedPrgs };
    });
  };

  // Course Management Helpers per Program
  const addCourseToProgram = (pIdx, yearLevel = '') => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      updatedPrgs[pIdx] = {
        ...updatedPrgs[pIdx],
        courses: [
          { ...createEmptyCourse(), ...(yearLevel ? { yearLevel } : {}) },
          ...updatedPrgs[pIdx].courses,
        ],
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
      // Keep title raw during typing so user can press spacebar freely!
      if (field === 'title') val = value;
      
      const currentCrs = { ...updatedCourses[cIdx], [field]: val };

      if (field === 'lecUnits' || field === 'labUnits') {
        const cleanVal = val.replace(/[^0-9.]/g, '');
        currentCrs[field] = cleanVal;

        const lecVal = field === 'lecUnits' ? cleanVal : (currentCrs.lecUnits || '0');
        const labVal = field === 'labUnits' ? cleanVal : (currentCrs.labUnits || '0');
        const numLec = parseFloat(lecVal) || 0;
        const numLab = parseFloat(labVal) || 0;
        const total = numLec + numLab;
        currentCrs.units = String(total);

        if (numLab > 0 && numLec > 0) {
          currentCrs.type = 'both';
        } else if (numLab > 0 && numLec === 0) {
          currentCrs.type = 'laboratory';
        } else {
          currentCrs.type = 'lecture';
        }

        // Dynamically set default contact hours: if 0, do not ask for hours (set to 0)
        const autoLecH = numLec > 0 ? numLec * 1.0 : 0;
        const autoLabH = numLab > 0 ? numLab * 3.0 : 0;
        currentCrs.lecHours = String(autoLecH);
        currentCrs.labHours = String(autoLabH);
        currentCrs.totalHours = String(autoLecH + autoLabH);

        // Keep the service arrangement compatible with the available components.
        const currentMode = inferServiceMode(currentCrs);
        if (numLec === 0) {
          if (currentMode === SERVICE_MODES.LECTURE) currentCrs.serviceMode = SERVICE_MODES.INTERNAL;
          if (currentMode === SERVICE_MODES.BOTH) currentCrs.serviceMode = SERVICE_MODES.LABORATORY;
        }
        if (numLab === 0) {
          if (currentMode === SERVICE_MODES.LABORATORY) currentCrs.serviceMode = SERVICE_MODES.INTERNAL;
          if (currentMode === SERVICE_MODES.BOTH) currentCrs.serviceMode = SERVICE_MODES.LECTURE;
        }
      }

      if (field === 'lecHours' || field === 'labHours') {
        const cleanVal = val.replace(/[^0-9.]/g, '');
        currentCrs[field] = cleanVal;
        const numLecH = parseFloat(field === 'lecHours' ? cleanVal : (currentCrs.lecHours || '0')) || 0;
        const numLabH = parseFloat(field === 'labHours' ? cleanVal : (currentCrs.labHours || '0')) || 0;
        currentCrs.totalHours = String(numLecH + numLabH);
      }

      updatedCourses[cIdx] = currentCrs;
      updatedPrgs[pIdx] = { ...updatedPrgs[pIdx], courses: updatedCourses };
      return { ...prev, programs: updatedPrgs };
    });
  };

  const updateCourseServiceMode = (pIdx, cIdx, mode) => {
    setForm((prev) => {
      const updatedPrograms = [...prev.programs];
      const updatedCourses = [...updatedPrograms[pIdx].courses];
      const currentCourse = { ...updatedCourses[cIdx] };

      currentCourse.serviceMode = mode;
      currentCourse.requiresServiceCollege = mode !== SERVICE_MODES.INTERNAL;

      updatedCourses[cIdx] = currentCourse;
      updatedPrograms[pIdx] = { ...updatedPrograms[pIdx], courses: updatedCourses };
      return { ...prev, programs: updatedPrograms };
    });
  };

  // Section Management Helpers per Program
  const updateProgramSectionCount = (pIdx, yearNum, value) => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      const prg = updatedPrgs[pIdx];
      const updatedSec = { ...(prg.sections || { 1: '', 2: '', 3: '', 4: '' }), [yearNum]: value };
      updatedPrgs[pIdx] = { ...prg, sections: updatedSec };
      return { ...prev, programs: updatedPrgs };
    });
  };

  const updateProgramSectionCapacity = (pIdx, yearNum, value) => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      const prg = updatedPrgs[pIdx];
      const updatedCap = { ...(prg.studentCapacities || { 1: '40', 2: '40', 3: '40', 4: '40' }), [yearNum]: value };
      updatedPrgs[pIdx] = { ...prg, studentCapacities: updatedCap };
      return { ...prev, programs: updatedPrgs };
    });
  };

  const updateProgramSectionOjtModality = (pIdx, yearNum, value) => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      const prg = updatedPrgs[pIdx];
      const updatedOjt = { ...(prg.ojtModality || { 1: false, 2: false, 3: false, 4: false }), [yearNum]: value };
      updatedPrgs[pIdx] = { ...prg, ojtModality: updatedOjt };
      return { ...prev, programs: updatedPrgs };
    });
  };

  const addProgramExtraYear = (pIdx) => {
    setForm((prev) => {
      const updatedPrgs = [...prev.programs];
      const prg = updatedPrgs[pIdx];
      const existingExtra = prg.extraYears || [];
      const nextYear = Math.max(4, ...existingExtra) + 1;
      if (nextYear <= 7) {
        updatedPrgs[pIdx] = {
          ...prg,
          extraYears: [...existingExtra, nextYear],
        };
      }
      return { ...prev, programs: updatedPrgs };
    });
  };

  // Handle Sheet File Upload for Program Courses: AUTOMATICALLY POPULATES COURSES!
  const handleProgramSheetUpload = async (file, pIdx) => {
    if (!file) return;
    const programFilterKey = form.programs[pIdx]?.id || `program-${pIdx}`;

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

      const formattedNewCourses = validRows.map((r) => {
        const lecU = r.lecUnits !== undefined ? Number(r.lecUnits) : (r.type === 'laboratory' ? 0 : Number(r.units || 3));
        const labU = r.labUnits !== undefined ? Number(r.labUnits) : (r.type === 'laboratory' ? Number(r.units || 3) : 0);
        const lecH = r.lecHours !== undefined ? Number(r.lecHours) : (lecU > 0 ? lecU * 1 : 0);
        const labH = r.labHours !== undefined ? Number(r.labHours) : (labU > 0 ? labU * 3 : 0);
        const totalH = r.totalHours !== undefined ? Number(r.totalHours) : (lecH + labH);

        return {
          id: `crs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          code: r.code.trim().toUpperCase(),
          title: toTitleCase(r.title),
          yearLevel: r.yearLevel,
          semester: r.semester,
          lecUnits: String(lecU),
          labUnits: String(labU),
          units: String(r.units || (lecU + labU)),
          lecHours: String(lecH),
          labHours: String(labH),
          totalHours: String(totalH),
          type: r.type,
        };
      });

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
      setProgramYearFilters((prev) => ({ ...prev, [programFilterKey]: '' }));
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
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleProgramSheetUpload(files[0], pIdx);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const code = form.code.trim().toUpperCase();
    const name = toTitleCase(form.name);

    if (!code || !name) {
      setError('College code and name are required.');
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

      // Check for duplicate course/subject codes within this program
      const dups = getDuplicateCodes(prg.courses);
      if (dups.size > 0) {
        setError(`Duplicate subject code(s) found in ${prg.code.trim().toUpperCase()}: ${Array.from(dups).join(', ')}. Each subject code must be unique.`);
        return;
      }

      for (const course of prg.courses || []) {
        const courseCode = String(course.code || '').trim();
        const courseTitle = String(course.title || '').trim();
        if (!courseCode && !courseTitle) continue;
        if (!courseCode || !courseTitle) {
          setError(`Complete both the subject code and subject title for ${courseCode || courseTitle}, or leave both blank to add courses later.`);
          return;
        }
        const serviceMode = inferServiceMode(course);
        const needsLectureCollege = serviceMode === SERVICE_MODES.LECTURE || serviceMode === SERVICE_MODES.BOTH;
        const needsLaboratoryCollege = serviceMode === SERVICE_MODES.LABORATORY || serviceMode === SERVICE_MODES.BOTH;
        if (needsLectureCollege && !course.lecServiceCollege) {
          setError(`Select the lecture service college for ${courseCode || courseTitle}.`);
          return;
        }
        if (needsLaboratoryCollege && !course.labServiceCollege) {
          setError(`Select the laboratory service college for ${courseCode || courseTitle}.`);
          return;
        }
      }
    }

    const isEditing = Boolean(editingCollege);
    const confirmed = await showConfirm({
      title: isEditing ? 'Save Changes to College?' : 'Add New College?',
      message: isEditing
        ? `Are you sure you want to save changes to "${name}" (${code}) and its programs/courses?`
        : `Are you sure you want to create the college "${name}" (${code}) with ${form.programs.length} program(s)?`,
      confirmText: isEditing ? 'Save Changes' : 'Add College',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setLoading(true);
    try {
      const cleanPrograms = form.programs.map((p) => ({
        code: p.code.trim().toUpperCase(),
        name: toTitleCase(p.name.trim()),
      }));

      const previousProgramCodes = new Set(
        (editingCollege?.programs || [])
          .map((program) => String(program.code || '').trim().toUpperCase())
          .filter(Boolean)
      );
      const currentProgramCodes = new Set(cleanPrograms.map((program) => program.code));
      const removedProgramCodes = [...previousProgramCodes].filter(
        (programCode) => !currentProgramCodes.has(programCode)
      );

      const noOwnSections = Boolean(form.managesGeneralEducationCourses && form.noOwnSections);

      if (editingCollege) {
        await updateCollege(editingCollege.id, {
          code,
          name,
          managesGeneralEducationCourses: form.managesGeneralEducationCourses,
          allowsParallelClasses: form.allowsParallelClasses,
          noOwnSections,
          programs: cleanPrograms,
        });
      } else {
        await addCollege({
          code,
          name,
          managesGeneralEducationCourses: form.managesGeneralEducationCourses,
          allowsParallelClasses: form.allowsParallelClasses,
          noOwnSections,
          programs: cleanPrograms,
        });
      }

      // Save/Write all courses inside programs to Firestore
      for (const prg of form.programs) {
        const prgCode = prg.code.trim().toUpperCase();
        for (const crs of prg.courses) {
          if (crs.code.trim() && crs.title.trim()) {
            const numLec = parseFloat(crs.lecUnits) || (crs.type === 'laboratory' ? 0 : parseFloat(crs.units) || 3);
            const numLab = parseFloat(crs.labUnits) || (crs.type === 'laboratory' ? parseFloat(crs.units) || 3 : 0);
            const totalUnits = parseFloat(crs.units) || (numLec + numLab);

            const lecHours = numLec > 0 ? (crs.lecHours !== undefined && crs.lecHours !== '' ? Number(crs.lecHours) : numLec * 1.0) : 0;
            const labHours = numLab > 0 ? (crs.labHours !== undefined && crs.labHours !== '' ? Number(crs.labHours) : numLab * 3.0) : 0;
            const totalHours = lecHours + labHours;

            const selectedServiceMode = inferServiceMode(crs);
            const activeLectureServiceCollege = (
              numLec > 0 &&
              (selectedServiceMode === SERVICE_MODES.LECTURE || selectedServiceMode === SERVICE_MODES.BOTH)
            ) ? crs.lecServiceCollege : '';
            const activeLaboratoryServiceCollege = (
              numLab > 0 &&
              (selectedServiceMode === SERVICE_MODES.LABORATORY || selectedServiceMode === SERVICE_MODES.BOTH)
            ) ? crs.labServiceCollege : '';
            const reqSvc = Boolean(activeLectureServiceCollege || activeLaboratoryServiceCollege);
            const coursePayload = {
              code: crs.code.trim().toUpperCase(),
              title: toTitleCase(crs.title.trim()),
              yearLevel: crs.yearLevel || '1st Year',
              semester: crs.semester || '1st Semester',
              lecUnits: numLec,
              labUnits: numLab,
              units: totalUnits,
              lecHours,
              labHours,
              totalHours,
              type: crs.type || (numLab > 0 && numLec > 0 ? 'both' : (numLab > 0 ? 'laboratory' : 'lecture')),
              collegeCode: code,
              programCode: prgCode,
              requiresServiceCollege: reqSvc,
              lecServiceCollege: activeLectureServiceCollege ? String(activeLectureServiceCollege).trim().toUpperCase() : null,
              labServiceCollege: activeLaboratoryServiceCollege ? String(activeLaboratoryServiceCollege).trim().toUpperCase() : null,
              rememberedLecServiceCollege: crs.lecServiceCollege ? String(crs.lecServiceCollege).trim().toUpperCase() : null,
              rememberedLabServiceCollege: crs.labServiceCollege ? String(crs.labServiceCollege).trim().toUpperCase() : null,
              serviceStatus: crs.serviceStatus || 'pending',
            };

            if (crs.id && !crs.id.startsWith('crs_')) {
              await updateCourse(crs.id, coursePayload);
            } else {
              await addCourse(coursePayload);
            }

            // Send notification to Service College Dean(s)
            if (activeLectureServiceCollege) {
              notifyServiceCollegeDeans({
                serviceCollegeCode: activeLectureServiceCollege,
                motherCollege: form.name || code,
                courseCode: coursePayload.code,
                courseTitle: coursePayload.title,
                component: 'Lecture',
                statusType: 'assigned',
              });
            }
            if (activeLaboratoryServiceCollege) {
              notifyServiceCollegeDeans({
                serviceCollegeCode: activeLaboratoryServiceCollege,
                motherCollege: form.name || code,
                courseCode: coursePayload.code,
                courseTitle: coursePayload.title,
                component: 'Laboratory',
                statusType: 'assigned',
              });
            }
          }
        }
      }

      // Clean up removed program records only after retained courses have been
      // migrated to their new program code. Deleting first leaves stale IDs in
      // the modal and causes Firestore's "No document to update" error.
      for (const removedProgramCode of removedProgramCodes) {
        await deleteProgramCourses(code, removedProgramCode);
        await deleteProgramSections(removedProgramCode, code);
      }

      await deleteCollegeCoursesOutsidePrograms(code, [...currentProgramCodes]);
      const storedSectionRows = await getCollegeProgramSections(code);
      const orphanedSectionCodes = new Set(
        storedSectionRows
          .map((row) => String(row.programCode || '').trim().toUpperCase())
          .filter((programCode) => programCode && !currentProgramCodes.has(programCode))
      );
      for (const orphanedProgramCode of orphanedSectionCodes) {
        await deleteProgramSections(orphanedProgramCode, code);
      }

      // Save/Write all sections inside programs to Firestore
      for (const prg of form.programs) {
        const prgCode = prg.code.trim().toUpperCase();
        if (!prgCode) continue;
        const allYears = [1, 2, 3, 4, ...(prg.extraYears || [])];
        for (const yearNum of allYears) {
          const count = Number(prg.sections?.[yearNum]) || 0;
          const capacity = Number(prg.studentCapacities?.[yearNum]) || 40;
          const hasOjt = Boolean(prg.ojtModality?.[yearNum]);
          if (count > 0 || editingCollege) {
            await upsertProgramYearSections(code, prgCode, yearNum, count, capacity, {
              hasOjtAlternatingModality: hasOjt,
              modality: hasOjt ? 'ojt_alternating' : 'regular',
            });
          }
        }
      }

      setLoading(false);
      setSavedCollegeCode(code);
      setCloseAfterSuccess(true);
      showNotification({
        type: 'success',
        title: editingCollege ? 'College Updated!' : 'College Added!',
        message: `College ${code} and its programs, courses, and sections were saved successfully.`,
        autoCloseMs: 0,
      });
    } catch (err) {
      const message = err.message || 'Failed to save college.';
      setError(message);
      showNotification({
        type: 'error',
        title: 'Save Failed',
        message,
        autoCloseMs: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className="modal-overlay z-[100]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full relative animate-modal-pop max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="bg-gray-50/80 border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
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

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          {/* Modal Body (Scrollable) */}
          <div className="p-6 overflow-y-auto flex-1 text-xs space-y-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-xs font-bold text-red-700">{error}</p>
              </div>
            )}

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
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    onBlur={(e) => setForm({ ...form, name: toTitleCase(e.target.value.trim()) })}
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
              <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${
                form.managesGeneralEducationCourses
                  ? 'border-[#7A0808]/30 bg-red-50/60'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
                <input
                  type="checkbox"
                  checked={form.managesGeneralEducationCourses}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    managesGeneralEducationCourses: event.target.checked,
                    noOwnSections: event.target.checked ? prev.noOwnSections : false,
                  }))}
                  className="mt-0.5 h-4 w-4 accent-[#7A0808]"
                />
                <span>
                  <span className="block text-xs font-black text-gray-800">General Education / Minor Subject Provider</span>
                  <span className="mt-1 block text-[10px] font-medium leading-relaxed text-gray-500">
                    Enable when this college centrally manages minor subjects for multiple colleges and programs. It will be highlighted for first scheduling access and centralized course assignment.
                  </span>
                </span>
              </label>

              <label className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${
                form.allowsParallelClasses
                  ? 'border-[#7A0808]/30 bg-red-50/60'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
                <input
                  type="checkbox"
                  checked={form.allowsParallelClasses}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    allowsParallelClasses: event.target.checked,
                  }))}
                  className="mt-0.5 h-4 w-4 accent-[#7A0808]"
                />
                <span>
                  <span className="block text-xs font-black text-gray-800">Allow Parallel Classes</span>
                  <span className="mt-1 block text-[10px] font-medium leading-relaxed text-gray-500">
                    Allow one course and teacher to handle up to four selected sections in the same class schedule. Teacher conflicts created only by those selected parallel sections are ignored.
                  </span>
                </span>
              </label>

              {form.managesGeneralEducationCourses && (
                <div className="ml-6 pl-3 border-l-2 border-[#7A0808]/30">
                  <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    form.noOwnSections
                      ? 'border-[#7A0808]/30 bg-red-50/80'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={form.noOwnSections}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        noOwnSections: event.target.checked,
                      }))}
                      className="mt-0.5 h-4 w-4 accent-[#7A0808]"
                    />
                    <span>
                      <span className="block text-xs font-black text-gray-800">
                        Does not handle college sections (Minor subjects plotted directly across colleges)
                      </span>
                      <span className="mt-0.5 block text-[10px] font-medium leading-relaxed text-gray-500">
                        Enable if this college (e.g. CAS) does not have its own degree sections (like BSIT1-A1) and only plots minor subjects across all other colleges upon Registrar access grant without waiting for Mother College release notifications.
                      </span>
                    </span>
                  </label>
                </div>
              )}
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
                const duplicateCodesInPrg = getDuplicateCodes(program.courses);
                const programFilterKey = program.id || `program-${pIdx}`;
                const activeYearFilter = programYearFilters[programFilterKey] || '';
                const visibleCourseEntries = (program.courses || [])
                  .map((course, courseIndex) => ({ course, courseIndex }))
                  .filter(({ course }) =>
                    !activeYearFilter || (course.yearLevel || '1st Year') === activeYearFilter
                  );

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
                          onBlur={(e) => updateProgramField(pIdx, 'name', toTitleCase(e.target.value.trim()))}
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

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <label
                                htmlFor={`subject-year-filter-${pIdx}`}
                                className="text-[11px] font-bold text-gray-600 flex items-center gap-1.5 shrink-0"
                              >
                                <Filter size={13} className="text-[#7A0808]" />
                                Filter:
                              </label>
                              <select
                                id={`subject-year-filter-${pIdx}`}
                                value={activeYearFilter}
                                onChange={(event) => setProgramYearFilters((prev) => ({
                                  ...prev,
                                  [programFilterKey]: event.target.value,
                                }))}
                                className="form-input bg-white text-xs font-bold py-1.5 px-2.5 rounded-lg border border-gray-200 focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] min-w-[150px]"
                                aria-label={`Filter ${program.code || `Program ${pIdx + 1}`} subjects by year level`}
                              >
                                <option value="">All Year Levels</option>
                                {YEAR_LEVELS.map((level) => (
                                  <option key={level} value={level}>{level}</option>
                                ))}
                              </select>
                              {activeYearFilter && (
                                <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">
                                  {visibleCourseEntries.length} shown
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => addCourseToProgram(pIdx, activeYearFilter)}
                              className="text-xs text-[#7A0808] bg-red-50 hover:bg-red-100 font-bold px-3 py-1.5 rounded-lg border border-red-200 transition-colors flex items-center gap-1"
                            >
                              <Plus size={13} /> Add Subject
                            </button>
                          </div>

                          {program.courses.length === 0 ? (
                            <p className="text-[11px] text-gray-400 italic">No subjects added to this program yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {/* Column Header Labels */}
                              <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3 py-1.5 bg-gray-100/90 rounded-xl text-[10px] font-extrabold uppercase tracking-wider text-gray-600 items-center">
                                <div className="sm:col-span-2">Subject Code <span className="text-red-500">*</span></div>
                                <div className="sm:col-span-3">Subject Title <span className="text-red-500">*</span></div>
                                <div className="sm:col-span-2">Year Level</div>
                                <div className="sm:col-span-2">Semester</div>
                                <div className="sm:col-span-1 text-center" title="Lecture Credit Units">Lec Units</div>
                                <div className="sm:col-span-1 text-center" title="Laboratory Credit Units">Lab Units</div>
                                <div className="sm:col-span-1 text-center" title="Total Credit Units">Total Units</div>
                              </div>

                              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                {visibleCourseEntries.length === 0 && (
                                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center">
                                    <p className="text-[11px] font-bold text-gray-600">
                                      No subjects found for {activeYearFilter}.
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() => setProgramYearFilters((prev) => ({
                                        ...prev,
                                        [programFilterKey]: '',
                                      }))}
                                      className="mt-1.5 text-[10px] font-bold text-[#7A0808] hover:underline"
                                    >
                                      Show all year levels
                                    </button>
                                  </div>
                                )}
                                {visibleCourseEntries.map(({ course: crs, courseIndex: cIdx }) => {
                                  const isDuplicate = duplicateCodesInPrg.has((crs.code || '').trim().toUpperCase());
                                  const hasLecture = Number(crs.lecUnits || 0) > 0;
                                  const hasLaboratory = Number(crs.labUnits || 0) > 0;
                                  const serviceMode = inferServiceMode(crs);
                                  const hasActiveServiceCollege = Boolean(
                                    ((serviceMode === SERVICE_MODES.LECTURE || serviceMode === SERVICE_MODES.BOTH) && crs.lecServiceCollege) ||
                                    ((serviceMode === SERVICE_MODES.LABORATORY || serviceMode === SERVICE_MODES.BOTH) && crs.labServiceCollege)
                                  );
                                  const serviceModeOptions = [
                                    { value: SERVICE_MODES.INTERNAL, label: 'Internal / Own College' },
                                    ...(hasLecture ? [{
                                      value: SERVICE_MODES.LECTURE,
                                      label: hasLaboratory ? 'Lecture only' : 'Use Service College',
                                    }] : []),
                                    ...(hasLaboratory ? [{
                                      value: SERVICE_MODES.LABORATORY,
                                      label: hasLecture ? 'Laboratory only' : 'Use Service College',
                                    }] : []),
                                    ...(hasLecture && hasLaboratory
                                      ? [{ value: SERVICE_MODES.BOTH, label: 'Both Lecture & Laboratory' }]
                                      : []),
                                  ];
                                  return (
                                    <div
                                      key={crs.id || cIdx}
                                      className={`grid grid-cols-1 sm:grid-cols-12 gap-2 bg-gray-50/80 p-2.5 rounded-xl border items-center transition-all ${
                                        isDuplicate ? 'border-red-300 bg-red-50/30' : 'border-gray-200 hover:border-gray-300'
                                      }`}
                                    >
                                      {/* Code */}
                                      <div className="sm:col-span-2">
                                        <label className="sm:hidden block text-[10px] font-bold text-gray-600 mb-0.5">Subject Code *</label>
                                        <input
                                          type="text"
                                          className={`form-input bg-white text-xs font-bold uppercase w-full ${isDuplicate ? 'border-red-400 focus:border-red-600' : ''}`}
                                          placeholder="e.g. IT101"
                                          value={crs.code}
                                          onChange={(e) => updateCourseField(pIdx, cIdx, 'code', e.target.value)}
                                          required={Boolean(String(crs.title || '').trim())}
                                        />
                                        {isDuplicate && (
                                          <span className="text-[9px] font-bold text-red-600 block mt-0.5">Duplicate code</span>
                                        )}
                                      </div>

                                      {/* Title */}
                                      <div className="sm:col-span-3">
                                        <label className="sm:hidden block text-[10px] font-bold text-gray-600 mb-0.5">Subject Title *</label>
                                        <input
                                          type="text"
                                          className="form-input bg-white text-xs font-semibold w-full"
                                          placeholder="e.g. Programming 1"
                                          value={crs.title}
                                          onChange={(e) => updateCourseField(pIdx, cIdx, 'title', e.target.value)}
                                          onBlur={(e) => updateCourseField(pIdx, cIdx, 'title', toTitleCase(e.target.value.trim()))}
                                          required={Boolean(String(crs.code || '').trim())}
                                        />
                                      </div>

                                      {/* Year Level */}
                                      <div className="sm:col-span-2">
                                        <label className="sm:hidden block text-[10px] font-bold text-gray-600 mb-0.5">Year Level</label>
                                        <select
                                          value={crs.yearLevel || '1st Year'}
                                          onChange={(e) => updateCourseField(pIdx, cIdx, 'yearLevel', e.target.value)}
                                          className="form-input bg-white text-xs font-semibold py-1.5 px-2 rounded-xl border border-gray-200 focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] w-full"
                                        >
                                          {YEAR_LEVELS.map((lvl) => (
                                            <option key={lvl} value={lvl}>{lvl}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Semester */}
                                      <div className="sm:col-span-2">
                                        <label className="sm:hidden block text-[10px] font-bold text-gray-600 mb-0.5">Semester</label>
                                        <select
                                          value={crs.semester || '1st Semester'}
                                          onChange={(e) => updateCourseField(pIdx, cIdx, 'semester', e.target.value)}
                                          className="form-input bg-white text-xs font-semibold py-1.5 px-2 rounded-xl border border-gray-200 focus:border-[#7A0808] focus:ring-1 focus:ring-[#7A0808] w-full"
                                        >
                                          {SEMESTERS.map((sem) => (
                                            <option key={sem} value={sem}>{sem}</option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Lec Units */}
                                      <div className="sm:col-span-1">
                                        <label className="sm:hidden block text-[10px] font-bold text-gray-600 mb-0.5 text-center">Lec Units</label>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          className="form-input bg-white text-xs font-bold text-center w-full px-1"
                                          placeholder="3"
                                          value={crs.lecUnits ?? '3'}
                                          onChange={(e) => updateCourseField(pIdx, cIdx, 'lecUnits', e.target.value)}
                                          title="Lecture Credit Units"
                                        />
                                      </div>

                                      {/* Lab Units */}
                                      <div className="sm:col-span-1">
                                        <label className="sm:hidden block text-[10px] font-bold text-gray-600 mb-0.5 text-center">Lab Units</label>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          className="form-input bg-white text-xs font-bold text-center w-full px-1"
                                          placeholder="0"
                                          value={crs.labUnits ?? '0'}
                                          onChange={(e) => updateCourseField(pIdx, cIdx, 'labUnits', e.target.value)}
                                          title="Laboratory Credit Units"
                                        />
                                      </div>

                                      {/* Total Credit Units (Beside Lab Units) */}
                                      <div className="sm:col-span-1 flex flex-col items-center justify-center">
                                        <label className="sm:hidden block text-[10px] font-bold text-gray-600 mb-0.5 text-center">Total Units</label>
                                        <span className="px-1 py-1.5 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 text-xs font-black text-center w-full block shadow-2xs" title="Total Credit Units">
                                          {crs.units ?? '3'}
                                        </span>
                                      </div>

                                      {/* Sub-row: Single-Line Required Contact Hours & Delete button */}
                                      <div className="sm:col-span-12 flex flex-wrap items-center justify-between pt-2 border-t border-gray-100 gap-2 text-xs">
                                        {/* Required Contact Hours: In one clean single line */}
                                        {(Number(crs.lecUnits || 0) > 0 || Number(crs.labUnits || 0) > 0) ? (
                                          <div className="flex flex-wrap items-center gap-3 bg-amber-50/90 border border-amber-200/90 px-3 py-1.5 rounded-xl text-xs flex-1">
                                            <span className="font-black text-amber-950 text-xs uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                                              <Clock size={13} className="text-amber-700" /> Required Time:
                                            </span>

                                            {/* Only ask for Lecture Hours if Lec Units > 0 */}
                                            {Number(crs.lecUnits || 0) > 0 && (
                                              <div className="flex items-center gap-1.5">
                                                <label className="text-xs font-bold text-amber-900" title="Required Lecture Hours per Week">Lecture:</label>
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  value={crs.lecHours !== undefined ? crs.lecHours : String(Number(crs.lecUnits || 0) * 1)}
                                                  onChange={(e) => updateCourseField(pIdx, cIdx, 'lecHours', e.target.value)}
                                                  placeholder="1"
                                                  className="w-12 text-center font-black text-xs py-1 px-1 bg-white border border-amber-300 rounded-lg focus:border-[#7A0808]"
                                                  title="Required Lecture Contact Hours per Week"
                                                />
                                              </div>
                                            )}

                                            {/* Only ask for Lab Hours if Lab Units > 0 */}
                                            {Number(crs.labUnits || 0) > 0 && (
                                              <div className="flex items-center gap-1.5">
                                                <label className="text-xs font-bold text-amber-900" title="Required Laboratory Hours per Week">Laboratory:</label>
                                                <input
                                                  type="text"
                                                  inputMode="numeric"
                                                  value={crs.labHours !== undefined ? crs.labHours : String(Number(crs.labUnits || 0) * 3)}
                                                  onChange={(e) => updateCourseField(pIdx, cIdx, 'labHours', e.target.value)}
                                                  placeholder="3"
                                                  className="w-12 text-center font-black text-xs py-1 px-1 bg-white border border-amber-300 rounded-lg focus:border-[#7A0808]"
                                                  title="Required Laboratory Contact Hours per Week"
                                                />
                                              </div>
                                            )}

                                            {/* Total Weekly Hours Badge */}
                                            <span className="text-xs font-black text-amber-950 ml-auto">
                                              = {(Number(crs.lecUnits || 0) > 0 ? (parseFloat(crs.lecHours ?? (Number(crs.lecUnits) * 1)) || 0) : 0) +
                                                 (Number(crs.labUnits || 0) > 0 ? (parseFloat(crs.labHours ?? (Number(crs.labUnits) * 3)) || 0) : 0)} hrs/wk total
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex-1" />
                                        )}

                                        <button
                                          type="button"
                                          onClick={() => removeCourseFromProgram(pIdx, cIdx)}
                                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 font-bold text-xs shrink-0"
                                          title="Remove Subject"
                                        >
                                          <Trash2 size={13} />
                                          <span className="sm:hidden">Remove</span>
                                        </button>
                                      </div>

                                      {/* Sub-row: Conditional Service College Assignment */}
                                      {(hasLecture || hasLaboratory) && (
                                      <div className={`sm:col-span-12 p-3 rounded-xl border mt-1.5 transition-colors ${
                                        serviceMode === SERVICE_MODES.INTERNAL
                                          ? 'border-gray-200 bg-white'
                                          : 'border-indigo-200 bg-indigo-50/60'
                                      }`}>
                                        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
                                          <div className="flex items-center gap-1.5 text-gray-800 font-black text-[11px] shrink-0">
                                            <Building2 size={14} className={serviceMode === SERVICE_MODES.INTERNAL ? 'text-gray-500' : 'text-indigo-700'} />
                                            <span>Teaching arrangement:</span>
                                          </div>
                                          <div className="flex flex-wrap gap-1.5">
                                            {serviceModeOptions.map((option) => (
                                              <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => updateCourseServiceMode(pIdx, cIdx, option.value)}
                                                className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                                                  serviceMode === option.value
                                                    ? 'border-[#7A0808] bg-[#7A0808] text-white shadow-sm'
                                                    : 'border-gray-200 bg-white text-gray-600 hover:border-[#7A0808] hover:text-[#7A0808]'
                                                }`}
                                              >
                                                {option.label}
                                              </button>
                                            ))}
                                            {hasLecture && hasLaboratory && (
                                              <div className="inline-flex items-center">
                                                <button
                                                  type="button"
                                                  className="p-1 text-[#7A0808] hover:bg-red-50 rounded-full focus:outline-none focus:ring-2 focus:ring-[#7A0808]/30 transition-colors"
                                                  aria-label="Explain lecture and laboratory service arrangements"
                                                  onMouseEnter={showServiceGuide}
                                                  onMouseLeave={() => setServiceGuidePosition(null)}
                                                  onFocus={showServiceGuide}
                                                  onBlur={() => setServiceGuidePosition(null)}
                                                >
                                                  <CircleHelp size={16} />
                                                </button>
                                              </div>
                                            )}
                                          </div>
                                          {serviceMode === SERVICE_MODES.INTERNAL && (
                                            <span className="text-[10px] text-gray-500 lg:ml-auto">
                                              Handled by {form.name || form.code || 'the owning college'}.
                                            </span>
                                          )}
                                        </div>

                                        {serviceMode !== SERVICE_MODES.INTERNAL && (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-3 pt-3 border-t border-indigo-200/70">

                                        {(serviceMode === SERVICE_MODES.LECTURE || serviceMode === SERVICE_MODES.BOTH) && (
                                          <div>
                                            <label className="block text-[10px] font-extrabold text-indigo-900 mb-1">
                                              {hasLaboratory ? 'Lecture service college' : 'Service college'} <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                              value={crs.lecServiceCollege || ''}
                                              onChange={(e) => updateCourseField(pIdx, cIdx, 'lecServiceCollege', e.target.value)}
                                              className="form-input bg-white text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-indigo-300 focus:border-[#7A0808] w-full"
                                              required
                                            >
                                              <option value="">Select a service college...</option>
                                              {allColleges
                                                .filter((c) => c.code !== form.code && c.name !== form.name)
                                                .map((c) => (
                                                  <option key={c.id || c.code} value={c.code || c.name}>
                                                    {c.code} - {c.name}
                                                  </option>
                                                ))}
                                            </select>
                                          </div>
                                        )}

                                        {(serviceMode === SERVICE_MODES.LABORATORY || serviceMode === SERVICE_MODES.BOTH) && (
                                          <div>
                                            <label className="block text-[10px] font-extrabold text-indigo-900 mb-1">
                                              {hasLecture ? 'Laboratory service college' : 'Service college'} <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                              value={crs.labServiceCollege || ''}
                                              onChange={(e) => updateCourseField(pIdx, cIdx, 'labServiceCollege', e.target.value)}
                                              className="form-input bg-white text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-indigo-300 focus:border-[#7A0808] w-full"
                                              required
                                            >
                                              <option value="">Select a service college...</option>
                                              {allColleges
                                                .filter((c) => c.code !== form.code && c.name !== form.name)
                                                .map((c) => (
                                                  <option key={c.id || c.code} value={c.code || c.name}>
                                                    {c.code} - {c.name}
                                                  </option>
                                                ))}
                                            </select>
                                          </div>
                                        )}

                                        {hasActiveServiceCollege && (
                                          <div className="inline-flex w-fit h-fit items-center gap-1.5 justify-self-start lg:self-end rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-bold text-[#7A0808]">
                                            <Building2 size={13} />
                                            <span>Inter-College Service Active</span>
                                          </div>
                                        )}
                                      </div>
                                      )}
                                      </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
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

                    {/* Sections Offered in Program Section */}
                    <div className="pt-3 border-t border-gray-100 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="form-label font-bold text-gray-800 mb-0 flex items-center gap-1.5 text-xs">
                          <Users size={14} className="text-[#7A0808]" />
                          <span>Sections & Target Enrollees in {program.code || `Program #${pIdx + 1}`}</span>
                        </label>
                        <span className="text-[10px] text-gray-400">
                          Auto-generated naming: {program.code || 'CODE'}1-A1, {program.code || 'CODE'}2-B1...
                        </span>
                      </div>

                      <div className="space-y-2">
                        {[1, 2, 3, 4, ...(program.extraYears || [])].map((yearNum) => {
                          const rawVal = program.sections?.[yearNum];
                          const count = rawVal !== undefined && rawVal !== '' ? Number(rawVal) : 0;
                          const rawCap = program.studentCapacities?.[yearNum] ?? '40';
                          const preview = count > 0 && program.code
                            ? generateSectionNames(program.code.trim().toUpperCase(), yearNum, count)
                            : [];

                          return (
                            <div
                              key={yearNum}
                              className={`p-3 rounded-xl border transition-all space-y-2.5 ${
                                program.ojtModality?.[yearNum]
                                  ? 'bg-amber-50/40 border-amber-200 shadow-2xs'
                                  : 'bg-gray-50/80 border-gray-200'
                              }`}
                            >
                              {/* Top row: Year, Sections, Capacity, and Preview chips */}
                              <div className="flex flex-wrap items-center gap-3">
                                {/* Year label */}
                                <div className="w-20 flex-shrink-0">
                                  <span className="text-xs font-black text-[#7A0808]">{getYearLabel(yearNum)}</span>
                                </div>

                                {/* Section count input */}
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-600 font-semibold">Sections:</span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={rawVal ?? ''}
                                    onChange={(e) => {
                                      const clean = e.target.value.replace(/[^0-9]/g, '');
                                      const formatted = clean === '' ? '' : String(parseInt(clean, 10));
                                      updateProgramSectionCount(pIdx, yearNum, formatted);
                                    }}
                                    className="form-input bg-white w-16 text-center text-xs font-bold py-1 px-2"
                                    placeholder="0"
                                  />
                                </div>

                                {/* Student capacity / Enrollees per section input */}
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-600 font-semibold">Students / Section:</span>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={rawCap}
                                    onChange={(e) => {
                                      const clean = e.target.value.replace(/[^0-9]/g, '');
                                      updateProgramSectionCapacity(pIdx, yearNum, clean);
                                    }}
                                    className="form-input bg-white w-16 text-center text-xs font-bold py-1 px-2"
                                    placeholder="40"
                                    title="Target student capacity per section"
                                  />
                                </div>

                                {/* Section name preview chips */}
                                <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                                  {preview.length > 0 ? (
                                    preview.map((name) => (
                                      <span
                                        key={name}
                                        className="px-2 py-0.5 rounded-full bg-[#7A0808]/10 text-[#7A0808] border border-[#7A0808]/20 text-[10px] font-bold flex items-center gap-1"
                                      >
                                        <span>{name}</span>
                                        <span className="text-[9px] text-[#7A0808]/70 font-normal">({rawCap || 40} stds)</span>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-gray-400 italic">
                                      {count > 0 ? 'Enter Program Code above to see name preview' : '0 sections (none)'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Bottom row: OJT Alternating Modality Toggle aligned to bottom right */}
                              <div className="flex items-center justify-end pt-1.5 border-t border-gray-200/60">
                                <label className="flex items-center gap-1.5 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-gray-200 hover:border-amber-400 transition-all select-none shadow-2xs">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(program.ojtModality?.[yearNum])}
                                    onChange={(e) => updateProgramSectionOjtModality(pIdx, yearNum, e.target.checked)}
                                    className="w-3.5 h-3.5 text-[#7A0808] rounded border-gray-300 focus:ring-[#7A0808] cursor-pointer"
                                  />
                                  <span className="text-[11px] font-bold text-gray-700">
                                    OJT Alternating (1 Wk Campus / 1 Wk OJT)
                                  </span>
                                  {program.ojtModality?.[yearNum] && (
                                    <span className="text-[9px] font-black uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 shrink-0">
                                      Active
                                    </span>
                                  )}
                                </label>
                              </div>
                            </div>
                          );
                        })}

                        {/* Add Year Button */}
                        <button
                          type="button"
                          onClick={() => addProgramExtraYear(pIdx)}
                          disabled={(program.extraYears || []).length >= 3}
                          className="flex items-center gap-1.5 text-xs font-bold text-[#7A0808] hover:text-[#5A0606] bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Plus size={13} /> Add Year Level (e.g. 5th Year)
                        </button>
                      </div>
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
          </div>

          {/* Fixed Non-Scrollable Action Buttons Footer */}
          <div className="bg-gray-50/80 border-t border-gray-200 px-6 py-4 flex gap-3 font-bold flex-shrink-0">
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
    <ServiceArrangementGuideCloud position={serviceGuidePosition} />
    <LoadingModal
      isOpen={loading}
      message={editingCollege ? 'Saving college changes...' : 'Saving college and programs...'}
    />
    {/* Global Confirmation & Notification Modal */}
    <ModalRenderer
      confirmState={confirmState}
      notificationState={{
        ...notificationState,
        onClose: () => {
          notificationState.onClose();
          if (closeAfterSuccess) {
            onSaveSuccess?.(savedCollegeCode);
            onClose();
          }
        },
      }}
    />
    </>
  );
}
