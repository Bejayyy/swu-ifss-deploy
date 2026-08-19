import React, { useEffect, useMemo, useState } from 'react';
import { X, Calendar, User, Filter } from 'lucide-react';
import WeeklyScheduleGrid from '../scheduling/WeeklyScheduleGrid';
import { subscribePlotEntriesForTeacher } from '../../services/plotScheduleService';
import { entriesToGridBlocks } from '../../services/plotScheduleService';

export default function TeacherScheduleModal({ teacher, onClose, initialSemester = '1', collegeCode }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [semester, setSemester] = useState(initialSemester);
  const [selectedSection, setSelectedSection] = useState('all');

  // Subscribe to all schedule entries for this teacher
  useEffect(() => {
    if (!teacher?.name) {
      setLoading(false);
      return;
    }

    console.log('Fetching schedules for teacher:', teacher.name, 'semester:', semester);
    setLoading(true);

    return subscribePlotEntriesForTeacher(
      teacher.name, // Teacher's full name
      semester,
      (data) => {
        console.log('Teacher schedule entries:', data);
        setEntries(data);
        setLoading(false);
      },
      (err) => {
        console.error('Error loading teacher schedule:', err);
        setLoading(false);
      }
    );
  }, [teacher?.name, semester]);

  // Get unique sections from entries
  const sections = useMemo(() => {
    const uniqueSections = [...new Set(entries.map(e => e.section))].filter(Boolean).sort();
    return uniqueSections;
  }, [entries]);

  // Filter entries by selected section
  const filteredEntries = useMemo(() => {
    if (selectedSection === 'all') return entries;
    return entries.filter(e => e.section === selectedSection);
  }, [entries, selectedSection]);

  // Convert entries to grid blocks (use weekday format for regular schedule)
  const weekDates = Array.from({ length: 7 }, (_, i) => `weekday-${i}`);
  const gridBlocks = useMemo(
    () => entriesToGridBlocks(filteredEntries, weekDates),
    [filteredEntries]
  );

  // Group blocks by section for summary
  const blocksBySection = useMemo(() => {
    const groups = {};
    filteredEntries.forEach(entry => {
      const section = entry.section || 'Unknown Section';
      if (!groups[section]) {
        groups[section] = [];
      }
      groups[section].push(entry);
    });
    return groups;
  }, [filteredEntries]);

  const totalHours = useMemo(() => {
    return filteredEntries.reduce((sum, entry) => {
      const duration = (entry.endHour || 0) - (entry.startHour || 0);
      return sum + duration;
    }, 0);
  }, [filteredEntries]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full relative flex flex-col"
        style={{ maxWidth: '95vw', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-7 pb-4 border-b border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-5 top-5 text-gray-400 hover:text-gray-700"
          >
            <X size={20} />
          </button>

          <div className="mb-3">
            <h2 className="font-black text-xl mb-1" style={{ color: '#2B3235' }}>
              Teacher Schedule
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <User size={16} className="text-[#7A0808]" />
                <span className="text-sm font-bold text-gray-700">
                  {teacher.name}
                </span>
              </div>
              {collegeCode && (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-[#7A0808] text-white">
                  {collegeCode}
                </span>
              )}
            </div>
          </div>

          {/* Semester and Section Filters */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {/* Semester Selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-600">Semester:</label>
              <div className="inline-flex w-fit items-center p-1 gap-1 shadow-sm" style={{ background: '#F9FAFB', borderRadius: 8 }}>
                {['1', '2'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSemester(s);
                      setSelectedSection('all'); // Reset section filter when changing semester
                    }}
                    className="px-3 py-1 text-xs font-bold transition-all"
                    style={semester === s ? { background: '#7A0808', color: 'white', borderRadius: 8 } : { background: 'transparent', color: '#2B3235', borderRadius: 8 }}
                  >
                    Sem {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Section Filter */}
            {sections.length > 0 && (
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-gray-400" />
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="px-3 py-1 text-xs font-bold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7A0808]/20"
                  style={{ color: '#2B3235' }}
                >
                  <option value="all">All Sections ({entries.length})</option>
                  {sections.map(section => {
                    const count = entries.filter(e => e.section === section).length;
                    return (
                      <option key={section} value={section}>
                        {section} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Summary Stats */}
          {!loading && filteredEntries.length > 0 && (
            <div className="flex gap-4 mt-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-600">
                  {filteredEntries.length} {filteredEntries.length === 1 ? 'class' : 'classes'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600">
                  {Object.keys(blocksBySection).length} {Object.keys(blocksBySection).length === 1 ? 'section' : 'sections'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600">
                  {totalHours.toFixed(1)} hours/week
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Body - Scrollable */}
        <div className="flex-1 overflow-y-auto px-8 py-5">
          {loading ? (
            <div className="text-center py-12">
              <p className="text-sm font-semibold text-gray-400">Loading schedule...</p>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <Calendar size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-sm font-semibold text-gray-400 mb-2">No schedule entries found</p>
              <p className="text-xs text-gray-400">
                {teacher.name} has no scheduled classes for Semester {semester}.
              </p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-12">
              <Filter size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-sm font-semibold text-gray-400 mb-2">No classes for selected section</p>
              <p className="text-xs text-gray-400">
                Try selecting "All Sections" or a different section.
              </p>
            </div>
          ) : (
            <>
              {/* Weekly Schedule Grid */}
              <WeeklyScheduleGrid
                title={`${teacher.name}'s Weekly Schedule`}
                semester={semester}
                showControls={false}
                showDayDates={false}
                blocks={gridBlocks}
                readOnly={true}
                showLegend={true}
                emptyMessage="No classes scheduled for this week"
              />

              {/* Schedule by Section */}
              <div className="mt-6 bg-gray-50 rounded-xl p-4">
                <h3 className="font-bold text-sm mb-3" style={{ color: '#2B3235' }}>
                  Schedule by Section
                </h3>
                <div className="space-y-3">
                  {Object.entries(blocksBySection).map(([section, sectionEntries]) => (
                    <div key={section} className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-[#7A0808]">
                          {section}
                        </span>
                        <span className="text-[10px] font-bold text-gray-500">
                          {sectionEntries.length} {sectionEntries.length === 1 ? 'class' : 'classes'}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {sectionEntries.map((entry, idx) => (
                          <div key={idx} className="text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-700">
                                {entry.courseCode}
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                entry.type === 'Lecture' ? 'bg-red-100 text-red-700' :
                                entry.type === 'Laboratory' ? 'bg-green-100 text-green-700' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {entry.type}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {entry.date || 'Day not set'} · {entry.startHour?.toFixed(2) || '0'}:00 - {entry.endHour?.toFixed(2) || '0'}:00
                              {entry.roomCode && ` · ${entry.roomCode}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline-maroon"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
