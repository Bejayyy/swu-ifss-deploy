import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Clock,
  BookOpen,
  Download,
  FileText,
  Sparkles,
} from 'lucide-react';
import Layout from '../components/Layout';
import CustomSelect from '../components/ui/CustomSelect';
import { useAuth } from '../context/AuthContext';
import { useAcademicCalendar } from '../hooks/useAcademicCalendar';
import ModernCalendarView from '../components/calendar/ModernCalendarView';
import {
  formatDisplayDate,
  formatExamRange,
  normalizeExamPeriods,
} from '../utils/academicCalendarUtils';

export default function AcademicCalendar() {
  const {
    schoolYears,
    activeSchoolYearId,
    setActiveSchoolYearId,
    calendarData,
  } = useAcademicCalendar();

  const { profile } = useAuth();
  const isRegistrar = profile?.role === 'registrar' || profile?.role === 'developer';

  const [examSemTab, setExamSemTab] = useState('1');

  const { config } = calendarData;
  const examPeriods = useMemo(() => normalizeExamPeriods(config?.examPeriods), [config?.examPeriods]);

  const configuredSemesters = useMemo(() => {
    if (Array.isArray(config?.semesters) && config.semesters.length > 0) {
      return config.semesters.map((s, idx) => ({
        key: String(idx + 1),
        id: s.id,
        name: s.name || (idx === 2 ? 'Summer' : `Semester ${idx + 1}`),
        start: s.start || '',
        end: s.end || '',
      }));
    }
    return [
      { key: '1', id: 'sem_1', name: 'Semester 1', start: config?.semester1Start || '', end: config?.semester1End || '' },
      { key: '2', id: 'sem_2', name: 'Semester 2', start: config?.semester2Start || '', end: config?.semester2End || '' },
    ];
  }, [config]);

  const activeSchoolYear = schoolYears.find((sy) => sy.id === activeSchoolYearId);
  const displaySchoolYear = activeSchoolYear?.displayLabel || (config?.label ? `SY ${config.label}` : 'Active School Year');

  return (
    <Layout
      title="School Calendar"
      subtitle="Interactive Academic Calendar, Major Examination Periods, and Important School Dates"
    >
      <div className="space-y-6">
        
        {/* 1. INTERACTIVE DUAL-PANE CALENDAR UI */}
        <ModernCalendarView
          schoolYearId={activeSchoolYearId}
          schoolYearLabel={displaySchoolYear}
          isRegistrar={isRegistrar}
        />

        {/* 2. School Year Configuration Overview Card */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#7A0808] flex items-center justify-center">
                <CalendarDays size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">
                  School Year & Semester Schedules
                </h3>
                <p className="text-xs font-semibold text-[#7A0808] mt-0.5">
                  {displaySchoolYear}
                </p>
              </div>
            </div>

            {/* Controls: Switch SY */}
            {schoolYears.length > 0 && (
              <div className="flex items-center gap-2 min-w-[200px]">
                <label className="text-xs font-bold text-gray-600 shrink-0">Switch SY:</label>
                <CustomSelect
                  size="sm"
                  value={activeSchoolYearId || ''}
                  onChange={(e) => setActiveSchoolYearId(e.target.value || null)}
                  options={schoolYears.map((sy) => ({
                    value: sy.id,
                    label: sy.displayLabel || `SY ${sy.label}`,
                  }))}
                  placeholder="School Year"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {configuredSemesters.map((sem, index) => {
              const isSelected = examSemTab === sem.key;
              const isSummer = (sem.name || '').toLowerCase().includes('summer');
              return (
                <div
                  key={sem.key}
                  onClick={() => setExamSemTab(sem.key)}
                  className={`p-4 rounded-xl border transition-all space-y-1 cursor-pointer ${
                    isSelected
                      ? 'border-[#7A0808] bg-red-50/20 ring-1 ring-[#7A0808]/20'
                      : 'border-gray-200 bg-gray-50/50 hover:bg-gray-100/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-gray-900">{sem.name}</span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                      isSummer
                        ? 'bg-amber-100 text-amber-800'
                        : index === 0
                        ? 'bg-red-100 text-red-800'
                        : index === 1
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {isSummer ? 'Summer' : `Term ${index + 1}`}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-gray-700">
                    {sem.start ? formatDisplayDate(sem.start) : 'Not set'} — {sem.end ? formatDisplayDate(sem.end) : 'Not set'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Exam Period Range Overview Card */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#7A0808] flex items-center justify-center">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">
                  Major Examination Period Ranges{' '}
                  <span className="text-xs font-extrabold text-[#7A0808]">
                    ({configuredSemesters.find((s) => s.key === examSemTab)?.name || `Semester ${examSemTab}`})
                  </span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Scheduled dates for Freshmen and Upperclassmen
                </p>
              </div>
            </div>

            {/* Semester Switcher Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 gap-1 flex-wrap">
              {configuredSemesters.map((sem) => (
                <button
                  key={sem.key}
                  type="button"
                  onClick={() => setExamSemTab(sem.key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    examSemTab === sem.key
                      ? 'bg-[#7A0808] text-white shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {sem.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { key: 'p1', label: 'P1 Period', bg: '#FFF5F5', border: '#F3CACA' },
              { key: 'p2', label: 'P2 Period', bg: '#FFFAF0', border: '#F5D5A3' },
              { key: 'p3', label: 'P3 Period', bg: '#FBF5FF', border: '#E9D8FD' },
              { key: 'rbe', label: 'RBE Period', bg: '#F0FFF4', border: '#B7E4C7' },
            ].map((period) => (
              <div
                key={period.key}
                className="p-4 border rounded-2xl space-y-3"
                style={{ background: period.bg, borderColor: period.border }}
              >
                <h4 className="font-black text-xs text-gray-900 flex items-center gap-1.5">
                  <FileText size={14} className="text-[#7A0808]" />
                  {period.label}
                </h4>

                <div className="space-y-2">
                  {[
                    { level: 'fr', label: 'Freshmen (1st Year)' },
                    { level: 'up', label: 'Upperclassmen' },
                  ].map(({ level, label }) => {
                    const data = examPeriods[examSemTab]?.[period.key]?.[level];
                    const rangeText = formatExamRange(data);

                    return (
                      <div
                        key={level}
                        className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-2xs space-y-1"
                      >
                        <p className="text-[10px] font-extrabold text-[#7A0808]">{label}</p>
                        <p className="text-xs font-bold text-gray-800">
                          {rangeText || 'Dates not set'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </Layout>
  );
}
