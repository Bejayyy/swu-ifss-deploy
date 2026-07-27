import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Edit2, Building2, DoorOpen, Users, CheckSquare, Calendar } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useRolePermissions } from '../hooks/useRolePermissions';
import { useRoomReservationFlow } from '../hooks/useRoomReservationFlow';
import AddRoomModal from '../components/modals/AddRoomModal';
import AddFloorModal from '../components/modals/AddFloorModal';
import EditBuildingModal from '../components/modals/EditBuildingModal';
import EditRoomModal from '../components/modals/EditRoomModal';
import EditFloorModal from '../components/modals/EditFloorModal';
import { buildingSchedulesById } from '../data/mockSchedules';

const statusBadge = { Available: 'badge-available', Occupied: 'badge-occupied', Maintenance: 'badge-maintenance' };

export default function BuildingDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { buildingList, buildingsLoading, updateBuilding, currentUser } = useApp();
  const { canManageBuildings, canEditRoom, canSubmitReservation, isRegistrar } = useRolePermissions();
  const { openReservation, modals } = useRoomReservationFlow();
  const canManageBuilding = canManageBuildings();
  const building = buildingList.find((b) => String(b.id) === String(id));

  const [activeFloor, setActiveFloor] = useState(null);
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddFloor, setShowAddFloor] = useState(false);
  const [showEditBuilding, setShowEditBuilding] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [editFloor, setEditFloor] = useState(null);

  useEffect(() => {
    if (building?.floorData?.length) {
      const exists = building.floorData.some((f) => f.floor === activeFloor);
      if (!exists) setActiveFloor(building.floorData[0].floor);
    } else {
      setActiveFloor(null);
    }
  }, [building, activeFloor]);

  if (buildingsLoading && !building) {
    return (
      <Layout title="Building" subtitle="Loading…">
        <p className="text-sm text-gray-500 py-12 text-center">Loading building data…</p>
      </Layout>
    );
  }

  if (!building) {
    return (
      <Layout title="Building not found">
        <button type="button" className="btn-maroon mt-4" onClick={() => navigate('/building-management')}>
          Back to Building Management
        </button>
      </Layout>
    );
  }

  const floorEntry = building.floorData.find((f) => f.floor === activeFloor) || { rooms: [], floorId: null };
  const floorData = floorEntry;
  const allRooms = building.floorData.flatMap((f) => f.rooms);
  const availableNow = allRooms.filter((r) => r.status === 'Available').length;

  const floorStats = {
    total: floorData.rooms.length,
    available: floorData.rooms.filter((r) => r.status === 'Available').length,
    occupied: floorData.rooms.filter((r) => r.status === 'Occupied').length,
    capacity: floorData.rooms.reduce((a, r) => a + (r.capacity || 0), 0),
  };

  const roomTypes = floorData.rooms.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <Layout title={building.name} subtitle="Building management and room overview">
      <div className="flex items-center justify-between mb-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm font-bold"
          style={{ color: '#2B3235' }}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 hover:bg-gray-100 transition-colors">
            <ArrowLeft size={16} />
          </div>
          Back
        </button>
        <div className="flex gap-2 flex-wrap justify-end">
          {canManageBuilding && <button type="button" className="btn-outline-maroon flex items-center gap-2" style={{ borderRadius: 10 }} onClick={() => setShowAddFloor(true)}>
            <Plus size={14} /> Add Floor
          </button>}
          {canManageBuilding && <button type="button" className="btn-outline-maroon flex items-center gap-2" style={{ borderRadius: 10 }} onClick={() => setShowEditBuilding(true)}>
            <Edit2 size={14} /> Edit Building
          </button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Floors', value: building.floors, icon: Building2 },
          { label: 'Total Rooms', value: building.totalRooms || allRooms.length, icon: DoorOpen },
          { label: 'Total Capacity', value: allRooms.reduce((a, r) => a + (r.capacity || 0), 0), icon: Users },
          { label: 'Available Now', value: availableNow, icon: CheckSquare },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="stat-card">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#2B3235', opacity: 0.55 }}>{label}</p>
              <p className="text-3xl font-black" style={{ color: '#2B3235' }}>{value}</p>
            </div>
            <div className="stat-icon-box"><Icon size={18} /></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h2 className="font-bold text-base mb-4" style={{ color: '#2B3235' }}>Rooms by Floor</h2>

        {building.floorData.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-500 mb-3">No floors yet. Add a floor to start adding rooms.</p>
            {canManageBuilding && <button type="button" className="btn-maroon text-sm" onClick={() => setShowAddFloor(true)}>Add Floor</button>}
          </div>
        ) : (
          <>
            <div className="inline-flex w-fit flex-wrap items-center p-1 gap-1 mb-6 shadow-sm max-w-full" style={{ background: '#F9FAFB', borderRadius: 10 }}>
              {building.floorData.map((f) => (
                <button
                  key={f.floorId || f.floor}
                  type="button"
                  onClick={() => setActiveFloor(f.floor)}
                  className="px-5 py-2 text-sm font-bold transition-all"
                  style={
                    activeFloor === f.floor
                      ? { background: '#800000', color: 'white', borderRadius: 10 }
                      : { background: 'transparent', color: '#2B3235', borderRadius: 10 }
                  }
                >
                  {f.label || `Floor ${f.floor}`}
                </button>
              ))}
            </div>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-bold text-sm" style={{ color: '#2B3235' }}>
                  {floorEntry.label || `Floor ${activeFloor}`} Overview
                </h3>
                {(canManageBuilding || canManageAssignedRooms() || isRegistrar) && (
                  <button
                    type="button"
                    onClick={() => setEditFloor(floorEntry)}
                    className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-500 flex items-center gap-1.5 text-xs font-semibold"
                    title="Edit floor"
                  >
                    <Edit2 size={14} /> Edit Floor
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Total Rooms', value: floorStats.total, color: '#2B3235' },
                  { label: 'Available', value: floorStats.available, color: '#059669' },
                  { label: 'Occupied', value: floorStats.occupied, color: '#DC2626' },
                  { label: 'Total Capacity', value: floorStats.capacity, color: '#2563EB' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="border border-gray-100 rounded-xl p-4 text-center">
                    <p className="text-2xl font-black mb-1" style={{ color }}>{value}</p>
                    <p className="text-xs font-semibold text-gray-400">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <h3 className="font-bold text-sm mb-4" style={{ color: '#2B3235' }}>Room Details</h3>
            {floorData.rooms.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">
                No rooms on this floor yet.
                {canManageBuilding && <button type="button" onClick={() => setShowAddRoom(true)} className="block mx-auto mt-3 btn-maroon text-xs">
                  Add Room
                </button>}
              </div>
            ) : (
              <div className="space-y-3">
                {floorData.rooms.map((room) => {
                  const isUnderMaintenance = room.maintenanceStatus === 'under-maintenance';
                  
                  return (
                  <div 
                    key={room.docId || room.id} 
                    className={`border border-gray-100 rounded-xl p-5 transition-all ${
                      isUnderMaintenance 
                        ? 'bg-gray-50 opacity-60' 
                        : 'hover:shadow-sm'
                    }`}
                    style={isUnderMaintenance ? { filter: 'blur(0.5px)' } : {}}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h4 className="font-black text-base text-dark">{room.id || room.name}</h4>
                          {isUnderMaintenance ? (
                            <span className="badge-maintenance">Under Maintenance</span>
                          ) : (
                            <span className={statusBadge[room.status] || 'badge-available'}>{room.status}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mb-2">{room.type}</p>
                        <p className="text-xs text-gray-500">Capacity: {room.capacity}</p>
                        {isUnderMaintenance && room.maintenanceEndDate && (
                          <p className="text-[11px] font-bold text-orange-600 mt-2">
                            Maintenance until {room.maintenanceEndDate}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0 flex-wrap">
                        {canSubmitReservation() && !isUnderMaintenance && (
                          <button
                            type="button"
                            onClick={() => openReservation({
                              building: building.name,
                              buildingId: building.id,
                              room: room.id,
                              roomDocId: room.docId,
                              floor: activeFloor,
                              floorId: floorEntry.floorId,
                              designatedVenue: `${room.id}, ${building.name} Floor ${activeFloor}`,
                            })}
                            className="btn-outline-maroon text-xs py-1.5 px-4"
                          >
                            Reserve
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
                                floor: activeFloor,
                                floorId: floorEntry.floorId,
                              },
                            })
                          }
                          className="btn-maroon text-xs py-1.5 px-4"
                        >
                          View
                        </button>
                        {(canManageBuilding || canManageAssignedRooms() || canEditRoom(room) || isRegistrar) && (
                          <button
                            type="button"
                            onClick={() => setEditRoom(room)}
                            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-500 flex items-center gap-1 text-xs font-semibold"
                            title="Edit room details and manager"
                          >
                            <Edit2 size={14} /> Edit Room
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}

            {(canManageBuilding || canManageAssignedRooms() || isRegistrar) && (
              <button
                type="button"
                onClick={() => setShowAddRoom(true)}
                disabled={!floorEntry.floorId}
                className="w-full mt-5 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border-2 border-dashed disabled:opacity-50"
                style={{ borderColor: '#7A0808', color: '#7A0808' }}
              >
                <Plus size={16} /> Add Room to this floor
              </button>
            )}
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-6">
        <h2 className="font-bold text-base mb-1" style={{ color: '#2B3235' }}>Schedules in this building</h2>
        <p className="text-xs font-medium mb-4" style={{ color: '#2B3235', opacity: 0.65 }}>
          Sample schedule data (linked when building ID matches seed data)
        </p>
        {(buildingSchedulesById[building.id] || []).length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: '#2B3235', opacity: 0.55 }}>No schedule rows for this building yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-3 px-3 font-bold text-xs uppercase">Room</th>
                  <th className="text-left py-3 px-3 font-bold text-xs uppercase">Course</th>
                  <th className="text-left py-3 px-3 font-bold text-xs uppercase">Day</th>
                  <th className="text-left py-3 px-3 font-bold text-xs uppercase">Time</th>
                </tr>
              </thead>
              <tbody>
                {(buildingSchedulesById[building.id] || []).map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="py-2.5 px-3 font-black">{row.room}</td>
                    <td className="py-2.5 px-3">{row.course}</td>
                    <td className="py-2.5 px-3">{row.day}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">{row.start}–{row.end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modals}

      {(canManageBuilding || canManageAssignedRooms() || isRegistrar) && showAddRoom && floorEntry.floorId && (
        <AddRoomModal
          buildingId={building.id}
          buildingPrefix={building.prefix || building.code}
          floorId={floorEntry.floorId}
          floor={activeFloor}
          floorManagedBy={floorEntry.managedBy}
          existingRoomsCount={floorData.rooms.length}
          onClose={() => setShowAddRoom(false)}
        />
      )}
      {(canManageBuilding || canManageAssignedRooms() || isRegistrar) && showAddFloor && (
        <AddFloorModal
          buildingId={building.id}
          buildingName={building.name}
          onClose={() => setShowAddFloor(false)}
        />
      )}
      {(canManageBuilding || canManageAssignedRooms() || isRegistrar) && showEditBuilding && (
        <EditBuildingModal
          building={building}
          onClose={() => setShowEditBuilding(false)}
          onSave={updateBuilding}
        />
      )}
      {(canManageBuilding || canManageAssignedRooms() || isRegistrar) && editRoom && floorEntry.floorId && (
        <EditRoomModal
          room={editRoom}
          buildingId={building.id}
          floorId={floorEntry.floorId}
          floorManagedBy={floorEntry.managedBy}
          onClose={() => setEditRoom(null)}
        />
      )}
      {(canManageBuilding || canManageAssignedRooms() || isRegistrar) && editFloor && (
        <EditFloorModal
          buildingId={building.id}
          floor={editFloor}
          onClose={() => setEditFloor(null)}
        />
      )}
    </Layout>
  );
}
