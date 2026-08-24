import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Send,
  ChevronDown,
  Search,
  Trash2,
  Calendar,
  Mail,
  Building2,
  DoorOpen,
  Sparkles,
  CheckCircle2,
  Users,
  Filter,
  Check,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Info,
  Layers,
  FlaskConical,
  GraduationCap,
  BookOpen,
  Lock,
} from 'lucide-react';
import DatePicker from '../ui/DatePicker';
import CustomSelect from '../ui/CustomSelect';
import { subscribeColleges } from '../../services/collegeService';
import { subscribeToBuildings } from '../../services/buildingService';
import { grantFirstCollegeAccess } from '../../services/scheduleAccessService';
import { analyzeCollegeRoomRequirements } from '../../services/scheduleAiService';
import { useAuth } from '../../context/AuthContext';

export default function GrantScheduleAccessModal({
  isOpen,
  onClose,
  schoolYearId,
  semester,
  semesterLabel,
  initialCollegeCodes = [],
  initialStartDate = '',
  initialEndDate = '',
  initialAssignedRooms = [],
  onReset,
  onSave,
  onSuccess,
}) {
  const { profile } = useAuth();

  // Tab State
  const [activeTab, setActiveTab] = useState('dean'); // 'dean' | 'rooms'

  // Tab 1: Dean & Window State
  const [colleges, setColleges] = useState([]);
  const [selectedCollegeCodes, setSelectedCollegeCodes] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(true);
  const [collegeSearch, setCollegeSearch] = useState('');
  const [loadingColleges, setLoadingColleges] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sendEmailNotification, setSendEmailNotification] = useState(true);

  // Tab 2: Building & Room Allocation State
  const [buildings, setBuildings] = useState([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);
  const [selectedRooms, setSelectedRooms] = useState([]); // array of roomCode strings
  const [expandedBuildings, setExpandedBuildings] = useState({});
  const [roomSearch, setRoomSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('ALL'); // 'ALL' | buildingId
  const [roomTypeFilter, setRoomTypeFilter] = useState('ALL'); // 'ALL' | 'Lecture' | 'Laboratory'

  // AI Curriculum Analyzer State
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [expandedPrograms, setExpandedPrograms] = useState({});

  const toggleExpandProgram = (progCode) => {
    setExpandedPrograms((prev) => ({ ...prev, [progCode]: !prev[progCode] }));
  };

  // General Modal State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef(null);
  const wasOpenRef = useRef(false);

  // Initialize initial values ONLY once when modal opens (prevents tab jump to tab 1 during saving)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setActiveTab('dean');
      setSelectedCollegeCodes(initialCollegeCodes || []);
      setSelectedRooms(initialAssignedRooms || []);
      const today = new Date().toISOString().split('T')[0];
      const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setStartDate(initialStartDate || today);
      setEndDate(initialEndDate || sevenDays);
      setError('');
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, initialCollegeCodes, initialStartDate, initialEndDate, initialAssignedRooms]);

  // Subscribe to Colleges
  useEffect(() => {
    if (!isOpen) return undefined;
    setLoadingColleges(true);
    return subscribeColleges(
      (collegeList) => {
        setColleges(collegeList);
        setLoadingColleges(false);
      },
      (err) => {
        console.error('Error loading colleges:', err);
        setError('Failed to load colleges.');
        setLoadingColleges(false);
      }
    );
  }, [isOpen]);

  // Subscribe to Buildings & Rooms
  useEffect(() => {
    if (!isOpen) return undefined;
    setLoadingBuildings(true);
    return subscribeToBuildings(
      (data) => {
        setBuildings(data);
        // Default expand all buildings
        const expandedMap = {};
        data.forEach((b) => {
          expandedMap[b.id] = true;
        });
        setExpandedBuildings(expandedMap);
        setLoadingBuildings(false);
      },
      (err) => {
        console.error('Error loading buildings:', err);
        setLoadingBuildings(false);
      }
    );
  }, [isOpen]);

  // Trigger AI Analysis whenever selected college or semester changes
  useEffect(() => {
    if (!isOpen || selectedCollegeCodes.length === 0) {
      setAiAnalysis(null);
      return;
    }

    let isMounted = true;
    setLoadingAi(true);

    analyzeCollegeRoomRequirements(selectedCollegeCodes, semester, colleges)
      .then((res) => {
        if (isMounted) {
          setAiAnalysis(res);
          setLoadingAi(false);
          // Default expand all program breakdown cards
          if (Array.isArray(res?.programs)) {
            const exp = {};
            res.programs.forEach((p) => {
              exp[p.programCode] = true;
            });
            setExpandedPrograms(exp);
          }
        }
      })
      .catch((err) => {
        console.error('AI analysis error:', err);
        if (isMounted) setLoadingAi(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedCollegeCodes, semester, colleges]);

  // Duration calculation
  const getDurationDays = () => {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end.getTime() - start.getTime();
    if (isNaN(diffTime) || diffTime < 0) return null;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  // Filtered Colleges (Tab 1)
  const filteredColleges = useMemo(() => {
    if (!collegeSearch.trim()) return colleges;
    const q = collegeSearch.toLowerCase();
    return colleges.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.code && c.code.toLowerCase().includes(q))
    );
  }, [colleges, collegeSearch]);

  const isAllCollegesSelected =
    colleges.length > 0 && selectedCollegeCodes.length === colleges.length;

  const toggleSelectAllColleges = () => {
    if (isAllCollegesSelected) {
      setSelectedCollegeCodes([]);
    } else {
      setSelectedCollegeCodes(colleges.map((c) => c.code));
    }
  };

  const toggleCollegeCode = (code) => {
    setSelectedCollegeCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const getCollegeDropdownLabel = () => {
    if (selectedCollegeCodes.length === 0) return 'Choose college(s)...';
    if (selectedCollegeCodes.length === colleges.length && colleges.length > 0) {
      return `All Colleges Selected (${colleges.length})`;
    }
    if (selectedCollegeCodes.length === 1) {
      const c = colleges.find((x) => x.code === selectedCollegeCodes[0]);
      return c ? `${c.name} (${c.code})` : selectedCollegeCodes[0];
    }
    return `${selectedCollegeCodes.length} Colleges Selected (${selectedCollegeCodes.join(', ')})`;
  };

  // Flatten all rooms across all buildings for search, filtering, and metrics
  // Flatten all rooms across all buildings for search, filtering, and metrics
  const allFlattenedRooms = useMemo(() => {
    const list = [];
    buildings.forEach((b) => {
      const floors = Array.isArray(b.floorData) ? b.floorData : [];
      floors.forEach((f) => {
        const rooms = Array.isArray(f.rooms) ? f.rooms : [];
        rooms.forEach((r) => {
          const roomCode = r.roomCode || r.name || r.id;
          const managerUid = r.managedBy || f.managedBy || null;
          const managerName = r.managedByName || f.managedByName || null;
          const isManaged = Boolean(managerUid || managerName);
          list.push({
            ...r,
            roomCode,
            buildingId: b.id,
            buildingName: b.name || 'Building',
            buildingCode: b.code || '',
            floorNumber: f.floorNumber || f.floor || 1,
            floorLabel: f.label || `Floor ${f.floorNumber || 1}`,
            managerUid,
            managerName,
            isManaged,
          });
        });
      });
    });
    return list;
  }, [buildings]);

  // Filtered Buildings & Rooms (Tab 2)
  const filteredBuildingsWithRooms = useMemo(() => {
    const q = roomSearch.toLowerCase().trim();

    return buildings
      .map((b) => {
        if (buildingFilter !== 'ALL' && b.id !== buildingFilter && b.name !== buildingFilter) {
          return null;
        }

        const floors = Array.isArray(b.floorData) ? b.floorData : [];
        const matchingFloors = floors
          .map((f) => {
            const rooms = Array.isArray(f.rooms) ? f.rooms : [];
            const matchingRooms = rooms
              .map((r) => {
                const managerUid = r.managedBy || f.managedBy || null;
                const managerName = r.managedByName || f.managedByName || null;
                const isManaged = Boolean(managerUid || managerName);
                return {
                  ...r,
                  managerUid,
                  managerName,
                  isManaged,
                };
              })
              .filter((r) => {
                const code = (r.roomCode || r.name || r.id || '').toLowerCase();
                const name = (r.name || '').toLowerCase();
                const type = (r.type || r.roomType || 'Classroom').toLowerCase();

                // Search query filter
                if (q && !code.includes(q) && !name.includes(q) && !b.name.toLowerCase().includes(q)) {
                  return false;
                }

                // Room type filter
                if (roomTypeFilter !== 'ALL') {
                  if (roomTypeFilter === 'lecture') {
                    if (!type.includes('lecture') && !type.includes('class') && !type.includes('room')) return false;
                  } else if (roomTypeFilter === 'laboratory') {
                    if (!type.includes('lab') && !type.includes('laboratory') && !type.includes('chem') && !type.includes('bio')) return false;
                  } else if (roomTypeFilter === 'other') {
                    if (type.includes('lecture') || type.includes('class') || type.includes('lab')) return false;
                  }
                }

                return true;
              });

            return {
              ...f,
              matchingRooms,
            };
          })
          .filter((f) => f.matchingRooms.length > 0);

        if (matchingFloors.length === 0) return null;

        return {
          ...b,
          matchingFloors,
          totalMatchingRooms: matchingFloors.reduce((acc, f) => acc + f.matchingRooms.length, 0),
        };
      })
      .filter(Boolean);
  }, [buildings, roomSearch, buildingFilter, roomTypeFilter]);

  // Room Selection Handlers
  const toggleRoom = (roomCode, isManaged = false) => {
    if (isManaged) return; // Prevent selecting rooms managed by a dean
    setSelectedRooms((prev) =>
      prev.includes(roomCode) ? prev.filter((r) => r !== roomCode) : [...prev, roomCode]
    );
  };

  const handleSelectAllFilteredRooms = () => {
    const visibleRoomCodes = [];
    filteredBuildingsWithRooms.forEach((b) => {
      b.matchingFloors.forEach((f) => {
        f.matchingRooms.forEach((r) => {
          if (!r.isManaged) {
            visibleRoomCodes.push(r.roomCode || r.name || r.id);
          }
        });
      });
    });

    setSelectedRooms((prev) => Array.from(new Set([...prev, ...visibleRoomCodes])));
  };

  const handleDeselectAllRooms = () => {
    setSelectedRooms([]);
  };

  const handleAutoSelectRecommendedRooms = () => {
    if (!aiAnalysis) return;

    const neededLec = aiAnalysis.recommendedLectureRooms || 2;
    const neededLab = aiAnalysis.recommendedLabRooms || 0;

    let pickedLec = 0;
    let pickedLab = 0;
    const newSelected = [];

    allFlattenedRooms.forEach((r) => {
      if (r.isManaged) return; // Skip rooms managed by a dean
      const type = (r.type || r.roomType || 'Classroom').toLowerCase();
      const isLab = type.includes('lab') || type.includes('laboratory');

      if (isLab && pickedLab < neededLab) {
        newSelected.push(r.roomCode);
        pickedLab++;
      } else if (!isLab && pickedLec < neededLec) {
        newSelected.push(r.roomCode);
        pickedLec++;
      }
    });

    setSelectedRooms(newSelected);
  };

  const handleSelectAllByType = (typeTarget) => {
    const targetCodes = allFlattenedRooms
      .filter((r) => {
        if (r.isManaged) return false;
        const type = (r.type || r.roomType || 'Classroom').toLowerCase();
        if (typeTarget === 'lab') return type.includes('lab') || type.includes('laboratory');
        return !type.includes('lab') && !type.includes('laboratory');
      })
      .map((r) => r.roomCode);

    setSelectedRooms((prev) => Array.from(new Set([...prev, ...targetCodes])));
  };

  // Proceed to Tab 2
  const handleProceedToRooms = (e) => {
    if (e) e.preventDefault();
    if (selectedCollegeCodes.length === 0) {
      setError('Please select at least one college before proceeding to room allocation.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('End Date cannot be earlier than Start Date.');
      return;
    }
    setError('');
    setActiveTab('rooms');
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    if (activeTab === 'dean') {
      handleProceedToRooms(e);
      return;
    }

    if (selectedCollegeCodes.length === 0) {
      setError('Please select at least one college in Tab 1.');
      setActiveTab('dean');
      return;
    }

    if (!schoolYearId || !semester) {
      setError('School year and semester are required.');
      return;
    }

    if (startDate && endDate && endDate < startDate) {
      setError('End Date cannot be earlier than Start Date.');
      setActiveTab('dean');
      return;
    }

    const selectedColleges = colleges.filter((c) => selectedCollegeCodes.includes(c.code));

    if (selectedColleges.length === 0) {
      setError('Invalid college selection.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Build per-college room assignments
      const assignedRoomsByCollege = {};
      selectedCollegeCodes.forEach((code) => {
        assignedRoomsByCollege[code] = selectedRooms;
      });

      const payload = {
        schoolYearId,
        schoolYearLabel: `SY ${schoolYearId}`,
        semester,
        collegeCodes: selectedCollegeCodes,
        selectedColleges,
        startDate,
        endDate,
        sendEmail: sendEmailNotification,
        assignedRooms: selectedRooms,
        assignedRoomsByCollege,
        grantedBy: profile?.uid,
      };

      if (onSave) {
        onClose();
        await onSave(payload);
      } else {
        await grantFirstCollegeAccess(payload);
        if (onSuccess) onSuccess();
        onClose();
      }
    } catch (err) {
      console.error('Error granting access:', err);
      setError(err.message || 'Failed to grant access.');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col relative overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (activeTab === 'dean') {
              handleProceedToRooms(e);
            } else {
              handleSubmit(e);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
              e.preventDefault();
            }
          }}
          className="flex flex-col h-full min-h-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white flex-shrink-0">
            <div>
              <h3 className="font-black text-lg text-[#2B3235] flex items-center gap-2">
                <GraduationCap className="text-[#7A0808]" size={22} />
                {initialCollegeCodes.length > 0 ? 'Edit Granted Schedule Access' : 'Grant College Schedule Access'}
              </h3>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Assign deans, configure schedule deadline window, and allocate specific rooms with AI curriculum assistance.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tab Navigation Bar */}
          <div className="flex items-center border-b border-gray-200 bg-gray-50/80 px-6 pt-2 flex-shrink-0 gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('dean')}
              className={`pb-2.5 px-3 text-xs font-black flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'dean'
                  ? 'border-[#7A0808] text-[#7A0808] bg-white/80 rounded-t-lg'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Users size={15} />
              <span>Tab 1: Select Dean & Window</span>
              {selectedCollegeCodes.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-100 text-[#7A0808] font-black">
                  {selectedCollegeCodes.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rooms')}
              className={`pb-2.5 px-3 text-xs font-black flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === 'rooms'
                  ? 'border-[#7A0808] text-[#7A0808] bg-white/80 rounded-t-lg'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              <Building2 size={15} />
              <span>Tab 2: Room Allocation & AI Suggestions</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                selectedRooms.length > 0
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-gray-200 text-gray-600'
              }`}>
                {selectedRooms.length} Rooms
              </span>
            </button>
          </div>

          {/* Tab Content Container */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1 bg-white">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                <span className="text-xs font-semibold text-red-700">{error}</span>
              </div>
            )}

            {/* TAB 1: DEAN & SCHEDULE WINDOW */}
            {activeTab === 'dean' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Academic Year Info Banner */}
                <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-blue-900">
                      📋 School Year {schoolYearId} · {semesterLabel || `Semester ${semester}`}
                    </p>
                    <p className="text-[11px] text-blue-700 font-medium mt-0.5">
                      Selected deans will receive permissions to plot class schedules within the configured accomplishment period.
                    </p>
                  </div>
                </div>

                {/* Accomplishment Window (Start Date & End Date) */}
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                      <Calendar size={15} className="text-[#7A0808]" />
                      Accomplishment Window (Day Limit) <span className="text-red-500">*</span>
                    </label>
                    {getDurationDays() !== null && (
                      <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-[#7A0808] text-white shadow-2xs">
                        {getDurationDays()} Day Limit
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">Start Date</label>
                      <DatePicker value={startDate} onChange={setStartDate} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">End Date (Deadline)</label>
                      <DatePicker value={endDate} onChange={setEndDate} />
                    </div>
                  </div>

                  {/* Email Notification Option */}
                  <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sendEmailNotification}
                      onChange={(e) => setSendEmailNotification(e.target.checked)}
                      className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                    />
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <Mail size={13} className="text-[#7A0808]" />
                      Notify Granted Deans via Email & Portal Alert
                    </span>
                  </label>
                </div>

                {/* Selected Colleges Preview Pills */}
                {selectedCollegeCodes.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-black text-gray-500 tracking-wider uppercase">
                      <span>Selected Colleges ({selectedCollegeCodes.length})</span>
                      <button
                        type="button"
                        onClick={() => setSelectedCollegeCodes([])}
                        className="text-[#7A0808] hover:underline font-bold"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-xl max-h-28 overflow-y-auto">
                      {colleges
                        .filter((c) => selectedCollegeCodes.includes(c.code))
                        .map((c) => (
                          <span
                            key={c.code}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-red-50 text-[#7A0808] border border-red-100 text-xs font-bold shadow-2xs"
                          >
                            <span>{c.name} ({c.code})</span>
                            <button
                              type="button"
                              onClick={() => toggleCollegeCode(c.code)}
                              className="text-[#7A0808] hover:text-red-900 p-0.5 rounded-full hover:bg-red-100 transition-colors ml-1"
                              title="Remove college"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Multi-Select College Dropdown with Checkboxes */}
                <div className="space-y-2" ref={dropdownRef}>
                  <label className="block text-xs font-bold text-[#2B3235]">
                    Select College(s) / Dean(s) to Assign <span className="text-red-500">*</span>
                  </label>

                  {loadingColleges ? (
                    <div className="form-input w-full text-gray-400 py-2.5">Loading colleges...</div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl bg-gray-50/50 p-3 space-y-2 shadow-2xs">
                      {/* Trigger / Summary Bar */}
                      <div
                        onClick={() => !submitting && setIsDropdownOpen((prev) => !prev)}
                        className="flex items-center justify-between px-3.5 py-2.5 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-gray-300 transition-all shadow-2xs"
                      >
                        <span
                          className={`text-xs truncate ${
                            selectedCollegeCodes.length > 0 ? 'text-gray-900 font-bold' : 'text-gray-400 font-medium'
                          }`}
                        >
                          {getCollegeDropdownLabel()}
                        </span>
                        <ChevronDown
                          size={16}
                          className={`text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180 text-[#7A0808]' : ''}`}
                        />
                      </div>

                      {/* Dropdown Options List */}
                      {isDropdownOpen && (
                        <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2 shadow-sm">
                          {/* Search & Select All Bar */}
                          <div className="space-y-2 pb-2 border-b border-gray-100">
                            <div className="relative">
                              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                              <input
                                type="text"
                                value={collegeSearch}
                                onChange={(e) => setCollegeSearch(e.target.value)}
                                placeholder="Search colleges by code or name..."
                                className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-800 outline-none focus:border-[#7A0808] focus:bg-white"
                              />
                            </div>

                            <div
                              onClick={toggleSelectAllColleges}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 cursor-pointer text-xs font-bold text-gray-800 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isAllCollegesSelected}
                                onChange={() => {}}
                                className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              />
                              <span>Select All Colleges ({colleges.length})</span>
                            </div>
                          </div>

                          {/* Colleges Scrollable List */}
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                            {filteredColleges.length === 0 ? (
                              <div className="p-4 text-center text-xs text-gray-400 font-medium">No colleges found matching query</div>
                            ) : (
                              filteredColleges.map((college) => {
                                const isSelected = selectedCollegeCodes.includes(college.code);
                                return (
                                  <div
                                    key={college.code}
                                    onClick={() => toggleCollegeCode(college.code)}
                                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all ${
                                      isSelected
                                        ? 'bg-red-50 text-[#7A0808] font-bold border border-red-200 shadow-2xs'
                                        : 'text-gray-700 hover:bg-gray-50 font-medium border border-transparent'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => {}}
                                        className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer flex-shrink-0"
                                      />
                                      <span className="truncate">{college.name}</span>
                                    </div>
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 uppercase flex-shrink-0 border border-gray-200">
                                      {college.code}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: ROOM ALLOCATION WITH AI ANALYSIS & SEARCH */}
            {activeTab === 'rooms' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* AI Curriculum Analysis & Room Requirement Card */}
                <div className="bg-gradient-to-r from-red-50 via-amber-50/40 to-white border border-red-200 rounded-2xl p-4 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#7A0808] text-white flex items-center justify-center shadow-xs">
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-[#7A0808] uppercase tracking-wider flex items-center gap-1.5">
                          AI Curriculum & Room Requirement Suggestion
                        </h4>
                        <p className="text-[11px] text-gray-600 font-medium">
                          {selectedCollegeCodes.length > 0
                            ? `Analyzed course load for ${selectedCollegeCodes.join(', ')} (Semester ${semester})`
                            : 'Select a college in Tab 1 to generate personalized AI room insights'}
                        </p>
                      </div>
                    </div>

                    {aiAnalysis && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleAutoSelectRecommendedRooms}
                          className="px-3 py-1.5 rounded-lg bg-[#7A0808] hover:bg-[#600000] text-white text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          title="Automatically select recommended room count"
                        >
                          <Check size={13} /> Auto-Check Recommended ({aiAnalysis.recommendedLectureRooms + aiAnalysis.recommendedLabRooms} Rooms)
                        </button>
                      </div>
                    )}
                  </div>

                  {loadingAi ? (
                    <div className="p-3 text-center text-xs text-gray-500 font-medium animate-pulse">
                      Analyzing college curriculum, lecture units, and section loads...
                    </div>
                  ) : aiAnalysis ? (
                    <div className="space-y-3 pt-1">
                      {/* Metric Stat Badges */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-white/90 border border-gray-200 rounded-xl p-2.5 text-center shadow-2xs">
                          <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Courses</span>
                          <span className="text-base font-black text-gray-900">{aiAnalysis.totalCourses}</span>
                        </div>
                        <div className="bg-white/90 border border-gray-200 rounded-xl p-2.5 text-center shadow-2xs">
                          <span className="text-[10px] font-bold text-gray-500 uppercase block">Active Sections</span>
                          <span className="text-base font-black text-gray-900">{aiAnalysis.totalSections}</span>
                        </div>
                        <div className="bg-red-50/80 border border-red-200 rounded-xl p-2.5 text-center shadow-2xs">
                          <span className="text-[10px] font-extrabold text-red-800 uppercase block">Suggested Lecture</span>
                          <span className="text-base font-black text-[#7A0808]">
                            {aiAnalysis.recommendedLectureRooms} Room{aiAnalysis.recommendedLectureRooms > 1 ? 's' : ''}
                          </span>
                          <span className="text-[9px] text-red-700 font-medium block mt-0.5">
                            ~{aiAnalysis.totalLecWeeklyHours || 0} class hrs/wk
                          </span>
                        </div>
                        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-2.5 text-center shadow-2xs">
                          <span className="text-[10px] font-extrabold text-emerald-800 uppercase block">Suggested Lab</span>
                          <span className="text-base font-black text-emerald-700">
                            {aiAnalysis.recommendedLabRooms} Room{aiAnalysis.recommendedLabRooms > 1 ? 's' : ''}
                          </span>
                          <span className="text-[9px] text-emerald-700 font-medium block mt-0.5">
                            ~{aiAnalysis.totalLabWeeklyHours || 0} practical hrs/wk
                          </span>
                        </div>
                      </div>

                      {/* AI Narrative Breakdown */}
                      <div className="bg-white/95 border border-red-100 rounded-xl p-3 text-xs leading-relaxed space-y-1.5 shadow-2xs">
                        <p className="text-gray-800 font-semibold">{aiAnalysis.aiSummaryText}</p>
                        <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100">
                          {aiAnalysis.recommendationPoints.map((pt, i) => (
                            <span key={i} className="text-[10px] text-gray-600 font-medium flex items-center gap-1">
                              • {pt}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Detailed Program & Year-Level Curriculum Breakdown */}
                      {Array.isArray(aiAnalysis.programs) && aiAnalysis.programs.length > 0 && (
                        <div className="space-y-2.5 pt-1">
                          <div className="flex items-center justify-between">
                            <h5 className="text-[11px] font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                              <Layers size={13} className="text-[#7A0808]" />
                              {aiAnalysis.isMultiProgram
                                ? `Program & Year-Level Breakdown (${aiAnalysis.programs.length} Programs)`
                                : 'Curriculum & Year-Level Room Breakdown'}
                            </h5>
                            <span className="text-[10px] font-bold text-gray-400">
                              Based on Year-Level Course Units × Active Sections
                            </span>
                          </div>

                          <div className="space-y-2">
                            {aiAnalysis.programs.map((prog) => {
                              const isExpanded = expandedPrograms[prog.programCode] !== false;

                              return (
                                <div
                                  key={prog.programCode}
                                  className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs"
                                >
                                  {/* Program Header */}
                                  <div
                                    onClick={() => toggleExpandProgram(prog.programCode)}
                                    className="px-3.5 py-2.5 bg-gray-50/80 hover:bg-gray-100/80 border-b border-gray-100 flex items-center justify-between cursor-pointer transition-colors"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 pr-2">
                                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[#7A0808] text-white flex-shrink-0">
                                        {prog.programCode}
                                      </span>
                                      <span className="text-xs font-bold text-gray-900 truncate">
                                        {prog.programName}
                                      </span>
                                      <span className="text-[10px] font-semibold text-gray-500 flex-shrink-0">
                                        • {prog.totalCourses} {prog.totalCourses === 1 ? 'course' : 'courses'} • {prog.totalSections} {prog.totalSections === 1 ? 'section' : 'sections'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-red-50 text-[#7A0808] border border-red-200">
                                        {prog.recommendedLectureRooms} Lec {prog.recommendedLectureRooms === 1 ? 'Room' : 'Rooms'}
                                      </span>
                                      {prog.recommendedLabRooms > 0 && (
                                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                          {prog.recommendedLabRooms} Lab {prog.recommendedLabRooms === 1 ? 'Room' : 'Rooms'}
                                        </span>
                                      )}
                                      <ChevronDown
                                        size={14}
                                        className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180 text-[#7A0808]' : ''}`}
                                      />
                                    </div>
                                  </div>

                                  {/* Year-by-Year Table */}
                                  {isExpanded && (
                                    <div className="p-2.5 overflow-x-auto">
                                      <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                          <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase bg-gray-50/50">
                                            <th className="py-1.5 px-2.5">Year Level</th>
                                            <th className="py-1.5 px-2.5">Curriculum Load</th>
                                            <th className="py-1.5 px-2.5">Active Sections</th>
                                            <th className="py-1.5 px-2.5">Weekly Demand</th>
                                            <th className="py-1.5 px-2.5 text-right">Recommended</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                          {prog.yearBreakdown.map((yr) => (
                                            <tr key={yr.yearNumber} className="hover:bg-gray-50/60 transition-colors">
                                              <td className="py-2 px-2.5 font-bold text-gray-800 whitespace-nowrap">
                                                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 font-extrabold text-[10px]">
                                                  {yr.yearLabel}
                                                </span>
                                              </td>
                                              <td className="py-2 px-2.5">
                                                <div className="font-semibold text-gray-800">
                                                  {yr.courseCount} {yr.courseCount === 1 ? 'Course' : 'Courses'}
                                                  <span className="text-[10px] text-gray-500 font-normal ml-1.5">
                                                    ({yr.lecUnitsPerSection} lec / {yr.labUnitsPerSection} lab units)
                                                  </span>
                                                </div>
                                              </td>
                                              <td className="py-2 px-2.5">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-bold text-gray-800">
                                                    {yr.sectionCount} {yr.sectionCount === 1 ? 'Sec' : 'Secs'}
                                                  </span>
                                                  {yr.sectionNames.length > 0 && (
                                                    <div className="flex items-center gap-1 flex-wrap">
                                                      {yr.sectionNames.slice(0, 3).map((sName) => (
                                                        <span
                                                          key={sName}
                                                          className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200"
                                                        >
                                                          {sName}
                                                        </span>
                                                      ))}
                                                      {yr.sectionNames.length > 3 && (
                                                        <span className="text-[9px] font-bold text-gray-400">
                                                          +{yr.sectionNames.length - 3} more
                                                        </span>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="py-2 px-2.5">
                                                <div className="text-[11px] space-y-0.5">
                                                  <div className="text-red-900 font-semibold">
                                                    ~{yr.weeklyLecHours} hrs/wk <span className="text-[9px] text-gray-500 font-normal">Lec</span>
                                                  </div>
                                                  {yr.weeklyLabHours > 0 && (
                                                    <div className="text-emerald-900 font-semibold">
                                                      ~{yr.weeklyLabHours} hrs/wk <span className="text-[9px] text-gray-500 font-normal">Lab</span>
                                                    </div>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="py-2 px-2.5 text-right whitespace-nowrap">
                                                <div className="inline-flex items-center gap-1.5">
                                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-[#7A0808] border border-red-100">
                                                    ~{yr.suggestedLecRooms} Lec
                                                  </span>
                                                  {yr.suggestedLabRooms > 0 && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-100">
                                                      ~{yr.suggestedLabRooms} Lab
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr className="bg-gray-50/80 font-bold border-t border-gray-200 text-[10px] text-gray-700">
                                            <td colSpan={3} className="py-2 px-2.5 text-right uppercase tracking-wider text-gray-500">
                                              Total for {prog.programCode}:
                                            </td>
                                            <td className="py-2 px-2.5">
                                              <span className="text-red-900">~{prog.weeklyLecHours} Lec hrs</span>
                                              {prog.weeklyLabHours > 0 && (
                                                <span className="text-emerald-900 ml-2">• ~{prog.weeklyLabHours} Lab hrs</span>
                                              )}
                                            </td>
                                            <td className="py-2 px-2.5 text-right">
                                              <span className="font-extrabold text-[#7A0808]">
                                                {prog.recommendedLectureRooms} Lec
                                              </span>
                                              {prog.recommendedLabRooms > 0 && (
                                                <span className="font-extrabold text-emerald-800 ml-1.5">
                                                  • {prog.recommendedLabRooms} Lab
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Search & Filter Toolbar */}
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Search Input */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={roomSearch}
                        onChange={(e) => setRoomSearch(e.target.value)}
                        placeholder="Search room code or name..."
                        className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium text-gray-800 outline-none focus:border-[#7A0808]"
                      />
                    </div>

                    {/* Building Filter */}
                    <div>
                      <CustomSelect
                        value={buildingFilter}
                        onChange={(e) => setBuildingFilter(e.target.value)}
                        options={[
                          { value: 'ALL', label: 'All Buildings' },
                          ...buildings.map((b) => ({ value: b.id, label: b.name })),
                        ]}
                        placeholder="Filter by Building"
                      />
                    </div>

                    {/* Room Type Filter */}
                    <div>
                      <CustomSelect
                        value={roomTypeFilter}
                        onChange={(e) => setRoomTypeFilter(e.target.value)}
                        options={[
                          { value: 'ALL', label: 'All Room Types' },
                          { value: 'lecture', label: 'Lecture / Classrooms' },
                          { value: 'laboratory', label: 'Laboratories' },
                          { value: 'other', label: 'Other Types' },
                        ]}
                        placeholder="Filter by Type"
                      />
                    </div>
                  </div>

                  {/* Quick Select Actions Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-200 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-700">
                        Selected: <span className="text-[#7A0808] font-black">{selectedRooms.length}</span> rooms
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleSelectAllFilteredRooms}
                        className="px-2.5 py-1 rounded-lg bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        Select All Filtered
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAllByType('lecture')}
                        className="px-2.5 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-[#7A0808] text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        + All Lectures
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAllByType('lab')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        + All Labs
                      </button>
                      {selectedRooms.length > 0 && (
                        <button
                          type="button"
                          onClick={handleDeselectAllRooms}
                          className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-bold transition-colors cursor-pointer"
                        >
                          Deselect All
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Buildings & Room Cards List */}
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {loadingBuildings ? (
                    <div className="p-8 text-center text-xs text-gray-400 font-medium">Loading building inventory...</div>
                  ) : filteredBuildingsWithRooms.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200 text-xs text-gray-500 font-medium">
                      No rooms found matching the current search or filter criteria.
                    </div>
                  ) : (
                    filteredBuildingsWithRooms.map((building) => {
                      const isExpanded = expandedBuildings[building.id] !== false;

                      // Count selected rooms in this building (excluding managed rooms from selectable total)
                      const buildingSelectableRoomCodes = [];
                      building.matchingFloors.forEach((f) => {
                        f.matchingRooms.forEach((r) => {
                          if (!r.isManaged) {
                            buildingSelectableRoomCodes.push(r.roomCode || r.name || r.id);
                          }
                        });
                      });

                      const selectedInBuilding = buildingSelectableRoomCodes.filter((c) => selectedRooms.includes(c)).length;
                      const isAllInBuildingSelected =
                        buildingSelectableRoomCodes.length > 0 && selectedInBuilding === buildingSelectableRoomCodes.length;

                      const toggleBuildingRooms = (e) => {
                        e.stopPropagation();
                        if (isAllInBuildingSelected) {
                          setSelectedRooms((prev) => prev.filter((r) => !buildingSelectableRoomCodes.includes(r)));
                        } else {
                          setSelectedRooms((prev) => Array.from(new Set([...prev, ...buildingSelectableRoomCodes])));
                        }
                      };

                      return (
                        <div
                          key={building.id}
                          className="border border-gray-200 rounded-2xl bg-white shadow-2xs overflow-hidden transition-all"
                        >
                          {/* Building Accordion Header */}
                          <div
                            onClick={() =>
                              setExpandedBuildings((prev) => ({
                                ...prev,
                                [building.id]: !isExpanded,
                              }))
                            }
                            className="flex items-center justify-between p-3.5 bg-gray-50/80 hover:bg-gray-100/80 cursor-pointer border-b border-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isAllInBuildingSelected}
                                disabled={buildingSelectableRoomCodes.length === 0}
                                onClick={(e) => e.stopPropagation()}
                                onChange={toggleBuildingRooms}
                                className={`w-4 h-4 rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] ${
                                  buildingSelectableRoomCodes.length === 0 ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                                }`}
                              />
                              <div className="flex items-center gap-2">
                                <Building2 size={16} className="text-[#7A0808]" />
                                <span className="text-xs font-black text-gray-900">{building.name}</span>
                                {building.code && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-gray-200 text-gray-700">
                                    {building.code}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-[11px] font-bold text-gray-500">
                                <span className="text-emerald-700 font-extrabold">{selectedInBuilding}</span> / {buildingSelectableRoomCodes.length} available
                              </span>
                              <ChevronDown
                                size={16}
                                className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180 text-[#7A0808]' : ''}`}
                              />
                            </div>
                          </div>

                          {/* Building Floors & Rooms */}
                          {isExpanded && (
                            <div className="p-3.5 space-y-3.5 bg-white">
                              {building.matchingFloors.map((floor) => (
                                <div key={floor.floorNumber || floor.floorId} className="space-y-2">
                                  <div className="flex items-center gap-2 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                                    <Layers size={13} className="text-gray-400" />
                                    <span>{floor.label || `Floor ${floor.floorNumber}`}</span>
                                    <span className="text-[10px] font-medium text-gray-400 lowercase">
                                      ({floor.matchingRooms.length} room{floor.matchingRooms.length === 1 ? '' : 's'})
                                    </span>
                                  </div>

                                  {/* Rooms Grid */}
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                    {floor.matchingRooms.map((room) => {
                                      const roomCode = room.roomCode || room.name || room.id;
                                      const isSelected = selectedRooms.includes(roomCode);
                                      const type = (room.type || room.roomType || 'Classroom').toLowerCase();
                                      const isLab = type.includes('lab') || type.includes('laboratory');
                                      const isManaged = Boolean(room.isManaged);
                                      const managerText = room.managerName || (room.managerUid ? 'Dean' : 'Dean');

                                      return (
                                        <div
                                          key={room.docId || roomCode}
                                          onClick={() => !isManaged && toggleRoom(roomCode, isManaged)}
                                          className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all ${
                                            isManaged
                                              ? 'bg-gray-50/90 border-dashed border-gray-300 opacity-80 cursor-not-allowed select-none'
                                              : isSelected
                                              ? 'bg-red-50/70 border-red-300 shadow-2xs cursor-pointer'
                                              : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/60 cursor-pointer'
                                          }`}
                                          title={isManaged ? `This room is managed by ${managerText}` : undefined}
                                        >
                                          <input
                                            type="checkbox"
                                            disabled={isManaged}
                                            checked={!isManaged && isSelected}
                                            onChange={() => !isManaged && toggleRoom(roomCode, isManaged)}
                                            className={`mt-0.5 w-4 h-4 rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] flex-shrink-0 ${
                                              isManaged ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                                            }`}
                                          />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1 mb-1">
                                              <span className={`text-xs font-black truncate ${isManaged ? 'text-gray-600' : 'text-gray-900'}`}>
                                                {roomCode}
                                              </span>
                                              <span
                                                className={`text-[9px] font-black px-1.5 py-0.2 rounded-md uppercase tracking-wider ${
                                                  isLab
                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                    : 'bg-red-100 text-red-800 border border-red-200'
                                                }`}
                                              >
                                                {isLab ? 'Laboratory' : 'Lecture'}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500 font-medium">
                                              {room.capacity > 0 && (
                                                <span className="flex items-center gap-1">
                                                  <Users size={11} /> {room.capacity} seats
                                                </span>
                                              )}
                                              {room.name && room.name !== roomCode && (
                                                <span className="truncate">{room.name}</span>
                                              )}
                                            </div>

                                            {/* Managed by Dean Indicator */}
                                            {isManaged && (
                                              <div className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                                <Lock size={10} className="text-amber-700 flex-shrink-0" />
                                                <span className="truncate">Managed by {managerText}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex-shrink-0">
            {initialCollegeCodes.length > 0 && onReset ? (
              <button
                type="button"
                onClick={onReset}
                disabled={submitting}
                className="btn-delete cursor-pointer text-xs font-bold"
                title="Reset access control to start fresh"
              >
                <Trash2 size={14} /> Reset Access
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2.5">
              {activeTab === 'rooms' ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('dean')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft size={14} /> Back to Dean
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}

              {activeTab === 'dean' ? (
                <button
                  type="button"
                  onClick={handleProceedToRooms}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#7A0808] text-white hover:bg-[#600000] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <span>Continue to Room Allocation</span>
                  <ArrowRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || selectedCollegeCodes.length === 0}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-[#7A0808] text-white hover:bg-[#600000] transition-colors disabled:opacity-50 flex items-center gap-2 shadow-2xs cursor-pointer"
                >
                  <Send size={15} />
                  {submitting
                    ? 'Saving Access...'
                    : initialCollegeCodes.length > 0
                      ? `Update Access (${selectedRooms.length} Rooms)`
                      : `Grant Access (${selectedRooms.length} Rooms)`}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
