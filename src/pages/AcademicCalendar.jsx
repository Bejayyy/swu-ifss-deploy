import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Clock, BookOpen, Download, FileText
} from 'lucide-react';
import Layout from '../components/Layout';
import CustomSelect from '../components/ui/CustomSelect';
import { useAuth } from '../context/AuthContext';
import { useAcademicCalendar } from '../hooks/useAcademicCalendar';
import {
  subscribeSchoolCalendarPdf,
} from '../services/academicCalendarService';
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
  const [calendarPdfData, setCalendarPdfData] = useState(null);

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

  useEffect(() => {
    const unsub = subscribeSchoolCalendarPdf(
      (data) => setCalendarPdfData(data),
      (err) => console.error('Error loading PDF calendar:', err)
    );
    return () => unsub();
  }, []);

  return (
    <Layout
      title="School Calendar"
      subtitle={isRegistrar ? "View active school year terms, exam period ranges, and official school calendar document" : "Official School Calendar Document"}
    >
      <div className="space-y-6">
        
        {/* Registrar & Developer View: School Year Config & Exam Period Ranges */}
        {isRegistrar && (
          <>
            {/* 1. School Year Configuration Overview Card */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-50 text-[#7A0808] flex items-center justify-center">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-900">
                      School Year Configuration
                    </h3>
                    <p className="text-xs font-semibold text-[#7A0808] mt-0.5">
                      {displaySchoolYear}
                    </p>
                  </div>
                </div>

                {/* Controls: Switch SY & Semester Filter */}
                <div className="flex flex-wrap items-center gap-3">
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

                  {/* Semester Switcher Tabs (beside Switch S.Y. to the very right) */}
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {configuredSemesters.map((sem, index) => {
                  const isSelected = examSemTab === sem.key;
                  const isSummer = (sem.name || '').toLowerCase().includes('summer');
                  return (
                    <div
                      key={sem.key}
                      className={`p-4 rounded-xl border transition-all space-y-1 ${
                        isSelected
                          ? 'border-[#7A0808] bg-red-50/20 ring-1 ring-[#7A0808]/20'
                          : 'border-gray-200 bg-gray-50/50'
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

            {/* 2. Exam Period Range Overview Card */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-50 text-[#7A0808] flex items-center justify-center">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-900">
                      Exam Period Ranges{' '}
                      <span className="text-xs font-extrabold text-[#7A0808]">
                        ({configuredSemesters.find((s) => s.key === examSemTab)?.name || `Semester ${examSemTab}`})
                      </span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Scheduled dates for Freshmen and Upperclassmen
                    </p>
                  </div>
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
          </>
        )}

        {/* 3. Official School Calendar (PDF Document Viewer Card) */}
        <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#7A0808] flex items-center justify-center">
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900">
                  Official School Calendar Document
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {calendarPdfData?.pdfFileName || 'School_Calendar.pdf'} {calendarPdfData?.uploadedBy ? `· Published by ${calendarPdfData.uploadedBy}` : ''}
                </p>
              </div>
            </div>

            {calendarPdfData?.pdfUrl && (
              <a
                href={calendarPdfData.pdfUrl}
                download={calendarPdfData.pdfFileName || 'School_Calendar.pdf'}
                className="px-4 py-2 rounded-xl bg-[#7A0808] text-white text-xs font-bold hover:bg-[#600000] transition-all flex items-center gap-2 shadow-2xs"
              >
                <Download size={14} /> Download PDF
              </a>
            )}
          </div>

          {calendarPdfData?.pdfUrl ? (
            <div className="rounded-2xl overflow-hidden border border-gray-200 bg-gray-900 shadow-sm">
              <iframe
                src={calendarPdfData.pdfUrl}
                title="Official School Calendar PDF"
                className="w-full h-[650px] border-none"
              />
            </div>
          ) : (
            <div className="p-12 text-center bg-gray-50 border border-gray-200 rounded-2xl">
              <p className="text-xs font-bold text-gray-500">
                No official PDF school calendar document has been uploaded by the Registrar yet.
              </p>
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
