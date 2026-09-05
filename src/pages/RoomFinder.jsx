import React, { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Building2, Users, BookOpen, X,
  ChevronLeft, ChevronRight, SlidersHorizontal,
  DoorOpen, Filter, RotateCcw, Eye,
} from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import { TableSkeleton } from '../components/SkeletonLoader';
import CustomSelect from '../components/ui/CustomSelect';

const MAROON = '#7A0808';
const TEXT = '#2B3235';
const R = 10;

const TYPE_COLORS = {
  Lecture: { bg: '#DBEAFE', text: '#1E40AF' },
  Laboratory: { bg: '#EDE9FE', text: '#6D28D9' },
  'Seminar Room': { bg: '#CCFBF1', text: '#0F766E' },
  'Conference Room': { bg: '#E2E8F0', text: '#334155' },
  Gymnasium: { bg: '#FEE2E2', text: '#991B1B' },
};



const PAGE_SIZE_OPTIONS = [10, 20, 50];
const EMPTY_BUILDING_LIST = [];

function Chip({ label, active, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap"
      style={
        active
          ? { background: MAROON, color: '#fff', borderColor: MAROON }
          : { background: '#fff', color: TEXT, borderColor: '#e2e5e8' }
      }
    >
      {label}
      {count !== undefined && (
        <span
          className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[10px] font-black"
          style={active ? { background: 'rgba(255,255,255,0.25)', color: '#fff' } : { background: '#f3f4f6', color: TEXT }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

const STANDARD_EQUIPMENT = [
  'Air Conditioning',
  'Audio System',
  'CCTV',
  'Computers',
  'INTERNET',
  'Projector',
  'Whiteboard',
];

function EquipChip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:border-[#7A0808]"
      style={
        active
          ? { background: '#FFF0F0', color: MAROON, borderColor: MAROON, boxShadow: '0 1px 2px rgba(122,8,8,0.1)' }
          : { background: '#FFFFFF', color: '#475569', borderColor: '#E2E8F0' }
      }
    >
      {active && <span className="text-xs font-black">✓</span>}
      {label}
    </button>
  );
}


export default function RoomFinder() {
  const navigate = useNavigate();
  const appContext = useApp();
  const buildingList = Array.isArray(appContext?.buildingList) ? appContext.buildingList : EMPTY_BUILDING_LIST;
  const appLoading = appContext?.buildingsLoading ?? false;
  const { canSubmitReservation } = useRolePermissions();
  const { openReservation, modals } = useRoomReservationFlow();

  // Filters
  const [q, setQ] = useState('');
  const [selectedBuildings, setSelectedBuildings] = useState([]);
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [selectedEquipment, setSelectedEquipment] = useState([]);
  const [capMin, setCapMin] = useState('');
  const [capMax, setCapMax] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [showFilters, setShowFilters] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Flatten all rooms from building data
  const allRooms = useMemo(() => {
    const out = [];
    buildingList.forEach((b) => {
      (Array.isArray(b.floorData) ? b.floorData : []).forEach((f) => {
        (Array.isArray(f.rooms) ? f.rooms : []).forEach((r) => {
          out.push({
            ...r,
            buildingName: b.name,
            buildingId: b.id,
            buildingPrefix: b.prefix || b.code || '',
            floor: f.floor,
            floorId: f.floorId,
          });
        });
      });
    });
    return out;
  }, [buildingList]);

  // Derive unique values from room data for filter options
  const allTypes = useMemo(() => [...new Set(allRooms.map((r) => r.type))].sort(), [allRooms]);
  const allEquipment = useMemo(() => {
    const set = new Set(STANDARD_EQUIPMENT);
    allRooms.forEach((r) => (r.equipment || []).forEach((e) => set.add(e)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allRooms]);
  // Derive unique saved floors from buildingList and room data for filter options
  const availableFloors = useMemo(() => {
    const floorMap = new Map(); // floorNumber -> label

    // Filter building list based on selected building filter if active
    const targetBuildings = selectedBuildings.length
      ? buildingList.filter((b) => selectedBuildings.includes(b.id))
      : buildingList;

    targetBuildings.forEach((b) => {
      // 1. Check floorData array (saved floors of the building)
      if (Array.isArray(b.floorData)) {
        b.floorData.forEach((f) => {
          const floorNum = Number(f.floor);
          if (!isNaN(floorNum) && floorNum > 0) {
            const label = f.label || `Floor ${floorNum}`;
            if (!floorMap.has(floorNum)) {
              floorMap.set(floorNum, label);
            }
          }
        });
      }

      // 2. Check b.floors count
      const floorsCount = Number(b.floors);
      if (!isNaN(floorsCount) && floorsCount > 0) {
        for (let i = 1; i <= floorsCount; i += 1) {
          if (!floorMap.has(i)) {
            floorMap.set(i, `Floor ${i}`);
          }
        }
      }
    });

    // 3. Fallback: check allRooms
    allRooms.forEach((r) => {
      if (selectedBuildings.length && !selectedBuildings.includes(r.buildingId)) return;
      const fNum = Number(r.floor);
      if (!isNaN(fNum) && fNum > 0 && !floorMap.has(fNum)) {
        floorMap.set(fNum, r.floorLabel || `Floor ${fNum}`);
      }
    });

    return Array.from(floorMap.entries())
      .map(([floor, label]) => ({ floor, label }))
      .sort((a, b) => a.floor - b.floor);
  }, [buildingList, selectedBuildings, allRooms]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (q) count++;
    if (selectedBuildings.length) count++;
    if (selectedTypes.length) count++;
    if (selectedStatuses.length) count++;
    if (selectedEquipment.length) count++;
    if (capMin) count++;
    if (capMax) count++;
    if (selectedFloor !== 'all') count++;
    return count;
  }, [q, selectedBuildings, selectedTypes, selectedStatuses, selectedEquipment, capMin, capMax, selectedFloor]);

  // Filter rooms
  const filtered = useMemo(() => {
    return allRooms.filter((r) => {
      // Text search
      if (q) {
        const hay = `${r.id} ${r.name} ${r.type} ${r.buildingName} ${r.roomCode || ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      // Building filter
      if (selectedBuildings.length && !selectedBuildings.includes(r.buildingId)) return false;
      // Type filter
      if (selectedTypes.length && !selectedTypes.includes(r.type)) return false;
      // Status filter
      if (selectedStatuses.length && !selectedStatuses.includes(r.status)) return false;
      // Capacity range
      const cap = r.capacity || 0;
      if (capMin && cap < Number(capMin)) return false;
      if (capMax && cap > Number(capMax)) return false;
      // Equipment filter (AND logic: room must have ALL selected equipment)
      if (selectedEquipment.length) {
        const roomEquip = (r.equipment || []).map((e) => e.toLowerCase());
        if (!selectedEquipment.every((e) => roomEquip.includes(e.toLowerCase()))) return false;
      }
      // Floor filter
      if (selectedFloor !== 'all' && r.floor !== Number(selectedFloor)) return false;
      return true;
    });
  }, [allRooms, q, selectedBuildings, selectedTypes, selectedStatuses, selectedEquipment, capMin, capMax, selectedFloor]);

  // Group filtered rooms by building for display
  const groupedByBuilding = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      if (!map.has(r.buildingId)) {
        map.set(r.buildingId, { buildingName: r.buildingName, buildingId: r.buildingId, rooms: [] });
      }
      map.get(r.buildingId).rooms.push(r);
    });
    return [...map.values()].sort((a, b) => a.buildingName.localeCompare(b.buildingName));
  }, [filtered]);

  // Paginate flat list
  const totalRooms = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalRooms / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRooms = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  // Group paginated rooms by building
  const paginatedGrouped = useMemo(() => {
    const map = new Map();
    paginatedRooms.forEach((r) => {
      if (!map.has(r.buildingId)) {
        map.set(r.buildingId, { buildingName: r.buildingName, buildingId: r.buildingId, rooms: [] });
      }
      map.get(r.buildingId).rooms.push(r);
    });
    return [...map.values()];
  }, [paginatedRooms]);

  const clearFilters = useCallback(() => {
    setQ('');
    setSelectedBuildings([]);
    setSelectedTypes([]);
    setSelectedStatuses([]);
    setSelectedEquipment([]);
    setCapMin('');
    setCapMax('');
    setSelectedFloor('all');
    setPage(1);
  }, []);

  const toggleArray = (arr, setArr, val) => {
    setArr((prev) => (prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val]));
    setPage(1);
  };

  // Reset page when filters change
  const setFilterAndReset = (setter) => (val) => { setter(val); setPage(1); };

  const isLoading = appLoading && allRooms.length === 0;

  return (
    <Layout title="Room Finder" subtitle="Search and filter rooms across all buildings">
      <div className="flex gap-5" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* ── Filter Sidebar ── */}
        <div
          className={`bg-white border border-gray-100 shadow-sm flex-shrink-0 transition-all duration-300 overflow-hidden ${showFilters ? 'w-[280px]' : 'w-0 border-0 p-0'}`}
          style={{ borderRadius: R }}
        >
          {showFilters && (
            <div className="p-4 h-full overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Filter size={14} style={{ color: MAROON }} />
                  <span className="text-sm font-black" style={{ color: TEXT }}>Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-[6px] text-[10px] font-black shadow-2xs" style={{ background: '#F59E0B', color: '#FFFFFF', borderRadius: 6 }}>
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearFilters} className="flex items-center gap-1 text-[11px] font-bold hover:underline" style={{ color: MAROON }}>
                    <RotateCcw size={11} /> Clear all
                  </button>
                )}
              </div>

              {/* Search */}
              <div className="mb-4">
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: TEXT, opacity: 0.5 }}>Search</label>
                <div className="relative">
                  <input
                    className="form-input text-xs"
                    placeholder="Room name, building..."
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setPage(1); }}
                  />
                  {q ? (
                    <button type="button" onClick={() => { setQ(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={12} />
                    </button>
                  ) : (
                    <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={13} />
                  )}
                </div>
              </div>

              {/* Building Filter */}
              <div className="mb-4">
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: TEXT, opacity: 0.5 }}>Building</label>
                <div className="space-y-1 max-h-[120px] overflow-y-auto">
                  {buildingList.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer hover:bg-gray-50 text-xs font-semibold" style={{ color: TEXT }}>
                      <input
                        type="checkbox"
                        checked={selectedBuildings.includes(b.id)}
                        onChange={() => toggleArray(selectedBuildings, setSelectedBuildings, b.id)}
                        className="accent-[#7A0808] rounded"
                      />
                      <span className="truncate">{b.name}</span>
                      <span className="ml-auto text-[10px] font-bold text-gray-400">{b.totalRooms || 0}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Room Type Filter */}
              <div className="mb-4">
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: TEXT, opacity: 0.5 }}>Room Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {allTypes.map((t) => (
                    <Chip
                      key={t}
                      label={t}
                      active={selectedTypes.includes(t)}
                      onClick={() => toggleArray(selectedTypes, setSelectedTypes, t)}
                      count={allRooms.filter((r) => r.type === t).length}
                    />
                  ))}
                </div>
              </div>


              {/* Capacity Range */}
              <div className="mb-4">
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: TEXT, opacity: 0.5 }}>Capacity Range</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    className="form-input text-xs text-center"
                    placeholder="Min"
                    value={capMin}
                    onChange={(e) => { setCapMin(e.target.value); setPage(1); }}
                    min={0}
                    style={{ width: '50%' }}
                  />
                  <span className="text-xs font-bold text-gray-300">—</span>
                  <input
                    type="number"
                    className="form-input text-xs text-center"
                    placeholder="Max"
                    value={capMax}
                    onChange={(e) => { setCapMax(e.target.value); setPage(1); }}
                    min={0}
                    style={{ width: '50%' }}
                  />
                </div>
              </div>

              {/* Floor Filter */}
              <div className="mb-4">
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: TEXT, opacity: 0.5 }}>Floor</label>
                <CustomSelect
                  value={selectedFloor}
                  onChange={(e) => { setSelectedFloor(e.target.value); setPage(1); }}
                  options={[
                    { value: 'all', label: 'All Floors' },
                    ...availableFloors.map(({ floor, label }) => ({ value: floor, label })),
                  ]}
                />
              </div>

              {/* Equipment / Inclusions */}
              <div className="mb-2">
                <label className="text-[11px] font-bold uppercase tracking-wider mb-1.5 block" style={{ color: TEXT, opacity: 0.5 }}>EQUIPMENT / INCLUSIONS</label>
                <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
                  {allEquipment.map((e) => (
                    <label key={e} className="flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer hover:bg-gray-50 text-xs font-semibold" style={{ color: TEXT }}>
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(e)}
                        onChange={() => toggleArray(selectedEquipment, setSelectedEquipment, e)}
                        className="accent-[#7A0808] rounded"
                      />
                      <span className="truncate">{e}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 min-w-0">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className="btn-maroon text-xs px-3.5 py-2 flex items-center gap-1.5 font-bold shadow-2xs cursor-pointer"
              >
                <SlidersHorizontal size={14} />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
                {!showFilters && activeFilterCount > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-black shadow-2xs bg-[#F59E0B] text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <p className="text-sm font-bold" style={{ color: TEXT }}>
                <span style={{ color: MAROON }}>{totalRooms}</span> room{totalRooms !== 1 ? 's' : ''} found
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600 border border-gray-200">
                10 rooms per page
              </span>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : totalRooms === 0 ? (
            <div className="bg-white border border-gray-100 shadow-sm p-12 text-center" style={{ borderRadius: R }}>
              <DoorOpen size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-bold mb-1" style={{ color: TEXT }}>No rooms found</p>
              <p className="text-xs text-gray-400">Try adjusting your filters or search criteria.</p>
              {activeFilterCount > 0 && (
                <button type="button" onClick={clearFilters} className="mt-3 text-xs font-bold flex items-center gap-1 mx-auto" style={{ color: MAROON }}>
                  <RotateCcw size={12} /> Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: R }}>
              {/* Table header */}
              <div className="grid grid-cols-[minmax(120px,1.2fr)_minmax(110px,1fr)_60px_minmax(90px,1fr)_70px_minmax(120px,1.5fr)_60px] gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50/60 items-center">
                {['Room', 'Building', 'Floor', 'Type', 'Capacity', 'Equipment', ''].map((h, i) => (
                  <span
                    key={h}
                    className={`text-[10px] font-bold uppercase tracking-wider ${i === 6 ? 'text-right' : 'text-left'}`}
                    style={{ color: TEXT, opacity: 0.45 }}
                  >
                    {h}
                  </span>
                ))}
              </div>

              {/* Room rows */}
              {paginatedRooms.map((room, idx) => {
                const typeColor = TYPE_COLORS[room.type] || { bg: '#F3F4F6', text: '#374151' };
                const equipList = room.equipment || [];

                    return (
                      <div
                        key={`${room.buildingId}-${room.docId || room.id}-${idx}`}
                        className="grid grid-cols-[minmax(120px,1.2fr)_minmax(110px,1fr)_60px_minmax(90px,1fr)_70px_minmax(120px,1.5fr)_60px] gap-4 px-5 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors items-center group"
                      >
                        {/* Room name */}
                        <div className="flex items-center justify-start gap-2.5 min-w-0 text-left">
                          <DoorOpen size={14} className="text-gray-400 flex-shrink-0" />
                          <span className="text-xs font-bold truncate" style={{ color: TEXT }}>{room.name || room.id}</span>
                        </div>

                        {/* Building */}
                        <span className="text-xs font-medium truncate text-left" style={{ color: TEXT, opacity: 0.75 }}>{room.buildingName}</span>

                        {/* Floor */}
                        <span className="text-xs font-semibold text-left" style={{ color: TEXT }}>F{room.floor}</span>

                        {/* Type */}
                        <div className="flex justify-start">
                          <span
                            className="text-[10px] font-black px-2.5 py-0.5 rounded-full truncate inline-block"
                            style={{ background: typeColor.bg, color: typeColor.text }}
                          >
                            {room.type}
                          </span>
                        </div>

                        {/* Capacity */}
                        <div className="flex items-center justify-start gap-1">
                          <Users size={11} className="text-gray-400" />
                          <span className="text-xs font-bold" style={{ color: TEXT }}>{room.capacity || 0}</span>
                        </div>

                        {/* Equipment */}
                        <div className="flex flex-wrap gap-1 min-w-0 justify-start">
                          {equipList.length === 0 ? (
                            <span className="text-[10px] text-gray-300 italic">None</span>
                          ) : equipList.length <= 2 ? (
                            equipList.map((e) => (
                              <span key={e} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate">{e}</span>
                            ))
                          ) : (
                            <>
                              {equipList.slice(0, 2).map((e) => (
                                <span key={e} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate">{e}</span>
                              ))}
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-gray-400" title={equipList.slice(2).join(', ')}>
                                +{equipList.length - 2}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            title="View Room"
                            onClick={() =>
                              navigate(`/room/${room.id}`, {
                                state: { room, buildingId: room.buildingId, buildingName: room.buildingName, floor: room.floor, floorId: room.floorId },
                              })
                            }
                          >
                            <Eye size={14} style={{ color: MAROON }} />
                          </button>
                          {canSubmitReservation() && (
                            <button
                              type="button"
                              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                              title="Reserve Room"
                              onClick={() =>
                                openReservation({
                                  building: room.buildingName,
                                  buildingId: room.buildingId,
                                  room: room.id,
                                  roomDocId: room.docId,
                                  floor: room.floor,
                                  designatedVenue: `${room.id}, ${room.buildingName} Floor ${room.floor}`,
                                })
                              }
                            >
                              <BookOpen size={14} style={{ color: '#166534' }} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

              {/* Pagination */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/40">
                <p className="text-[11px] font-semibold text-gray-400">
                  Showing {Math.min((safePage - 1) * pageSize + 1, totalRooms)}–{Math.min(safePage * pageSize, totalRooms)} of {totalRooms} rooms
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} style={{ color: TEXT }} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (safePage <= 4) {
                      pageNum = i + 1;
                    } else if (safePage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = safePage - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setPage(pageNum)}
                        className="min-w-[28px] h-[28px] flex items-center justify-center rounded-lg text-[11px] font-bold transition-all"
                        style={
                          pageNum === safePage
                            ? { background: MAROON, color: '#fff' }
                            : { color: TEXT }
                        }
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} style={{ color: TEXT }} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {modals}
    </Layout>
  );
}
