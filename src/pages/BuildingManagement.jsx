import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Building2, Calendar, ChevronRight, ChevronLeft, ChevronDown, Layers, DoorOpen, Camera, Eye, ArrowLeft, CheckSquare } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import AddBuildingModal from '../components/modals/AddBuildingModal';
import AddFloorModal from '../components/modals/AddFloorModal';
import EditBuildingModal from '../components/modals/EditBuildingModal';
import EditFloorModal from '../components/modals/EditFloorModal';
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
  const { canManageBuildings, canManageRoomMaintenance, canManageAssignedRooms, canSubmitReservation, roleLabel } = useRolePermissions();
  const { openReservation, modals } = useRoomReservationFlow();
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [showAddBuilding, setShowAddBuilding] = useState(false);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [showEditBuilding, setShowEditBuilding] = useState(false);
  const [editFloor, setEditFloor] = useState(null);
  const [expandedBuildings, setExpandedBuildings] = useState({});
  const [expandedFloors, setExpandedFloors] = useState({});

  // Floor List Pagination State
  const [floorCurrentPage, setFloorCurrentPage] = useState(1);
  const [floorItemsPerPage, setFloorItemsPerPage] = useState(5);

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

  useEffect(() => {
    if (!buildingList.length) {
      setSelectedBuilding(null);
      return;
    }
    const stillExists = selectedBuilding && buildingList.some((b) => b.id === selectedBuilding.id);
    if (!stillExists) {
      setSelectedBuilding(buildingList[0]);
      setSelectedFloor('all');
    }
  }, [buildingList, selectedBuilding]);

  useEffect(() => {
    setFloorCurrentPage(1);
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
    building?.floorData?.flatMap((f) => f.rooms.map((r) => ({ ...r, floor: f.floor, floorLabel: f.label }))) || [];

  const displayedRooms = selectedFloor === 'all'
    ? allRooms
    : allRooms.filter((r) => r.floor === selectedFloor);

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
          <button type="button" className="btn-maroon" onClick={() => setShowAddBuilding(true)}>
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
                      <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <Camera size={18} />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-black text-xl text-dark">{building.name}</h2>
                      {(building.prefix || building.code) && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                          Prefix: {building.prefix || building.code}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500 font-medium">
                      <span>Floors: {building.floors}</span>
                      <span>Total Rooms: {building.totalRooms ?? allRooms.length}</span>
                    </div>
                  </div>
                </div>

                {canManageBuildings() && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" className="btn-outline-maroon flex items-center gap-2" onClick={() => { setSelectedBuilding(building); setShowEditBuilding(true); }}>
                      <Edit2 size={14} /> Edit Building
                    </button>
                  </div>
                )}
              </div>

              {selectedFloor !== 'all' && (
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                  <button
                    type="button"
                    onClick={() => setSelectedFloor('all')}
                    className="flex items-center gap-1.5 text-xs font-bold text-[#7A0808] hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-red-100"
                  >
                    <ArrowLeft size={14} /> Back to All Floors ({building.name})
                  </button>
                  <span className="text-xs font-bold text-gray-500">
                    Rooms on {building.floorData?.find((f) => f.floor === selectedFloor)?.label || `Floor ${selectedFloor}`}
                  </span>
                </div>
              )}

              <div className="overflow-x-auto">
                {selectedFloor === 'all' ? (
                  <>
                    {/* Building Floor View: List of Floors */}
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {['Floor', 'Rooms', 'Room Types', 'Manager', 'Actions'].map((h) => (
                            <th key={h} className="text-left text-[10px] font-black uppercase tracking-wider text-gray-400 py-3 pr-4">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {!building.floorData?.length ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                              No floors added yet. Edit building to add floors.
                            </td>
                          </tr>
                        ) : (
                          paginatedFloors.map((floorObj) => (
                            <tr key={floorObj.floorId || floorObj.floor} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                              <td className="py-3 pr-4 text-sm font-bold text-dark flex items-center gap-2">
                                <Layers size={15} className="text-[#7A0808]" />
                                <span>{floorObj.label || `Floor ${floorObj.floor}`}</span>
                              </td>
                              <td className="py-3 pr-4 text-sm text-gray-600 font-semibold">
                                {floorObj.rooms?.length || 0} {floorObj.rooms?.length === 1 ? 'room' : 'rooms'}
                              </td>
                              <td className="py-3 pr-4 text-xs text-gray-600">
                                {getRoomTypesSummary(floorObj.rooms)}
                              </td>
                              <td className="py-3 pr-4 text-sm text-gray-600 font-medium">
                                {floorObj.managedByName || 'Registrar'}
                              </td>
                              <td className="py-3 pr-4">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedFloor(floorObj.floor)}
                                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                    style={{ color: '#7A0808' }}
                                    title="View floor rooms"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  {canManageBuildings() && (
                                    <button
                                      type="button"
                                      onClick={() => setEditFloor(floorObj)}
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                      style={{ color: '#7A0808' }}
                                      title="Edit floor details and manager"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>

                    {totalFloorsCount > 0 && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t border-gray-100 text-xs text-gray-500 font-medium">
                        <div>
                          Showing <span className="font-bold text-gray-700">{floorStartIndex}</span> to{' '}
                          <span className="font-bold text-gray-700">{floorEndIndex}</span> of{' '}
                          <span className="font-bold text-gray-700">{totalFloorsCount}</span> floors
                        </div>

                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span>Floors per page:</span>
                            <select
                              value={floorItemsPerPage}
                              onChange={(e) => {
                                setFloorItemsPerPage(Number(e.target.value));
                                setFloorCurrentPage(1);
                              }}
                              className="border border-gray-200 rounded-lg px-2 py-1 bg-white font-bold text-gray-700 focus:outline-none focus:border-[#7A0808]"
                            >
                              <option value={5}>5</option>
                              <option value={10}>10</option>
                              <option value={20}>20</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setFloorCurrentPage((p) => Math.max(1, p - 1))}
                              disabled={floorCurrentPage === 1}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
                            >
                              <ChevronLeft size={14} /> Prev
                            </button>
                            <span className="px-2 font-bold text-gray-700">
                              Page {floorCurrentPage} of {totalFloorPages}
                            </span>
                            <button
                              type="button"
                              onClick={() => setFloorCurrentPage((p) => Math.min(totalFloorPages, p + 1))}
                              disabled={floorCurrentPage >= totalFloorPages}
                              className="px-2.5 py-1 rounded-lg border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
                            >
                              Next <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Specific Floor View: List of Rooms on this Floor */
                  <>
                    {selectedRoomDocIds.length > 0 && (
                      <div className="flex items-center justify-between bg-red-50/90 border border-red-200 rounded-xl px-4 py-2.5 mb-3 shadow-2xs">
                        <div className="flex items-center gap-2">
                          <CheckSquare size={16} className="text-[#7A0808]" />
                          <span className="text-xs font-bold text-[#7A0808]">
                            {selectedRoomDocIds.length} room(s) selected
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedRoomDocIds([])}
                            className="text-[11px] font-semibold text-gray-500 hover:text-gray-700 underline ml-2"
                          >
                            Clear selection
                          </button>
                        </div>

                        {(canManageBuildings() || canManageAssignedRooms()) && (
                          <button
                            type="button"
                            onClick={() => setShowBulkEditRooms(true)}
                            className="btn-maroon text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm"
                          >
                            <Edit2 size={13} /> Bulk Edit Rooms
                          </button>
                        )}
                      </div>
                    )}

                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="w-10 py-3 pr-2 text-center">
                            <input
                              type="checkbox"
                              checked={isAllRoomsSelected}
                              onChange={toggleSelectAllRooms}
                              className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                              title="Select all rooms"
                            />
                          </th>
                          {['Room', 'Capacity', 'Facilities / Equipment', 'Actions'].map((h) => (
                            <th key={h} className="text-left text-[10px] font-black uppercase tracking-wider text-gray-400 py-3 pr-4">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRooms.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                              No rooms found on this floor.
                            </td>
                          </tr>
                        ) : (
                          displayedRooms.map((room) => {
                            const floorObj = building.floorData.find((f) => f.floor === room.floor);
                            const rId = room.docId || room.id;
                            const isChecked = selectedRoomDocIds.includes(rId);

                            return (
                              <tr
                                key={rId}
                                className={`border-b border-gray-50 hover:bg-gray-50/60 transition-colors ${
                                  isChecked ? 'bg-red-50/30' : ''
                                }`}
                              >
                                <td className="w-10 py-3 pr-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSelectRoom(rId)}
                                    className="rounded border-gray-300 text-[#7A0808] focus:ring-[#7A0808] cursor-pointer"
                                  />
                                </td>
                                <td className="py-3 pr-4 text-sm font-bold text-dark">{room.id}</td>
                                <td className="py-3 pr-4 text-sm text-gray-600">{room.capacity}</td>
                                <td className="py-3 pr-4">
                                  <div className="text-xs text-gray-600">
                                    {room.equipment?.length > 0 ? (
                                      room.equipment.slice(0, 3).join(', ')
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 pr-4">
                                  <div className="flex gap-2">
                                    {canSubmitReservation() && (
                                      <button
                                        type="button"
                                        onClick={() => openReservation({
                                          building: building.name,
                                          buildingId: building.id,
                                          room: room.id,
                                          roomDocId: room.docId,
                                          floor: room.floor,
                                          floorId: floorObj?.floorId,
                                          designatedVenue: `${room.id}, ${building.name} Floor ${room.floor}`,
                                        })}
                                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                        style={{ color: '#7A0808' }}
                                        title="Reserve room"
                                      >
                                        <Calendar size={14} />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        navigate(`/room/${room.id}`, {
                                          state: {
                                            room,
                                            buildingId: building.id,
                                            buildingName: building.name,
                                            floor: room.floor,
                                            floorId: floorObj?.floorId,
                                          },
                                        })
                                      }
                                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                                      style={{ color: '#7A0808' }}
                                      title="View room details"
                                    >
                                      <Eye size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </div>

              {canManageBuildings() && (
                <button
                  type="button"
                  onClick={() => navigate(`/building/${building.id}`)}
                  className="w-full mt-5 py-3 rounded-xl font-bold text-sm transition-all"
                  style={{ background: '#7A0808', color: 'white' }}
                >
                  Manage floors & rooms
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {modals}

      {canManageBuildings() && showAddBuilding && <AddBuildingModal onClose={() => setShowAddBuilding(false)} />}
      {canManageBuildings() && showAddFloor && building && (
        <AddFloorModal
          buildingId={building.id}
          buildingName={building.name}
          onClose={() => setShowAddFloor(false)}
        />
      )}
      {canManageBuildings() && showEditBuilding && building && (
        <EditBuildingModal
          building={building}
          onClose={() => setShowEditBuilding(false)}
          onSave={updateBuilding}
        />
      )}
      {canManageBuildings() && editFloor && building && (
        <EditFloorModal
          buildingId={building.id}
          floor={editFloor}
          onClose={() => setEditFloor(null)}
        />
      )}
      {showBulkEditRooms && building && (
        <BulkEditRoomsModal
          selectedRooms={selectedRoomsObjects}
          buildingId={building.id}
          floorId={building.floorData?.find((f) => f.floor === selectedFloor)?.floorId}
          onClose={() => {
            setShowBulkEditRooms(false);
            setSelectedRoomDocIds([]);
          }}
        />
      )}
    </Layout>
  );
}
