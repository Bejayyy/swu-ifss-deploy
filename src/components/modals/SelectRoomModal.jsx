import React, { useState, useMemo } from 'react';
import {
  Search, Building2, DoorOpen, Users, X, Check, Filter, Wrench,
  CheckCircle, XCircle, Clock, RotateCcw, ChevronRight, Layers, Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CustomSelect from '../ui/CustomSelect';

const MAROON = '#7A0808';

const TYPE_COLORS = {
  Lecture: { bg: 'bg-blue-50 text-blue-700 border-blue-200', text: 'text-blue-700' },
  Laboratory: { bg: 'bg-purple-50 text-purple-700 border-purple-200', text: 'text-purple-700' },
  'Seminar Room': { bg: 'bg-teal-50 text-teal-700 border-teal-200', text: 'text-teal-700' },
  'Conference Room': { bg: 'bg-slate-100 text-slate-700 border-slate-200', text: 'text-slate-700' },
  Gymnasium: { bg: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700' },
};

function SystemStatusBadge({ status, isUnderMaintenance }) {
  if (isUnderMaintenance) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-2xs">
        <Wrench size={12} className="text-amber-600" />
        <span>Maintenance</span>
      </span>
    );
  }
  if (status === 'Occupied') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
        <XCircle size={12} className="text-rose-600" />
        <span>Occupied</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
      <CheckCircle size={12} className="text-emerald-600" />
      <span>Available</span>
    </span>
  );
}

export default function SelectRoomModal({ isOpen, onClose, onSelectRoom }) {
  const { buildingList } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  // Extract all rooms flat from buildingList
  const allRooms = useMemo(() => {
    const list = [];
    if (!buildingList?.length) return list;

    buildingList.forEach((b) => {
      if (b.floorData) {
        b.floorData.forEach((f) => {
          if (f.rooms) {
            f.rooms.forEach((r) => {
              list.push({
                ...r,
                buildingId: b.id,
                buildingName: b.name,
                buildingPrefix: b.prefix || b.code || 'BLD',
                floor: f.floor,
                floorId: f.floorId,
                floorLabel: f.label || `Floor ${f.floor}`,
              });
            });
          }
        });
      }
    });
    return list;
  }, [buildingList]);

  // Extract unique room types for filter
  const roomTypes = useMemo(() => {
    const types = new Set();
    allRooms.forEach((r) => {
      if (r.type) types.add(r.type);
    });
    return Array.from(types).sort();
  }, [allRooms]);

  // Filter rooms based on search and dropdown selections
  const filteredRooms = useMemo(() => {
    return allRooms.filter((r) => {
      // Building filter
      if (selectedBuildingId !== 'all' && String(r.buildingId) !== String(selectedBuildingId)) {
        return false;
      }
      // Room Type filter
      if (selectedType !== 'all' && r.type !== selectedType) {
        return false;
      }
      // Status filter
      if (selectedStatus !== 'all') {
        const isUnderMaint = r.maintenanceStatus === 'under-maintenance';
        if (selectedStatus === 'under-maintenance' && !isUnderMaint) return false;
        if (selectedStatus === 'available' && (isUnderMaint || r.status === 'Occupied')) return false;
        if (selectedStatus === 'occupied' && (isUnderMaint || r.status !== 'Occupied')) return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = r.name?.toLowerCase().includes(q) || r.id?.toLowerCase().includes(q);
        const matchesBuilding = r.buildingName?.toLowerCase().includes(q);
        const matchesType = r.type?.toLowerCase().includes(q);
        const matchesFacilities = r.facilities?.some((f) => String(f).toLowerCase().includes(q)) ||
          r.equipment?.some((e) => String(e).toLowerCase().includes(q));
        if (!matchesName && !matchesBuilding && !matchesType && !matchesFacilities) {
          return false;
        }
      }
      return true;
    });
  }, [allRooms, selectedBuildingId, selectedType, selectedStatus, searchQuery]);

  const hasActiveFilters = searchQuery || selectedBuildingId !== 'all' || selectedType !== 'all' || selectedStatus !== 'all';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Module Banner */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF0F0] text-[#7A0808] border border-red-100 flex items-center justify-center font-bold shadow-2xs">
              <DoorOpen size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-[#2B3235]">Room Finder Module</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#7A0808] text-white">
                  Step 1 of 3
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Browse and select an available room or venue before completing your reservation request form.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters Panel with System Theme Styling */}
        <div className="p-4 sm:p-5 bg-gray-50/70 border-b border-gray-100 flex-shrink-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search room name, ID, facility..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#7A0808]/20 font-medium transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Building Filter */}
            <div>
              <CustomSelect
                size="sm"
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                options={[
                  { value: 'all', label: `All Buildings (${buildingList?.length || 0})` },
                  ...(buildingList || []).map((b) => ({ value: b.id, label: b.name })),
                ]}
                placeholder="Select Building"
              />
            </div>

            {/* Room Type Filter */}
            <div>
              <CustomSelect
                size="sm"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                options={[
                  { value: 'all', label: 'All Room Types' },
                  ...roomTypes.map((t) => ({ value: t, label: t })),
                ]}
                placeholder="Select Room Type"
              />
            </div>

            {/* Status Filter matching System Status Container aesthetic */}
            <div>
              <CustomSelect
                size="sm"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'available', label: 'Available Rooms' },
                  { value: 'occupied', label: 'Occupied Rooms' },
                  { value: 'under-maintenance', label: 'Under Maintenance' },
                ]}
                placeholder="Select Status"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-600">
                Showing <strong className="text-[#7A0808] font-black">{filteredRooms.length}</strong> of {allRooms.length} rooms
              </span>
              {hasActiveFilters && (
                <span className="px-2 py-0.5 rounded-md bg-red-50 text-[#7A0808] text-[10px] font-bold border border-red-100">
                  Filtered
                </span>
              )}
            </div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedBuildingId('all');
                  setSelectedType('all');
                  setSelectedStatus('all');
                }}
                className="text-[#7A0808] font-bold hover:underline flex items-center gap-1 text-xs"
              >
                <RotateCcw size={12} /> Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Room Finder Cards Grid */}
        <div className="p-5 overflow-y-auto flex-1 max-h-[55vh] bg-gray-50/30">
          {filteredRooms.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center my-4">
              <DoorOpen size={40} className="mx-auto text-gray-300 mb-3" />
              <h3 className="text-sm font-bold text-gray-700">No matching rooms found</h3>
              <p className="text-xs text-gray-400 mt-1">Try resetting or broadening your filter criteria.</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedBuildingId('all');
                    setSelectedType('all');
                    setSelectedStatus('all');
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-[#7A0808] font-bold text-xs hover:bg-red-100 transition-colors"
                >
                  <RotateCcw size={12} /> Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredRooms.map((room) => {
                const isUnderMaintenance = room.maintenanceStatus === 'under-maintenance';
                const isOccupied = room.status === 'Occupied';
                const typeStyle = TYPE_COLORS[room.type] || { bg: 'bg-gray-100 text-gray-700 border-gray-200' };
                const equipmentList = room.facilities || room.equipment || [];

                return (
                  <div
                    key={`${room.buildingId}-${room.id}`}
                    className={`bg-white rounded-2xl border p-4 shadow-2xs transition-all flex flex-col justify-between hover:shadow-md hover:border-[#7A0808]/40 ${
                      isUnderMaintenance ? 'opacity-70 border-amber-200 bg-amber-50/10' : 'border-gray-200'
                    }`}
                  >
                    <div>
                      {/* Card Header: Room Name + Badges */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-black text-sm text-[#2B3235]">{room.name || room.id}</h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeStyle.bg}`}>
                              {room.type || 'Lecture'}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-gray-500 mt-1 flex items-center gap-1.5">
                            <Building2 size={13} className="text-[#7A0808] flex-shrink-0" />
                            <span>{room.buildingName}</span>
                            <span className="text-gray-300">•</span>
                            <span className="font-bold text-gray-700">{room.floorLabel}</span>
                          </p>
                        </div>

                        {/* Uniform Status Container / Badge */}
                        <SystemStatusBadge status={room.status} isUnderMaintenance={isUnderMaintenance} />
                      </div>

                      {/* Room Specs & Equipment Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-gray-100 text-xs">
                        <span className="inline-flex items-center gap-1 font-bold text-gray-700 bg-gray-100/80 px-2 py-1 rounded-lg text-[11px]">
                          <Users size={12} className="text-gray-500" />
                          <span>{room.capacity ? `${room.capacity} pax` : 'Standard Capacity'}</span>
                        </span>

                        {equipmentList.slice(0, 3).map((item, idx) => (
                          <span key={idx} className="text-[10px] font-bold text-gray-600 bg-gray-50 border border-gray-150 px-2 py-0.5 rounded-md">
                            {item}
                          </span>
                        ))}
                        {equipmentList.length > 3 && (
                          <span className="text-[10px] font-extrabold text-[#7A0808] bg-red-50 px-1.5 py-0.5 rounded-md">
                            +{equipmentList.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Action Button */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-gray-400">
                        {room.buildingPrefix ? `ID: ${room.buildingPrefix}-${room.id}` : `ID: ${room.id}`}
                      </span>

                      {isUnderMaintenance ? (
                        <button
                          type="button"
                          disabled
                          className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed inline-flex items-center gap-1"
                        >
                          <Wrench size={12} /> Unavailable
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectRoom(room)}
                          className="btn-maroon text-xs px-4 py-2 font-bold rounded-xl inline-flex items-center gap-1.5 group cursor-pointer shadow-2xs"
                        >
                          <span>Select Room</span>
                          <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
