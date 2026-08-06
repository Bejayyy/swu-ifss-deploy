import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Building2, Calendar, ChevronRight, ChevronLeft, ChevronDown, Layers, DoorOpen, Camera, Eye, ArrowLeft, CheckSquare } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import AddBuildingModal from '../components/modals/AddBuildingModal';
import AddFloorModal from '../components/modals/AddFloorModal';
import EditBuildingModal from '../components/modals/EditBuildingModal';
import EditFloorModal from '../components/modals/EditFloorModal';
import EditRoomModal from '../components/modals/EditRoomModal';
import BulkEditRoomsModal from '../components/modals/BulkEditRoomsModal';
import PageSkeleton from '../components/SkeletonLoader';

const getRoomTypesSummary = (rooms = []) => {
  if (!rooms || !rooms.length) return '—';
  const counts = rooms.reduce((acc, r) => {
    const type = r.type || 'Lecture Room';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([type, count]) => `${type} (${count})`)
    .join(', ');
};

export default function BuildingManagement() {
  const navigate = useNavigate();
  const { buildingList, buildingsLoading, buildingsError, updateBuilding } = useApp();
  const { profile } = useAuth();
  const { canManageBuildings, canManageRoomMaintenance, canManageAssignedRooms, canSubmitReservation, roleLabel, isRegistrar, canEditRoom } = useRolePermissions();
  const { openReservation, modals } = useRoomReservationFlow();
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [showEditBuilding, setShowEditBuilding] = useState(false);
  const [editFloor, setEditFloor] = useState(null);
  const [editRoom, setEditRoom] = useState(null);
  const [expandedBuildings, setExpandedBuildings] = useState({});
  const [expandedFloors, setExpandedFloors] = useState({});

  const myAssignedRooms = useMemo(() => {
    if (!buildingList || !profile) return [];
    const uid = profile.uid || profile.id;
    const profileName = (profile.name || profile.displayName || '').toLowerCase();
    const assignedRoomIds = profile.assignedRoomIds || [];
    const assignedBuildingIds = (profile.assignedBuildingIds || []).map(String);

    const rooms = [];
    buildingList.forEach((b) => {
      const isBuildingAssigned = assignedBuildingIds.includes(String(b.id));
      (b.floorData || []).forEach((f) => {
        const isFloorAssigned =
          isBuildingAssigned ||
          (f.managedBy && (f.managedBy === uid || String(f.managedBy) === String(uid))) ||
          (f.managedByName && profileName && f.managedByName.toLowerCase() === profileName);

        (f.rooms || []).forEach((r) => {
          const roomId = r.docId || r.id || r.roomCode;
          const isRoomAssigned =
            isFloorAssigned ||
            assignedRoomIds.includes(roomId) ||
            (r.managedBy && (r.managedBy === uid || String(r.managedBy) === String(uid))) ||
            (r.managedByName && profileName && r.managedByName.toLowerCase() === profileName);

          if (isRoomAssigned) {
            rooms.push({
              ...r,
              buildingId: b.id,
              buildingName: b.name,
              floor: f.floor,
              floorId: f.floorId,
              floorLabel: f.label || `Floor ${f.floor}`,
            });
          }
        });
      });
    });
    return rooms;
  }, [buildingList, profile]);

  // Floor List Pagination State
  const [floorCurrentPage, setFloorCurrentPage] = useState(1);
  const [floorItemsPerPage, setFloorItemsPerPage] = useState(5);

  // Room Table Pagination State
  const [roomCurrentPage, setRoomCurrentPage] = useState(1);
  const [roomItemsPerPage, setRoomItemsPerPage] = useState(10);

  // Room Multi-Selection & Bulk Edit State
  const [selectedRoomDocIds, setSelectedRoomDocIds] = useState([]);
  const [showBulkEditRooms, setShowBulkEditRooms] = useState(false);

  const toggleBuildingExpand = (bId, e) => {
    if (e) e.stopPropagation();
    setExpandedBuildings((prev) => ({ ...prev, [bId]: !prev[bId] }));
  };

  const toggleFloorExpand = (fKey, e) => {
    if (e) e.stopPropagation();
    setExpandedFloors((prev) => ({ ...prev, [fKey]: !prev[fKey] }));
  };

  // Sync selectedBuilding with real-time updates from buildingList so edits show instantly without refresh!
  useEffect(() => {
    if (!buildingList.length) {
      setSelectedBuilding(null);
      return;
    }
    if (selectedBuilding) {
      const freshBuilding = buildingList.find((b) => b.id === selectedBuilding.id);
      if (freshBuilding) {
        setSelectedBuilding(freshBuilding);
      } else {
        setSelectedBuilding(buildingList[0]);
        setSelectedFloor('all');
      }
    } else {
      setSelectedBuilding(buildingList[0]);
      setSelectedFloor('all');
    }
  }, [buildingList]);

  useEffect(() => {
    setFloorCurrentPage(1);
    setRoomCurrentPage(1);
    setSelectedRoomDocIds([]);
  }, [selectedBuilding?.id, selectedFloor]);

  const building = selectedBuilding;
  const floorData = building?.floorData || [];
  const totalFloorsCount = floorData.length;
  const totalFloorPages = Math.max(1, Math.ceil(totalFloorsCount / floorItemsPerPage));
  const floorStartIndex = totalFloorsCount === 0 ? 0 : (floorCurrentPage - 1) * floorItemsPerPage + 1;
  const floorEndIndex = Math.min(floorCurrentPage * floorItemsPerPage, totalFloorsCount);

  const paginatedFloors = useMemo(() => {
    const start = (floorCurrentPage - 1) * floorItemsPerPage;
    return floorData.slice(start, start + floorItemsPerPage);
  }, [floorData, floorCurrentPage, floorItemsPerPage]);

  const allRooms =
    building?.floorData?.flatMap((f) => f.rooms.map((r) => ({ ...r, floor: f.floor, floorId: f.floorId, floorLabel: f.label }))) || [];

  const displayedRooms = selectedFloor === 'all'
    ? allRooms
    : allRooms.filter((r) => r.floor === selectedFloor);

  const totalRoomCount = displayedRooms.length;
  const totalRoomPages = Math.max(1, Math.ceil(totalRoomCount / roomItemsPerPage));
  const roomStartIndex = totalRoomCount === 0 ? 0 : (roomCurrentPage - 1) * roomItemsPerPage + 1;
  const roomEndIndex = Math.min(roomCurrentPage * roomItemsPerPage, totalRoomCount);

  const paginatedRooms = useMemo(() => {
    const start = (roomCurrentPage - 1) * roomItemsPerPage;
    return displayedRooms.slice(start, start + roomItemsPerPage);
  }, [displayedRooms, roomCurrentPage, roomItemsPerPage]);

  const allFloorRoomDocIds = useMemo(() => {
    return displayedRooms.map((r) => r.docId || r.id);
  }, [displayedRooms]);

  const isAllRoomsSelected =
    allFloorRoomDocIds.length > 0 &&
    allFloorRoomDocIds.every((id) => selectedRoomDocIds.includes(id));

  const toggleSelectAllRooms = () => {
    if (isAllRoomsSelected) {
      setSelectedRoomDocIds([]);
    } else {
      setSelectedRoomDocIds(allFloorRoomDocIds);
    }
  };

  const toggleSelectRoom = (docId) => {
    setSelectedRoomDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const selectedRoomsObjects = useMemo(() => {
    return displayedRooms.filter((r) => selectedRoomDocIds.includes(r.docId || r.id));
  }, [displayedRooms, selectedRoomDocIds]);

  return (
    <Layout
      title={canManageBuildings() ? 'Building & Room Management' : 'Buildings & Rooms'}
      subtitle={canManageRoomMaintenance() ? `${roleLabel} — manage room maintenance and view schedules` : canManageAssignedRooms() ? `${roleLabel} — manage assigned classrooms` : 'View buildings and room information'}
    >
      <div className="flex justify-end gap-2 mb-5">
        {canManageBuildings() && (
          <button type="button" className="btn-maroon font-bold" onClick={() => setShowAddBuilding(true)}>
            <Plus size={16} /> Add Building
          </button>
        )}
      </div>

      {buildingsError && (
        <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
          {buildingsError}
        </p>
      )}

      {buildingsLoading && buildingList.length === 0 ? (
        <PageSkeleton />
      ) : buildingList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <p className="text-sm text-gray-500 mb-4">No buildings yet. Add your first building to get started.</p>
          {canManageBuildings() && (
            <button type="button" className="btn-maroon" onClick={() => setShowAddBuilding(true)}>
              <Plus size={16} /> Add Building
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5 items-start">
          {/* Left Sidebar Building & Floor Tree List */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] font-bold tracking-widest uppercase text-gray-400">BUILDINGS</span>
              {canManageBuildings() && (
                <button
                  type="button"
                  onClick={() => setShowAddBuilding(true)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-[#2B3235] hover:text-[#7A0808] transition-colors"
                  title="Add Building"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            <div className="space-y-1">
              {buildingList.map((b) => {
                const isSelected = selectedBuilding?.id === b.id;
                const isExpanded = Boolean(expandedBuildings[b.id]);

                return (
                  <div key={b.id} className="space-y-1">
                    {/* Building Row */}
                    <div
                      onClick={() => {
                        setSelectedBuilding(b);
                        setSelectedFloor('all');
                        toggleBuildingExpand(b.id);
                      }}
                      className={`w-full flex items-center gap-1.5 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-red-50/80 text-[#7A0808] font-bold border border-red-100 shadow-2xs'
                          : 'text-[#2B3235] hover:bg-gray-50 font-medium'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={(e) => toggleBuildingExpand(b.id, e)}
                        className="p-0.5 rounded hover:bg-gray-200/50 flex-shrink-0 text-gray-400 hover:text-[#7A0808]"
                      >
                        {isExpanded ? <ChevronDown size={14} className="text-[#7A0808]" /> : <ChevronRight size={14} />}
                      </button>
                      <Building2 size={15} className={`flex-shrink-0 ${isSelected ? 'text-[#7A0808]' : 'text-gray-500'}`} />
                      <span className="text-xs truncate flex-1">{b.name}</span>
                    </div>

                    {/* Expanded Floors List */}
                    {isExpanded && b.floorData?.map((floorObj) => {
                      const floorKey = `${b.id}-${floorObj.floor}`;
                      const isFloorSelected = isSelected && selectedFloor === floorObj.floor;

                      return (
                        <div key={floorKey} className="ml-3 pl-2 border-l border-gray-100 space-y-1">
                          {/* Floor Row */}
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBuilding(b);
                              setSelectedFloor(floorObj.floor);
                            }}
                            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer text-xs font-semibold transition-colors ${
                              isFloorSelected
                                ? 'bg-red-50 text-[#7A0808] font-bold'
                                : 'text-gray-600 hover:bg-gray-100/70 hover:text-[#7A0808]'
                            }`}
                          >
                            <Layers size={12} className={isFloorSelected ? 'text-[#7A0808]' : 'text-gray-400'} />
                            <span className="flex-1 truncate">{floorObj.label || `Floor ${floorObj.floor}`}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${isFloorSelected ? 'bg-[#7A0808] text-white' : 'text-gray-400 bg-gray-100'}`}>
                              {floorObj.rooms?.length || 0}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Assigned Rooms & Floors Section */}
            {myAssignedRooms.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
                <div className="px-1 flex items-center justify-between">
                  <span className="text-[11px] font-bold tracking-widest uppercase text-[#7A0808]">ASSIGNED ROOMS</span>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-100 text-[#7A0808]">
                    {myAssignedRooms.length}
                  </span>
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {myAssignedRooms.map((item) => (
                    <div
                      key={item.docId || item.id}
                      onClick={() => {
                        const b = buildingList.find((bld) => String(bld.id) === String(item.buildingId));
                        if (b) {
                          setSelectedBuilding(b);
                          setSelectedFloor(item.floor || 'all');
                          setExpandedBuildings((prev) => ({ ...prev, [b.id]: true }));
                        }
                      }}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer text-xs font-bold transition-all ${
                        selectedBuilding?.id === item.buildingId && (selectedFloor === item.floor || selectedFloor === 'all')
                          ? 'bg-red-50 text-[#7A0808] border border-red-200 shadow-2xs'
                          : 'bg-gray-50/80 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <DoorOpen size={14} className="text-[#7A0808] flex-shrink-0" />
                      <div className="truncate flex-1">
                        <span className="block truncate font-extrabold text-gray-900">{item.name || item.id}</span>
                        <span className="block text-[10px] font-semibold text-gray-400 truncate">
                          {item.buildingName} · {item.floorLabel || `Floor ${item.floor}`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Main Building & Floor Details */}
          {building && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-4 pb-5 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <div
                    className={`relative group flex-shrink-0 ${canManageBuildings() ? 'cursor-pointer' : ''}`}
                    onClick={() => canManageBuildings() && setShowEditBuilding(true)}
                    title={canManageBuildings() ? 'Click to edit building photo & details' : ''}
                  >
                    {building.image ? (
                      <img src={building.image} alt={building.name} className="w-16 h-16 rounded-2xl object-cover border border-gray-200 shadow-sm" />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-[#7A0808]">
                        <Building2 size={28} />
                      </div>
                    )}
                    {canManageBuildings() && (
                      <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <Camera size={18} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-[#2B3235]">{building.name}</h2>
                      <span className="px-2.5 py-0.5 rounded-md bg-red-50 text-[#7A0808] font-black text-xs border border-red-100">
                        {building.prefix || building.code || 'BLD'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {totalFloorsCount} Floor(s) • {allRooms.length} Total Room(s)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isRegistrar && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowEditBuilding(true)}
                        className="btn-outline-maroon text-xs px-3 py-2 font-bold"
                      >
                        <Edit2 size={14} /> Edit Building
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddFloor(true)}
                        className="btn-maroon text-xs px-3 py-2 font-bold"
                      >
                        <Plus size={14} /> Add Floor
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Floors Overview Table */}
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-bold text-sm text-[#2B3235] flex items-center gap-2">
                    <Layers size={16} className="text-[#7A0808]" /> Floors Overview
                  </h3>
                </div>

                {/* Multi-Selection Bulk Edit Action Bar */}
                {isRegistrar && selectedRoomDocIds.length > 0 && (
                  <div className="bg-[#7A0808] text-white px-4 py-3 rounded-2xl flex items-center justify-between shadow-lg animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <CheckSquare size={16} />
                      <span>{selectedRoomDocIds.length} room(s) selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowBulkEditRooms(true)}
                        className="px-3.5 py-1.5 bg-white text-[#7A0808] rounded-xl text-xs font-black hover:bg-gray-100 transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        <Edit2 size={14} /> Bulk Edit Rooms
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRoomDocIds([])}
                        className="px-3 py-1.5 bg-black/20 hover:bg-black/30 text-white rounded-xl text-xs font-bold transition-colors"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>
                )}

                {/* Rooms Grid Table */}
                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 uppercase tracking-wider text-[10px]">
                      <tr>
                        {canManageBuildings() && (
                          <th className="p-3 w-10 text-center">
                            <input
                              type="checkbox"
                              checked={isAllRoomsSelected}
                              onChange={toggleSelectAllRooms}
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              title="Select all rooms on this floor"
                            />
                          </th>
                        )}
                        <th className="p-3">Room / Number</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Capacity</th>
                        <th className="p-3">Equipment / Facilities</th>
                        <th className="p-3">Manager</th>
                        <th className="p-3 text-center w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-medium">
                      {displayedRooms.length === 0 ? (
                        <tr>
                          <td colSpan={canManageBuildings() ? 7 : 6} className="p-8 text-center text-gray-400 italic">
                            No rooms found for this selection.
                          </td>
                        </tr>
                      ) : (
                        paginatedRooms.map((rm) => {
                          const docId = rm.docId || rm.id;
                          const isSelected = selectedRoomDocIds.includes(docId);

                          return (
                            <tr key={docId} className={`hover:bg-red-50/30 transition-colors ${isSelected ? 'bg-red-50/50' : ''}`}>
                              {canManageBuildings() && (
                                <td className="p-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelectRoom(docId)}
                                    className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                                  />
                                </td>
                              )}
                              <td className="p-3 font-bold text-[#2B3235]">{rm.id || rm.name}</td>
                              <td className="p-3 font-semibold text-gray-700">{rm.type || 'Classroom'}</td>
                              <td className="p-3 font-bold text-gray-800">{rm.capacity || '—'} pax</td>
                              <td className="p-3">
                                {rm.equipment && rm.equipment.length > 0 ? (
                                  <div className="flex flex-wrap gap-1 max-w-xs">
                                    {rm.equipment.map((eq, eIdx) => (
                                      <span key={eIdx} className="px-2 py-0.5 bg-gray-100 text-gray-700 font-medium text-[10px] rounded-md border border-gray-200">
                                        {eq}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-gray-400 italic">None</span>
                                )}
                              </td>
                              <td className="p-3 font-semibold text-gray-700">
                                {rm.managedByName || (rm.managedBy ? 'Assigned' : 'Registrar')}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigate(`/room/${rm.id || rm.name}`, {
                                        state: {
                                          room: rm,
                                          buildingId: building.id,
                                          buildingName: building.name,
                                          floor: rm.floor,
                                          floorId: rm.floorId,
                                        },
                                      })
                                    }
                                    className="p-1.5 text-gray-500 hover:text-[#7A0808] hover:bg-red-50 rounded-lg transition-colors"
                                    title="View Room Details & Schedule"
                                  >
                                    <Eye size={15} />
                                  </button>
                                  {canEditRoom(rm) && (
                                    <button
                                      type="button"
                                      onClick={() => setEditRoom(rm)}
                                      className="p-1.5 text-gray-500 hover:text-[#7A0808] hover:bg-red-50 rounded-lg transition-colors"
                                      title="Edit Room"
                                    >
                                      <Edit2 size={15} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>

                  {/* Room Table Pagination Footer */}
                  {displayedRooms.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50/60 border-t border-gray-100 flex-wrap gap-3">
                      <div className="text-xs font-semibold text-gray-500">
                        Showing <span className="font-bold text-gray-800">{roomStartIndex}</span> to{' '}
                        <span className="font-bold text-gray-800">{roomEndIndex}</span> of{' '}
                        <span className="font-bold text-gray-800">{totalRoomCount}</span> rooms
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <span>Show</span>
                          <select
                            value={roomItemsPerPage}
                            onChange={(e) => {
                              setRoomItemsPerPage(Number(e.target.value));
                              setRoomCurrentPage(1);
                            }}
                            className="form-input text-xs py-1 px-2.5 rounded-xl border-gray-200 bg-white font-bold cursor-pointer"
                          >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                          </select>
                          <span>per page</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setRoomCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={roomCurrentPage === 1}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 shadow-2xs"
                            title="Previous Page"
                          >
                            <ChevronLeft size={15} />
                          </button>

                          <span className="text-xs font-bold px-2 text-gray-700">
                            Page {roomCurrentPage} of {totalRoomPages}
                          </span>

                          <button
                            type="button"
                            onClick={() => setRoomCurrentPage((p) => Math.min(totalRoomPages, p + 1))}
                            disabled={roomCurrentPage === totalRoomPages || totalRoomPages === 0}
                            className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-gray-600 shadow-2xs"
                            title="Next Page"
                          >
                            <ChevronRight size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddBuilding && (
        <AddBuildingModal onClose={() => setShowAddBuilding(false)} />
      )}
      {showAddFloor && building && (
        <AddFloorModal
          buildingId={building.id}
          existingFloors={building.floorData || []}
          onClose={() => setShowAddFloor(false)}
        />
      )}
      {showEditBuilding && building && (
        <EditBuildingModal
          building={building}
          onClose={() => setShowEditBuilding(false)}
          onSave={updateBuilding}
        />
      )}
      {editFloor && building && (
        <EditFloorModal
          buildingId={building.id}
          floor={editFloor}
          onClose={() => setEditFloor(null)}
        />
      )}
      {editRoom && building && (
        <EditRoomModal
          room={editRoom}
          buildingId={building.id}
          floorId={editRoom.floorId || building.floorData?.find((f) => f.floor === editRoom.floor)?.floorId}
          floorManagedBy={building.floorData?.find((f) => f.floor === editRoom.floor)?.managedBy}
          onClose={() => setEditRoom(null)}
        />
      )}
      {showBulkEditRooms && building && (
        <BulkEditRoomsModal
          selectedRooms={selectedRoomsObjects}
          buildingId={building.id}
          floorId={displayedRooms[0]?.floorId || building.floorData[0]?.floorId}
          onClose={(updated) => {
            setShowBulkEditRooms(false);
            if (updated) setSelectedRoomDocIds([]);
          }}
        />
      )}
    </Layout>
  );
}
