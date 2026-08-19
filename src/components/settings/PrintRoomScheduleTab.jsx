import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer, Building2, Layers, CheckSquare, Square, MinusSquare,
  Search, ChevronDown, ChevronRight, Eye, RefreshCw, CheckCircle2,
  Calendar, Check, SlidersHorizontal, Sparkles
} from 'lucide-react';
import { subscribeToBuildings } from '../../services/buildingService';
import { fetchPlotEntriesForMultipleRooms } from '../../services/plotScheduleService';

export default function PrintRoomScheduleTab({
  calendarData,
  activeSchoolYearId,
  schoolYears = [],
  showNotification,
}) {
  // 1. Data Subscriptions & State
  const [buildings, setBuildings] = useState([]);
  const [loadingBuildings, setLoadingBuildings] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('1');
  const [selectedRoomKeys, setSelectedRoomKeys] = useState(new Set());
  const [expandedBuildingIds, setExpandedBuildingIds] = useState(new Set());
  const [isPrinting, setIsPrinting] = useState(false);
  const [printStatus, setPrintStatus] = useState('');

  // Subscribe to real-time buildings
  useEffect(() => {
    setLoadingBuildings(true);
    const unsub = subscribeToBuildings(
      (data) => {
        setBuildings(data || []);
        setLoadingBuildings(false);
        // Expand first building by default if none expanded
        if (data && data.length > 0) {
          setExpandedBuildingIds((prev) => (prev.size === 0 ? new Set([data[0].id]) : prev));
        }
      },
      (err) => {
        console.error('Error loading buildings for PrintRoomScheduleTab:', err);
        setLoadingBuildings(false);
      }
    );
    return () => unsub();
  }, []);

  // Configured semesters from active academic calendar
  const configuredSemesters = useMemo(() => {
    const raw = calendarData?.config?.semesters;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((s, idx) => ({
        id: s.id || `sem_${idx + 1}`,
        value: String(idx + 1),
        name: s.name || `Semester ${idx + 1}`,
        label: s.name || `Semester ${idx + 1}`,
      }));
    }
    return [
      { id: 'sem_1', value: '1', name: 'Semester 1', label: 'Semester 1' },
      { id: 'sem_2', value: '2', name: 'Semester 2', label: 'Semester 2' },
      { id: 'sem_summer', value: '3', name: 'Summer', label: 'Summer' },
    ];
  }, [calendarData]);

  // Set initial selected semester
  useEffect(() => {
    if (configuredSemesters.length > 0 && !selectedSemester) {
      setSelectedSemester(configuredSemesters[0].value);
    }
  }, [configuredSemesters]);

  const activeSemesterObj = useMemo(() => {
    return configuredSemesters.find((s) => s.value === selectedSemester) || configuredSemesters[0];
  }, [configuredSemesters, selectedSemester]);

  const schoolYearLabel = calendarData?.config?.displayLabel || (
    calendarData?.config?.label ? `SY ${calendarData.config.label}` : 'Active School Year'
  );

  // Flat list of all rooms with hierarchy info
  const allRooms = useMemo(() => {
    const list = [];
    buildings.forEach((b) => {
      const bName = b.name || 'Building';
      const bId = b.id || b.docId;
      (b.floorData || []).forEach((f) => {
        const fNum = f.floorNumber || f.floor || 1;
        (f.rooms || []).forEach((r) => {
          const rCode = r.roomCode || r.id || r.name;
          const key = `${bId}__${fNum}__${rCode}`;
          list.push({
            key,
            buildingId: bId,
            buildingName: bName,
            floorNumber: fNum,
            floorLabel: f.label || `Floor ${fNum}`,
            roomCode: rCode,
            roomName: r.name || rCode,
            roomType: r.type || 'Classroom',
            capacity: r.capacity || 0,
            docId: r.docId,
          });
        });
      });
    });
    return list;
  }, [buildings]);

  // Filtered buildings and rooms based on search query
  const filteredBuildings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return buildings;

    return buildings
      .map((b) => {
        const bMatches = (b.name || '').toLowerCase().includes(q);
        const matchingFloors = (b.floorData || [])
          .map((f) => {
            const fMatches = (f.label || '').toLowerCase().includes(q);
            const matchingRooms = (f.rooms || []).filter((r) => {
              const rCode = (r.roomCode || r.id || '').toLowerCase();
              const rName = (r.name || '').toLowerCase();
              const rType = (r.type || '').toLowerCase();
              return rCode.includes(q) || rName.includes(q) || rType.includes(q) || bMatches || fMatches;
            });
            if (bMatches || fMatches || matchingRooms.length > 0) {
              return { ...f, rooms: bMatches || fMatches ? f.rooms : matchingRooms };
            }
            return null;
          })
          .filter(Boolean);

        if (bMatches || matchingFloors.length > 0) {
          return { ...b, floorData: matchingFloors };
        }
        return null;
      })
      .filter(Boolean);
  }, [buildings, searchQuery]);

  // Total selectable rooms matching filter
  const visibleRooms = useMemo(() => {
    const list = [];
    filteredBuildings.forEach((b) => {
      (b.floorData || []).forEach((f) => {
        (f.rooms || []).forEach((r) => {
          const rCode = r.roomCode || r.id || r.name;
          list.push(`${b.id || b.docId}__${f.floorNumber || f.floor || 1}__${rCode}`);
        });
      });
    });
    return list;
  }, [filteredBuildings]);

  // 2. Selection Helpers
  const toggleRoom = (roomKey) => {
    setSelectedRoomKeys((prev) => {
      const next = new Set(prev);
      if (next.has(roomKey)) next.delete(roomKey);
      else next.add(roomKey);
      return next;
    });
  };

  const toggleFloor = (buildingId, floorNumber, floorRooms) => {
    const floorRoomKeys = floorRooms.map((r) => `${buildingId}__${floorNumber}__${r.roomCode || r.id || r.name}`);
    const isAllFloorSelected = floorRoomKeys.every((k) => selectedRoomKeys.has(k));

    setSelectedRoomKeys((prev) => {
      const next = new Set(prev);
      if (isAllFloorSelected) {
        floorRoomKeys.forEach((k) => next.delete(k));
      } else {
        floorRoomKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const toggleBuilding = (b) => {
    const bId = b.id || b.docId;
    const bRoomKeys = [];
    (b.floorData || []).forEach((f) => {
      const fNum = f.floorNumber || f.floor || 1;
      (f.rooms || []).forEach((r) => {
        bRoomKeys.push(`${bId}__${fNum}__${r.roomCode || r.id || r.name}`);
      });
    });

    const isAllBldSelected = bRoomKeys.length > 0 && bRoomKeys.every((k) => selectedRoomKeys.has(k));

    setSelectedRoomKeys((prev) => {
      const next = new Set(prev);
      if (isAllBldSelected) {
        bRoomKeys.forEach((k) => next.delete(k));
      } else {
        bRoomKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    setSelectedRoomKeys((prev) => {
      const next = new Set(prev);
      visibleRooms.forEach((k) => next.add(k));
      return next;
    });
  };

  const handleClearAll = () => {
    setSelectedRoomKeys(new Set());
  };

  const toggleExpandBuilding = (buildingId) => {
    setExpandedBuildingIds((prev) => {
      const next = new Set(prev);
      if (next.has(buildingId)) next.delete(buildingId);
      else next.add(buildingId);
      return next;
    });
  };

  // 3. Core Print Generator (Exact format matching Room Details schedule print)
  const generateBulkPrintHtml = (roomsToPrint, schedulesByRoom) => {
    const CELL_H = 18;
    const START_HOUR = 6;
    const END_HOUR = 20;
    const SLOT_COUNT = (END_HOUR - START_HOUR) * 2;
    const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const TYPE_COLORS = {
      Lecture: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
      Laboratory: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
    };

    const toTitleCase = (str) => {
      if (!str) return '';
      return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    };

    const formatTime = (h) => {
      const hrs = Math.floor(h);
      const mins = h % 1 !== 0 ? '30' : '00';
      const displayH = hrs % 12 || 12;
      return `${displayH}:${mins}`;
    };

    const formatTimeAMPM = (h) => {
      const hrs = Math.floor(h);
      const mins = h % 1 !== 0 ? '30' : '00';
      const ampm = hrs >= 12 ? 'PM' : 'AM';
      const displayH = hrs % 12 || 12;
      return `${displayH}:${mins} ${ampm}`;
    };

    // Pre-generate slot rows (shared template)
    let slotsHtml = '';
    for (let i = 0; i < SLOT_COUNT; i++) {
      const slotHour = START_HOUR + i * 0.5;
      slotsHtml += `<div class="slot-row" style="top:${i * CELL_H}px;height:${CELL_H}px;">`;
      slotsHtml += `<div class="time-cell">${formatTime(slotHour)}</div>`;
      for (let d = 0; d < 7; d++) {
        slotsHtml += `<div class="day-cell"></div>`;
      }
      slotsHtml += `</div>`;
    }

    const gridH = SLOT_COUNT * CELL_H;
    const semDisplay = activeSemesterObj?.name || (
      selectedSemester === '3' || selectedSemester === 'Summer' || selectedSemester === 'summer'
        ? 'Summer'
        : `Semester ${selectedSemester}`
    );

    // Generate a single full-page landscape section for each room
    let pagesHtml = '';
    const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    roomsToPrint.forEach((roomItem) => {
      const roomEntries = schedulesByRoom[roomItem.roomCode] || schedulesByRoom[roomItem.roomName] || [];

      // Convert entries to day indexed blocks
      const blocksByDay = Array.from({ length: 7 }, () => []);
      roomEntries.forEach((entry) => {
        let dayIdx = entry.day;
        if (dayIdx === undefined || dayIdx === null || dayIdx < 0 || dayIdx >= 7) {
          if (entry.date) {
            const foundIdx = dayNames.indexOf(String(entry.date).toLowerCase().trim());
            if (foundIdx >= 0) dayIdx = foundIdx;
          }
        }
        if (dayIdx >= 0 && dayIdx <= 6) {
          blocksByDay[dayIdx].push(entry);
        }
      });

      // Build blocks overlay for this room
      let blocksHtml = '';
      blocksByDay.forEach((dayBlocks, dayIdx) => {
        dayBlocks.forEach((sched) => {
          const isLab = String(sched.type || '').toLowerCase().includes('lab');
          const colors = isLab ? TYPE_COLORS.Laboratory : TYPE_COLORS.Lecture;
          const startHour = Number(sched.startHour ?? sched.start ?? 0);
          const endHour = Number(sched.endHour ?? sched.end ?? 0);
          if (startHour <= 0 || endHour <= 0 || endHour <= startHour) return;

          const slotsFromStart = (startHour - START_HOUR) * 2;
          const durationSlots = (endHour - startHour) * 2;
          const top = Math.max(0, slotsFromStart * CELL_H);
          const height = Math.max(CELL_H, durationSlots * CELL_H);
          const left = `calc(60px + ${dayIdx} * ((100% - 60px) / 7) + 2px)`;
          const width = `calc((100% - 60px) / 7 - 4px)`;

          const courseCode = sched.courseCode || sched.course || '';
          const title = sched.title || sched.courseName || '';
          const instructor = toTitleCase(sched.instructor || sched.assignedTeacherName || '');
          const section = sched.section || sched.sectionName || sched.program || '';
          const timeRange = `${formatTimeAMPM(startHour)} - ${formatTimeAMPM(endHour)}`;

          blocksHtml += `<div style="position:absolute;top:${top}px;height:${height}px;left:${left};width:${width};background:${colors.bg};border:1.5px solid ${colors.border};border-radius:4px;padding:2px 3px;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;">`;
          if (courseCode) blocksHtml += `<div style="font-size:7px;font-weight:800;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${courseCode}</div>`;
          blocksHtml += `<div style="font-size:8px;font-weight:900;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${toTitleCase(title)}</div>`;
          if (instructor) blocksHtml += `<div style="font-size:7px;font-weight:600;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${instructor}</div>`;
          if (section) blocksHtml += `<div style="font-size:7px;font-weight:700;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Sec: ${section}</div>`;
          blocksHtml += `<div style="font-size:6.5px;font-weight:600;color:${colors.text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${timeRange}</div>`;
          blocksHtml += `</div>`;
        });
      });

      pagesHtml += `
      <div class="room-page">
        <div class="header">
          <div>
            <h1>${roomItem.buildingName} — ${roomItem.roomName || roomItem.roomCode}</h1>
            <p class="meta">ROOM TYPE: <span class="room-type">${roomItem.roomType}</span> · FLOOR ${roomItem.floorNumber} · CAPACITY: ${roomItem.capacity || 0} PAX</p>
          </div>
          <div class="right">
            <p>SWU-IFSS ROOM SCHEDULE</p>
            <p>${schoolYearLabel} · ${semDisplay}</p>
          </div>
        </div>
        <div class="grid-wrap">
          <div class="day-header">
            <div>TIME</div>
            ${DAYS.map((d) => `<div>${d}</div>`).join('')}
          </div>
          <div class="slots-container" style="height:${gridH}px;">
            ${slotsHtml}
            ${blocksHtml}
          </div>
        </div>
      </div>`;
    });

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>SWU-IFSS Room Schedules</title>
<style>
  @page {
    size: landscape;
    margin: 5mm;
  }
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
    background: white;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .room-page {
    page-break-after: always;
    break-after: page;
    min-height: 98vh;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 2px;
    box-sizing: border-box;
  }
  .room-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-bottom: 6px;
    border-bottom: 2px solid #333;
    margin-bottom: 8px;
  }
  .header h1 {
    font-size: 16px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: -0.5px;
  }
  .header .meta {
    font-size: 9px;
    font-weight: 700;
    color: #444;
    margin-top: 2px;
  }
  .header .meta .room-type {
    color: #7A0808;
    font-weight: 900;
    text-transform: uppercase;
  }
  .header .right {
    text-align: right;
  }
  .header .right p:first-child {
    font-size: 9px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .header .right p:last-child {
    font-size: 9px;
    font-weight: 700;
    color: #555;
  }
  .grid-wrap {
    position: relative;
    width: 100%;
  }
  .day-header {
    display: grid;
    grid-template-columns: 60px repeat(7, 1fr);
  }
  .day-header > div {
    background: #7A0808 !important;
    color: white !important;
    font-size: 10px;
    font-weight: 800;
    text-align: center;
    padding: 4px 0;
    border-right: 1px solid #333;
    border-top: 1px solid #333;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .day-header > div:first-child {
    border-left: 1px solid #333;
  }
  .slots-container {
    position: relative;
    border-left: 1px solid #333;
  }
  .slot-row {
    display: grid;
    grid-template-columns: 60px repeat(7, 1fr);
    position: absolute;
    left: 0;
    right: 0;
  }
  .time-cell {
    border-bottom: 1px solid #999;
    border-right: 1px solid #999;
    font-size: 8px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
  }
  .day-cell {
    border-bottom: 1px solid #ccc;
    border-right: 1px solid #ccc;
  }
</style>
</head>
<body>
  ${pagesHtml}
</body>
</html>`;
  };

  // 4. Trigger Printing for specified room objects
  const handleExecutePrint = async (targetRooms) => {
    if (!targetRooms || targetRooms.length === 0) {
      showNotification?.({
        type: 'warning',
        title: 'No Rooms Selected',
        message: 'Please select at least one room to print schedules.',
      });
      return;
    }

    setIsPrinting(true);
    setPrintStatus(`Fetching schedules for ${targetRooms.length} room${targetRooms.length > 1 ? 's' : ''}...`);

    try {
      const roomCodes = targetRooms.map((r) => r.roomCode);
      const schedulesByRoom = await fetchPlotEntriesForMultipleRooms(roomCodes, selectedSemester, 'regular');

      setPrintStatus('Generating printable schedule sheets...');
      const htmlContent = generateBulkPrintHtml(targetRooms, schedulesByRoom);

      // Create hidden iframe for printing
      let printFrame = document.getElementById('bulk-schedule-print-frame');
      if (printFrame) printFrame.remove();
      printFrame = document.createElement('iframe');
      printFrame.id = 'bulk-schedule-print-frame';
      printFrame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
      document.body.appendChild(printFrame);

      const frameDoc = printFrame.contentDocument || printFrame.contentWindow.document;
      frameDoc.open();
      frameDoc.write(htmlContent);
      frameDoc.close();

      printFrame.onload = () => {
        setTimeout(() => {
          setIsPrinting(false);
          setPrintStatus('');
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
          setTimeout(() => {
            if (printFrame.parentNode) printFrame.parentNode.removeChild(printFrame);
          }, 2000);
        }, 400);
      };
    } catch (err) {
      console.error('Error during bulk schedule printing:', err);
      setIsPrinting(false);
      setPrintStatus('');
      showNotification?.({
        type: 'error',
        title: 'Print Failed',
        message: err.message || 'An error occurred while generating room schedules for printing.',
      });
    }
  };

  // Print all currently selected rooms
  const handlePrintSelected = () => {
    const selectedList = allRooms.filter((r) => selectedRoomKeys.has(r.key));
    handleExecutePrint(selectedList);
  };

  // Quick print whole building
  const handlePrintWholeBuilding = (b, e) => {
    e.stopPropagation();
    const bId = b.id || b.docId;
    const bRooms = allRooms.filter((r) => r.buildingId === bId);
    handleExecutePrint(bRooms);
  };

  // Quick print whole floor
  const handlePrintWholeFloor = (buildingId, floorNumber, e) => {
    e.stopPropagation();
    const fRooms = allRooms.filter((r) => r.buildingId === buildingId && r.floorNumber === floorNumber);
    handleExecutePrint(fRooms);
  };

  // Quick print single room
  const handlePrintSingleRoom = (roomItem, e) => {
    e.stopPropagation();
    handleExecutePrint([roomItem]);
  };

  const selectedCount = selectedRoomKeys.size;
  const totalRoomsCount = allRooms.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-2xs space-y-6">
      {/* Header & Description */}
      <div className="pb-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <Printer size={18} className="text-[#7A0808]" />
            Print Room Schedule
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Select buildings, floors, or individual rooms to generate and bulk print official timetable schedules.
          </p>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <button
            type="button"
            onClick={handlePrintSelected}
            disabled={selectedCount === 0 || isPrinting}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 shadow-2xs transition-all cursor-pointer ${
              selectedCount > 0 && !isPrinting
                ? 'bg-[#7A0808] hover:bg-[#600000] text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isPrinting ? (
              <>
                <RefreshCw size={15} className="animate-spin text-white" />
                <span>{printStatus || 'Preparing Print...'}</span>
              </>
            ) : (
              <>
                <Printer size={15} />
                <span>Print Selected Schedules ({selectedCount})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Controls Bar: Semester Selector & Search & Bulk Selection Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-4 items-center bg-gray-50/70 p-4 rounded-2xl border border-gray-200/80">
        {/* Semester Selector Tabs */}
        <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[11px] font-black uppercase text-gray-400 px-2.5">Semester:</span>
          {configuredSemesters.map((sem) => {
            const isSelected = selectedSemester === sem.value;
            return (
              <button
                key={sem.id}
                type="button"
                onClick={() => setSelectedSemester(sem.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#7A0808] text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {sem.name}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by building name, floor, room code, or type..."
            className="form-input w-full pl-9 pr-4 py-2 text-xs font-medium rounded-xl border border-gray-200 bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Selection Shortcuts */}
        <div className="flex items-center gap-2 justify-end">
          <button
            type="button"
            onClick={handleSelectAllVisible}
            className="px-3 py-2 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <CheckSquare size={14} className="text-[#7A0808]" />
            Select All ({visibleRooms.length})
          </button>
          {selectedCount > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-2 bg-white hover:bg-red-50 border border-gray-200 hover:border-red-200 rounded-xl text-xs font-bold text-[#7A0808] shadow-2xs transition-all cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Buildings & Rooms Hierarchical Tree */}
      {loadingBuildings ? (
        <div className="py-12 text-center text-gray-400 space-y-3">
          <RefreshCw size={24} className="animate-spin mx-auto text-[#7A0808]" />
          <p className="text-xs font-bold">Loading buildings and rooms...</p>
        </div>
      ) : filteredBuildings.length === 0 ? (
        <div className="py-12 text-center text-gray-400 space-y-2 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
          <Building2 size={28} className="mx-auto text-gray-300" />
          <p className="text-xs font-bold text-gray-600">No rooms or buildings match your search.</p>
          <p className="text-[11px] text-gray-400">Try adjusting your search query or clear the filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBuildings.map((building) => {
            const bId = building.id || building.docId;
            const isExpanded = expandedBuildingIds.has(bId);

            // Calculate building room count and selection status
            const bRooms = [];
            (building.floorData || []).forEach((f) => {
              const fNum = f.floorNumber || f.floor || 1;
              (f.rooms || []).forEach((r) => {
                const rCode = r.roomCode || r.id || r.name;
                bRooms.push({
                  key: `${bId}__${fNum}__${rCode}`,
                  buildingId: bId,
                  buildingName: building.name,
                  floorNumber: fNum,
                  roomCode: rCode,
                  roomName: r.name || rCode,
                  roomType: r.type || 'Classroom',
                  capacity: r.capacity || 0,
                });
              });
            });

            const bSelectedCount = bRooms.filter((r) => selectedRoomKeys.has(r.key)).length;
            const isAllBuildingSelected = bRooms.length > 0 && bSelectedCount === bRooms.length;
            const isPartialBuildingSelected = bSelectedCount > 0 && bSelectedCount < bRooms.length;

            return (
              <div
                key={bId}
                className="border border-gray-200 rounded-2xl bg-white shadow-2xs overflow-hidden transition-all"
              >
                {/* Building Header Accordion */}
                <div
                  onClick={() => toggleExpandBuilding(bId)}
                  className={`p-4 flex items-center justify-between gap-4 cursor-pointer select-none transition-colors ${
                    isExpanded ? 'bg-gray-50/80 border-b border-gray-200' : 'hover:bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    {/* Building Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBuilding(building);
                      }}
                      className="p-1 text-[#7A0808] hover:scale-110 transition-transform cursor-pointer"
                      title={isAllBuildingSelected ? 'Deselect all in building' : 'Select all in building'}
                    >
                      {isAllBuildingSelected ? (
                        <CheckSquare size={20} className="fill-red-100 text-[#7A0808]" />
                      ) : isPartialBuildingSelected ? (
                        <MinusSquare size={20} className="text-[#7A0808]" />
                      ) : (
                        <Square size={20} className="text-gray-300 hover:text-gray-500" />
                      )}
                    </button>

                    <div className="p-2 rounded-xl bg-red-50 text-[#7A0808]">
                      <Building2 size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-gray-900 truncate">{building.name}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gray-100 text-gray-700">
                          {bRooms.length} Room{bRooms.length !== 1 ? 's' : ''}
                        </span>
                        {bSelectedCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-[#7A0808] border border-red-200">
                            {bSelectedCount} Selected
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                        {building.floorData?.length || 0} Floors · {building.code || 'Main Campus'}
                      </p>
                    </div>
                  </div>

                  {/* Building Quick Actions */}
                  <div className="flex items-center gap-2.5">
                    {bRooms.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => handlePrintWholeBuilding(building, e)}
                        className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 shadow-2xs transition-all cursor-pointer"
                        title={`Print all ${bRooms.length} room schedules in ${building.name}`}
                      >
                        <Printer size={13} className="text-[#7A0808]" />
                        <span>Print Building</span>
                      </button>
                    )}

                    <div className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </div>
                </div>

                {/* Building Floors & Rooms Body */}
                {isExpanded && (
                  <div className="p-4 space-y-4 bg-gray-50/30">
                    {(building.floorData || []).length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2">No floors registered for this building.</p>
                    ) : (
                      (building.floorData || []).map((floor) => {
                        const fNum = floor.floorNumber || floor.floor || 1;
                        const fRooms = floor.rooms || [];
                        const fRoomKeys = fRooms.map((r) => `${bId}__${fNum}__${r.roomCode || r.id || r.name}`);
                        const fSelectedCount = fRoomKeys.filter((k) => selectedRoomKeys.has(k)).length;
                        const isAllFloorSelected = fRooms.length > 0 && fSelectedCount === fRooms.length;
                        const isPartialFloorSelected = fSelectedCount > 0 && fSelectedCount < fRooms.length;

                        return (
                          <div
                            key={floor.floorId || fNum}
                            className="bg-white rounded-xl border border-gray-200/80 p-4 space-y-3 shadow-2xs"
                          >
                            {/* Floor Header Bar */}
                            <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 gap-3">
                              <div className="flex items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => toggleFloor(bId, fNum, fRooms)}
                                  className="text-[#7A0808] hover:scale-110 transition-transform cursor-pointer"
                                  title={isAllFloorSelected ? 'Deselect entire floor' : 'Select entire floor'}
                                >
                                  {isAllFloorSelected ? (
                                    <CheckSquare size={18} className="fill-red-100 text-[#7A0808]" />
                                  ) : isPartialFloorSelected ? (
                                    <MinusSquare size={18} className="text-[#7A0808]" />
                                  ) : (
                                    <Square size={18} className="text-gray-300 hover:text-gray-500" />
                                  )}
                                </button>
                                <div>
                                  <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                                    <Layers size={14} className="text-gray-400" />
                                    {floor.label || `Floor ${fNum}`}
                                  </span>
                                </div>
                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                  {fRooms.length} room{fRooms.length !== 1 ? 's' : ''}
                                </span>
                              </div>

                              {/* Floor Print Quick Action */}
                              {fRooms.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => handlePrintWholeFloor(bId, fNum, e)}
                                  className="text-[11px] font-bold text-gray-600 hover:text-[#7A0808] flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                                >
                                  <Printer size={12} />
                                  <span>Print Floor</span>
                                </button>
                              )}
                            </div>

                            {/* Rooms Cards Grid */}
                            {fRooms.length === 0 ? (
                              <p className="text-[11px] text-gray-400 italic">No rooms listed on this floor.</p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
                                {fRooms.map((room) => {
                                  const rCode = room.roomCode || room.id || room.name;
                                  const rKey = `${bId}__${fNum}__${rCode}`;
                                  const isSelected = selectedRoomKeys.has(rKey);
                                  const isLab = String(room.type || '').toLowerCase().includes('lab');

                                  const roomItem = {
                                    key: rKey,
                                    buildingId: bId,
                                    buildingName: building.name,
                                    floorNumber: fNum,
                                    roomCode: rCode,
                                    roomName: room.name || rCode,
                                    roomType: room.type || 'Classroom',
                                    capacity: room.capacity || 0,
                                  };

                                  return (
                                    <div
                                      key={rKey}
                                      onClick={() => toggleRoom(rKey)}
                                      className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                                        isSelected
                                          ? 'bg-red-50/70 border-red-300 ring-1 ring-red-200'
                                          : 'bg-gray-50/50 border-gray-200 hover:bg-gray-100/70'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="text-[#7A0808]">
                                          {isSelected ? (
                                            <CheckSquare size={16} className="fill-red-100 text-[#7A0808]" />
                                          ) : (
                                            <Square size={16} className="text-gray-300" />
                                          )}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="text-xs font-black text-gray-900 truncate">
                                            {room.name || rCode}
                                          </p>
                                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                            <span
                                              className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded ${
                                                isLab
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : 'bg-rose-100 text-rose-800'
                                              }`}
                                            >
                                              {room.type || 'Classroom'}
                                            </span>
                                            <span className="text-[10px] text-gray-500 font-bold">
                                              {room.capacity || 0} pax
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Quick Print Single Room Button */}
                                      <button
                                        type="button"
                                        onClick={(e) => handlePrintSingleRoom(roomItem, e)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-[#7A0808] hover:bg-white shadow-2xs transition-all flex-shrink-0"
                                        title={`Print schedule for ${room.name || rCode}`}
                                      >
                                        <Printer size={13} />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
