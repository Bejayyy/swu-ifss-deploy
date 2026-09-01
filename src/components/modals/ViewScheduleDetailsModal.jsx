import React from 'react';
import {
  X,
  BookOpen,
  Clock,
  Calendar,
  Building2,
  DoorOpen,
  User,
  GraduationCap,
  Layers,
  Edit2,
  Trash2,
  Tag,
  CheckCircle,
  RefreshCw,
  Users,
} from 'lucide-react';
import { formatScheduleHour, SCHEDULE_DAYS } from '../../constants/scheduleGrid';

export default function ViewScheduleDetailsModal({
  block,
  scheduleEntries = [],
  onClose,
  onEdit,
  onDelete,
  canEdit = false,
  schoolYearLabel,
  semesterLabel,
}) {
  if (!block) return null;

  const raw = block.rawEntry || {};

  const title = block.title || raw.title || raw.subject || 'Untitled Course';
  const courseCode = block.course || block.courseCode || raw.courseCode || raw.course || '';
  const instructor = block.instructorFullName || raw.instructor || block.instructor || 'Unassigned';
  const section = block.section || block.sectionName || raw.section || raw.sectionName || 'N/A';
  const program = block.program || block.programCode || raw.program || raw.programCode || '';
  const yearLevel = block.yearLevel || raw.yearLevel || '';
  const roomCode = block.roomCode || raw.roomCode || 'Unassigned Room';
  const buildingName = block.buildingName || raw.buildingName || '';
  const type = block.type || raw.type || 'Lecture';
  const modality = raw.modality || block.modality || 'regular';
  const scheduleMode = block.scheduleMode || raw.scheduleMode || 'regular';

  // Day & Time computation
  const dayName =
    typeof block.day === 'number' && SCHEDULE_DAYS[block.day]
      ? SCHEDULE_DAYS[block.day]
      : block.date || raw.date || 'Scheduled Day';

  const startHour = block.start ?? raw.startHour ?? 7;
  const endHour = block.end ?? raw.endHour ?? 8;
  const timeFormatted = `${formatScheduleHour(startHour)} – ${formatScheduleHour(endHour)}`;

  const durationHours = Math.max(0, endHour - startHour);
  const fullHours = Math.floor(durationHours);
  const minutes = Math.round((durationHours % 1) * 60);
  const durationText = `${fullHours > 0 ? `${fullHours} hr ` : ''}${minutes > 0 ? `${minutes} min` : ''}`.trim() || '1 hr';

  // Modality display text
  const modalityMap = {
    regular: 'Every Week (Classroom)',
    'odd-weeks': 'Classroom (Odd Wks) / OJT (Even Wks)',
    'even-weeks': 'Classroom (Even Wks) / OJT (Odd Wks)',
  };
  const modalityLabel = modalityMap[modality] || 'Every Week (Classroom)';

  // Type badge styling
  const isLab = String(type).toLowerCase().includes('lab');
  const isExam = String(type).toLowerCase().includes('exam') || scheduleMode === 'exam';

  // A course component may be matched across multiple days (for example,
  // one lecture hour on Monday and one on Wednesday). Compliance must use
  // the combined weekly duration, not only the block currently being viewed.
  const normalize = (value) => String(value || '').trim().toLowerCase();
  const componentKind = isLab ? 'lab' : isExam ? 'exam' : 'lecture';
  const matchingEntries = scheduleEntries.filter((entry) => {
    const entryType = normalize(entry.type);
    const entryKind = entryType.includes('lab')
      ? 'lab'
      : entryType.includes('exam') || normalize(entry.scheduleMode) === 'exam'
        ? 'exam'
        : 'lecture';
    const entryCode = entry.courseCode || entry.course || entry.code;
    const entrySection = entry.section || entry.sectionName;
    const modeMatches = normalize(entry.scheduleMode || 'regular') === normalize(scheduleMode || 'regular');

    return normalize(entryCode) === normalize(courseCode)
      && normalize(entrySection) === normalize(section)
      && entryKind === componentKind
      && modeMatches;
  });
  const weeklyDurationHours = matchingEntries.length > 0
    ? matchingEntries.reduce(
      (total, entry) => total + Math.max(0, Number(entry.endHour ?? entry.end ?? 0) - Number(entry.startHour ?? entry.start ?? 0)),
      0,
    )
    : durationHours;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 relative bg-gradient-to-r from-red-50/70 via-white to-amber-50/50">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                isExam
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : isLab
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-red-100 text-[#7A0808] border border-red-200'
              }`}
            >
              <Tag size={11} />
              {isExam ? 'Exam Schedule' : type}
            </span>

            {program && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                <GraduationCap size={11} className="text-amber-700" />
                {program}
              </span>
            )}
          </div>

          <h3 className="font-black text-xl text-gray-900 leading-tight">
            {courseCode ? `${courseCode} · ` : ''}{title}
          </h3>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Class Schedule Block Details
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          {/* Main Info Card */}
          <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100 space-y-3">
            {/* Subject Code & Title */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100/80 text-[#7A0808] flex items-center justify-center flex-shrink-0 mt-0.5">
                <BookOpen size={16} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Course / Subject</p>
                <p className="text-sm font-bold text-gray-800 leading-snug">
                  {title}
                </p>
                {courseCode && courseCode !== title && (
                  <p className="text-xs font-semibold text-gray-500 mt-0.5">
                    Code: <span className="text-[#7A0808] font-bold">{courseCode}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Section & Year Level */}
            <div className="flex items-start gap-3 pt-2 border-t border-gray-200/60">
              <div className="w-8 h-8 rounded-lg bg-amber-100/80 text-amber-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Layers size={16} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Section & Year Level</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs font-black bg-[#7A0808] text-white px-2.5 py-0.5 rounded-md">
                    {section}
                  </span>
                  {yearLevel && (
                    <span className="text-xs font-bold text-gray-700 bg-gray-200 px-2 py-0.5 rounded-md">
                      {yearLevel}
                    </span>
                  )}
                  {program && (
                    <span className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                      Program: {program}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Assigned Instructor */}
            <div className="flex items-start gap-3 pt-2 border-t border-gray-200/60">
              <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-blue-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User size={16} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Assigned Instructor</p>
                <p className="text-xs font-bold text-gray-800 mt-0.5">
                  {instructor}
                </p>
              </div>
            </div>
          </div>

          {/* Schedule Timing & Location Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Day & Time */}
            <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1">
                <Calendar size={14} className="text-[#7A0808]" />
                <span>Day & Time</span>
              </div>
              <p className="text-xs font-black text-gray-900">{dayName}</p>
              <p className="text-xs font-bold text-[#7A0808] mt-0.5 flex items-center gap-1">
                <Clock size={12} />
                <span>{timeFormatted}</span>
              </p>
              <span className="inline-block mt-1.5 text-[10px] font-bold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-2xs">
                Duration: {durationText}
              </span>
            </div>

            {/* Room & Building */}
            <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-100">
              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 mb-1">
                <DoorOpen size={14} className="text-[#7A0808]" />
                <span>Assigned Room</span>
              </div>
              <p className="text-xs font-black text-gray-900">{roomCode}</p>
              {buildingName && (
                <p className="text-xs font-semibold text-gray-500 mt-0.5 flex items-center gap-1">
                  <Building2 size={12} className="text-gray-400" />
                  <span>{buildingName}</span>
                </p>
              )}
              <span className="inline-block mt-1.5 text-[10px] font-bold text-gray-600 bg-white border border-gray-200 px-2 py-0.5 rounded-md shadow-2xs">
                Type: {type}
              </span>
            </div>
          </div>

          {/* Rotational Modality & Combined Sections Info */}
          {((block.rotationCycle && block.rotationCycle !== 'all') || (raw.rotationCycle && raw.rotationCycle !== 'all') || block.partnerSection || raw.partnerSection || block.isCombinedSection || raw.isCombinedSection) && (
            <div className="p-3.5 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-purple-50/70 border border-blue-200/80 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800 flex items-center gap-1.5">
                  <RefreshCw size={13} className="text-[#7A0808]" /> Rotational Modality & Capacity
                </span>
                {(block.rotationCycle === 'week_a' || raw.rotationCycle === 'week_a') && (
                  <span className="text-[10px] font-black uppercase text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-300">
                    🔵 Week A (Odd Weeks)
                  </span>
                )}
                {(block.rotationCycle === 'week_b' || raw.rotationCycle === 'week_b') && (
                  <span className="text-[10px] font-black uppercase text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-full border border-purple-300">
                    🟣 Week B (Even Weeks)
                  </span>
                )}
              </div>

              {(block.partnerSection || raw.partnerSection) && (
                <p className="text-[11px] text-gray-700">
                  Rotational Partner Section: <strong className="text-gray-900">{block.partnerSection || raw.partnerSection}</strong> (takes over room during reciprocal weeks)
                </p>
              )}

              {(block.isCombinedSection || raw.isCombinedSection) && (
                <div className="pt-1.5 border-t border-blue-200/60 flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-purple-900 flex items-center gap-1">
                    <Users size={12} /> Combined Sections:
                  </span>
                  {(block.combinedSections || raw.combinedSections || []).map((sec) => (
                    <span key={sec} className="bg-white px-2 py-0.5 rounded border border-purple-200 text-purple-800 font-bold text-[10px] shadow-2xs">
                      {sec}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Required Hours & Time Compliance Status */}
          {(() => {
            const reqHours = isLab
              ? Number(raw.labHours || block.labHours || (Number(raw.labUnits || block.labUnits || 1) * 3))
              : Number(raw.lecHours || block.lecHours || (Number(raw.lecUnits || block.lecUnits || raw.units || block.units || 2) * 1));
            
            const roundedDuration = Math.round(weeklyDurationHours * 10) / 10;
            const roundedReq = Math.round(reqHours * 10) / 10;
            const diffHours = Math.round(Math.abs(roundedDuration - roundedReq) * 10) / 10;

            if (roundedDuration === roundedReq) {
              return (
                <div className="p-3 bg-emerald-50/90 border border-emerald-300 rounded-xl flex items-center justify-between gap-2 text-emerald-900">
                  <div className="flex items-center gap-2">
                    <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
                    <p className="text-xs font-semibold">
                      Exact Match: Weekly plotted time (<strong>{roundedDuration} hrs</strong>) matches the required <strong>{roundedReq} hrs/week</strong> for {type}.
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-emerald-600 text-white whitespace-nowrap">
                    ✓ Exact Match
                  </span>
                </div>
              );
            } else if (roundedDuration > roundedReq) {
              return (
                <div className="p-3 bg-red-50/95 border-2 border-red-500 rounded-xl flex items-center justify-between gap-2 text-red-950 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-red-600 flex-shrink-0" />
                    <p className="text-xs font-bold">
                      Overlapping / Exceeding Time: Weekly plotted time (<strong>{roundedDuration} hrs</strong>) exceeds the required <strong>{roundedReq} hrs/week</strong> by <strong>{diffHours} hr(s)</strong>.
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-600 text-white whitespace-nowrap">
                    ⚠️ +{diffHours}h Over
                  </span>
                </div>
              );
            } else {
              return (
                <div className="p-3 bg-red-50/95 border-2 border-red-500 rounded-xl flex items-center justify-between gap-2 text-red-950 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Clock size={15} className="text-red-600 flex-shrink-0" />
                    <p className="text-xs font-bold">
                      Lacking Time: Weekly plotted time (<strong>{roundedDuration} hrs</strong>) is lacking <strong>{diffHours} hr(s)</strong> to meet the required <strong>{roundedReq} hrs/week</strong>.
                    </p>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-red-600 text-white whitespace-nowrap">
                    ⚠️ -{diffHours}h Lacking
                  </span>
                </div>
              );
            }
          })()}

          {/* Additional Details */}
          <div className="bg-gray-50/50 rounded-xl p-3 border border-gray-100 flex items-center justify-between text-xs font-medium text-gray-600 flex-wrap gap-2">
            <span className="flex items-center gap-1.5">
              <CheckCircle size={13} className="text-green-600" />
              <span>Modality: <strong>{modalityLabel}</strong></span>
            </span>
            {(schoolYearLabel || semesterLabel) && (
              <span className="text-gray-400 text-[11px]">
                {[schoolYearLabel, semesterLabel].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
          <div className="flex items-center gap-2">
            {canEdit && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(block)}
                className="btn-delete text-xs py-2 px-3.5 gap-1.5 cursor-pointer flex items-center"
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all cursor-pointer"
            >
              Close
            </button>

            {canEdit && onEdit && (
              <button
                type="button"
                onClick={() => onEdit(block)}
                className="btn-maroon text-xs py-2 px-4 gap-1.5 shadow-2xs cursor-pointer flex items-center font-bold"
              >
                <Edit2 size={13} />
                <span>Edit Schedule</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
