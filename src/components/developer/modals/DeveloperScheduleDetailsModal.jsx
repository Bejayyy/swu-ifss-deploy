import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Calendar,
  Clock,
  DoorOpen,
  Building,
  User,
  Mail,
  GraduationCap,
  Layers,
  Tag,
  Trash2,
  Code,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatScheduleHour, SCHEDULE_DAYS } from '../../../constants/scheduleGrid';

export default function DeveloperScheduleDetailsModal({
  schedule,
  onClose,
  onDelete,
}) {
  const [showRawJson, setShowRawJson] = useState(false);

  if (!schedule) return null;

  const title = schedule.title || schedule.subject || 'Untitled Course';
  const courseCode = schedule.courseCode || schedule.course || '';
  const section = schedule.section || schedule.sectionName || schedule.pathSection || 'N/A';
  const instructor = schedule.instructorFullName || schedule.instructor || 'Unassigned';
  const instructorEmail = schedule.instructorEmail || '';
  const roomCode = schedule.roomCode || schedule.room || schedule.roomId || 'Unassigned Room';
  const buildingName = schedule.buildingName || schedule.building || '';
  const type = schedule.type || 'Lecture';
  const scheduleMode = schedule.scheduleMode || 'regular';
  const modality = schedule.modality || 'regular';
  const semester = schedule.semester ? `Semester ${schedule.semester}` : 'N/A';
  const schoolYear = schedule.schoolYear || schedule.schoolYearLabel || schedule.schoolYearId || 'N/A';

  // Day & Time
  const dayName =
    typeof schedule.day === 'number' && SCHEDULE_DAYS[schedule.day]
      ? SCHEDULE_DAYS[schedule.day]
      : schedule.date || schedule.day || 'Scheduled Day';

  const startHour = schedule.startHour ?? schedule.start ?? 7;
  const endHour = schedule.endHour ?? schedule.end ?? 8;
  const timeFormatted = `${formatScheduleHour(startHour)} – ${formatScheduleHour(endHour)}`;
  const durationHours = Math.max(0, endHour - startHour);

  const isLab = String(type).toLowerCase().includes('lab');
  const isExam = String(type).toLowerCase().includes('exam') || scheduleMode === 'exam';

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-r from-red-50/70 via-white to-amber-50/50 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  isExam
                    ? 'bg-purple-100 text-purple-900 border-purple-300'
                    : isLab
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : 'bg-red-100 text-[#7A0808] border-red-300'
                }`}
              >
                <Tag size={11} />
                {isExam ? 'Exam Schedule' : type}
              </span>

              <span className="text-[11px] font-black bg-[#7A0808] text-white px-2.5 py-0.5 rounded-full">
                Section: {section}
              </span>

              {schedule.program && (
                <span className="text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 rounded-full">
                  {schedule.program}
                </span>
              )}
            </div>

            <h3 className="font-black text-xl text-gray-900 leading-tight">
              {courseCode ? `${courseCode} · ` : ''}{title}
            </h3>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Course Schedule Details & Allocation
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-sm">
          {/* Main Info Card */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 text-[#7A0808] flex items-center justify-center flex-shrink-0 mt-0.5">
                <BookOpen size={16} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Course & Subject Details</p>
                <p className="text-sm font-bold text-gray-900">{title}</p>
                {courseCode && (
                  <p className="text-xs font-semibold text-gray-600 mt-0.5">
                    Course Code: <span className="text-[#7A0808] font-black">{courseCode}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200/60 text-xs">
              <div>
                <p className="text-gray-400 font-medium">Academic Term:</p>
                <p className="font-bold text-gray-800">{semester} ({schoolYear})</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Schedule Mode:</p>
                <p className="font-bold text-gray-800 capitalize">{scheduleMode}</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Modality:</p>
                <p className="font-bold text-gray-800 capitalize">{modality}</p>
              </div>
              <div>
                <p className="text-gray-400 font-medium">Units / Lab Hours:</p>
                <p className="font-bold text-gray-800">{schedule.units || schedule.lecUnits || '—'} units</p>
              </div>
            </div>
          </div>

          {/* Instructor & Location Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Instructor */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7A0808]">
                <User size={15} />
                <span>Instructor Assignment</span>
              </div>
              <p className="text-xs font-bold text-gray-900">{instructor}</p>
              {instructorEmail && (
                <p className="text-xs text-gray-600 flex items-center gap-1">
                  <Mail size={12} className="text-gray-400" />
                  <span>{instructorEmail}</span>
                </p>
              )}
            </div>

            {/* Room & Time */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#7A0808]">
                <Clock size={15} />
                <span>Day, Time & Room</span>
              </div>
              <p className="text-xs font-bold text-gray-900">
                {dayName} · <span className="text-[#7A0808]">{timeFormatted}</span>
              </p>
              <p className="text-xs text-gray-700 flex items-center gap-1 font-medium">
                <DoorOpen size={12} className="text-gray-400" />
                <span>Room: <strong>{roomCode}</strong> {buildingName ? `(${buildingName})` : ''}</span>
              </p>
              <p className="text-[11px] text-gray-500 font-medium">
                Duration: {durationHours} hour(s)
              </p>
            </div>
          </div>

          {/* Document metadata for developer */}
          <div className="bg-gray-50/60 rounded-xl p-3.5 border border-gray-100 text-xs space-y-1 font-mono text-gray-600">
            <p className="flex items-center justify-between">
              <span className="text-gray-400 font-sans">Doc ID:</span>
              <span className="text-gray-800">{schedule.id}</span>
            </p>
            {schedule.docPath && (
              <p className="flex items-center justify-between">
                <span className="text-gray-400 font-sans">Firestore Path:</span>
                <span className="text-gray-800 text-[10px] truncate max-w-[340px]">{schedule.docPath}</span>
              </p>
            )}
            {schedule.deanUid && (
              <p className="flex items-center justify-between">
                <span className="text-gray-400 font-sans">Dean UID:</span>
                <span className="text-gray-800 truncate max-w-[280px]">{schedule.deanUid}</span>
              </p>
            )}
          </div>

          {/* Raw JSON Developer Toggle */}
          <div className="pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowRawJson((prev) => !prev)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors"
            >
              <Code size={13} />
              <span>{showRawJson ? 'Hide Raw Firestore Document' : 'View Raw Firestore Document (JSON)'}</span>
              {showRawJson ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showRawJson && (
              <pre className="mt-2 p-3 bg-gray-900 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-60">
                {JSON.stringify(schedule, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
          <button
            type="button"
            onClick={() => onDelete(schedule)}
            className="btn-delete text-xs py-2 px-3.5 gap-1.5 cursor-pointer flex items-center text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl font-bold transition-colors"
          >
            <Trash2 size={14} />
            <span>Delete Course Schedule</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
