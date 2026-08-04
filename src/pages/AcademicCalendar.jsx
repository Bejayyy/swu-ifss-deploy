import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, Clock, BookOpen, Download, FileText
} from 'lucide-react';
import Layout from '../components/Layout';
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
                  <div className="w-9 h-9 rounded-xl bg-red-50 text-[#800000] flex items-center justify-center">
                    <CalendarDays size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-900">
                      School Year Configuration
                    </h3>
                    <p className="text-xs font-semibold text-[#800000] mt-0.5">
                      {displaySchoolYear}
                    </p>
                  </div>
                </div>

                {/* Controls: Switch SY & Semester Filter */}
                <div className="flex flex-wrap items-center gap-3">
                  {schoolYears.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-gray-600">Switch SY:</label>
                      <select
                        value={activeSchoolYearId || ''}
                        onChange={(e) => setActiveSchoolYearId(e.target.value || null)}
                        className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 outline-none focus:border-[#800000]"
                      >
                        {schoolYears.map((sy) => (
                          <option key={sy.id} value={sy.id}>
                            {sy.displayLabel || `SY ${sy.label}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Semester Switcher Tabs (beside Switch S.Y. to the very right) */}
                  <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                    {['1', '2'].map((sem) => (
                      <button
                        key={sem}
                        type="button"
                        onClick={() => setExamSemTab(sem)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          examSemTab === sem
                            ? 'bg-[#800000] text-white shadow-2xs'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        Semester {sem}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Semester 1 Dates */}
                <div className={`p-4 rounded-xl border transition-all space-y-1 ${examSemTab === '1' ? 'border-[#800000] bg-amber-50/30 ring-1 ring-[#800000]/20' : 'border-gray-200 bg-gray-50/50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-gray-900">Semester 1</span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800">Term 1</span>
                  </div>
                  <p className="text-xs font-bold text-gray-700">
                    {config?.semester1Start ? formatDisplayDate(config.semester1Start) : 'Not set'} — {config?.semester1End ? formatDisplayDate(config.semester1End) : 'Not set'}
                  </p>
                </div>

                {/* Semester 2 Dates */}
                <div className={`p-4 rounded-xl border transition-all space-y-1 ${examSemTab === '2' ? 'border-[#800000] bg-blue-50/30 ring-1 ring-[#800000]/20' : 'border-gray-200 bg-gray-50/50'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black text-gray-900">Semester 2</span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-blue-100 text-blue-800">Term 2</span>
                  </div>
                  <p className="text-xs font-bold text-gray-700">
                    {config?.semester2Start ? formatDisplayDate(config.semester2Start) : 'Not set'} — {config?.semester2End ? formatDisplayDate(config.semester2End) : 'Not set'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Exam Period Range Overview Card */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-red-50 text-[#800000] flex items-center justify-center">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-gray-900">
                      Exam Period Ranges <span className="text-xs font-extrabold text-[#800000]">(Semester {examSemTab})</span>
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
                      <FileText size={14} className="text-[#800000]" />
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
                            <p className="text-[10px] font-extrabold text-[#800000]">{label}</p>
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
              <div className="w-9 h-9 rounded-xl bg-red-50 text-[#800000] flex items-center justify-center">
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
                className="px-4 py-2 rounded-xl bg-[#800000] text-white text-xs font-bold hover:bg-[#600000] transition-all flex items-center gap-2 shadow-2xs"
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
