import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Settings } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { ROLES } from '../firebase/constants';
import { StatusFilterRow, PillFilterRow } from '../components/FilterControls';
import RoomManagerSettingsModal from '../components/modals/RoomManagerSettingsModal';

const DAY_START = 7;
const DAY_END = 20;
const TOTAL = DAY_END - DAY_START;

function segmentsFor(roomId) {
  const map = {
    'ENG-101': [[9, 12], [14, 17]],
    'ENG-102': [[8, 10]],
    'ENG-201': [[10, 13]],
    'ENG-202': [],
  };
  return map[roomId] || [[9, 11]];
}

function TimelineBar({ segments }) {
  const parts = [];
  let cursor = DAY_START;
  const sorted = [...segments].sort((a, b) => a[0] - b[0]);
  sorted.forEach(([s, e]) => {
    if (s > cursor) {
      parts.push({ type: 'free', w: ((s - cursor) / TOTAL) * 100 });
    }
    parts.push({ type: 'occ', w: ((Math.min(e, DAY_END) - Math.max(s, DAY_START)) / TOTAL) * 100 });
    cursor = Math.max(cursor, e);
  });
  if (cursor < DAY_END) {
    parts.push({ type: 'free', w: ((DAY_END - cursor) / TOTAL) * 100 });
  }
  return (
    <div>
      <div className="flex h-3 overflow-hidden bg-gray-200" style={{ borderRadius: 10 }}>
        {parts.map((p, i) => (
          <div
            key={i}
            style={{ width: `${p.w}%` }}
            className={p.type === 'occ' ? 'bg-[#7A0808]' : 'bg-gray-200'}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] font-semibold mt-1" style={{ color: '#2B3235' }}>
        <span>07:00</span>
        <span>20:00</span>
      </div>
      <div className="flex gap-4 mt-2 text-[10px] font-bold" style={{ color: '#2B3235' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#7A0808]" /> OCCUPIED
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-300" /> VACANT
        </span>
      </div>
    </div>
  );
}

export default function RoomAvailability() {
  const navigate = useNavigate();
  const { buildingList } = useApp();
  const { profile } = useAuth();
  const isRegistrar = profile?.role === ROLES.REGISTRAR;
  
  const [statusFilter, setStatusFilter] = useState('All');
  const [buildingKey, setBuildingKey] = useState('all');
  const [floorKey, setFloorKey] = useState('all');
  const [managerModalRoom, setManagerModalRoom] = useState(null);

  const buildingOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All Buildings' }];
    buildingList.forEach((b) => {
      const rooms = b.floorData.flatMap((f) => f.rooms);
      const avail = rooms.filter((r) => r.status === 'Available').length;
      opts.push({ value: String(b.id), label: `${b.name} (${avail}/${rooms.length})` });
    });
    return opts;
  }, [buildingList]);

  const floorOptions = useMemo(() => {
    const b = buildingList.find((x) => String(x.id) === buildingKey);
    if (!b) return [{ value: 'all', label: 'All Floors' }];
    return [
      { value: 'all', label: 'All Floors' },
      ...b.floorData.map((f) => {
        const avail = f.rooms.filter((r) => r.status === 'Available').length;
        return { value: `f-${f.floor}`, label: `Floor ${f.floor} (${avail}/${f.rooms.length})` };
      }),
    ];
  }, [buildingList, buildingKey]);

  const visibleRooms = useMemo(() => {
    let rooms = [];
    buildingList.forEach((b) => {
      b.floorData.forEach((f) => {
        f.rooms.forEach((r) => {
          rooms.push({ ...r, buildingId: b.id, buildingName: b.name, floor: f.floor });
        });
      });
    });
    if (buildingKey !== 'all') {
      rooms = rooms.filter((r) => String(r.buildingId) === buildingKey);
    }
    if (buildingKey !== 'all' && floorKey !== 'all') {
      const fn = parseInt(floorKey.replace('f-', ''), 10);
      rooms = rooms.filter((r) => r.floor === fn);
    }
    if (statusFilter === 'Available') rooms = rooms.filter((r) => r.status === 'Available');
    if (statusFilter === 'Occupied') rooms = rooms.filter((r) => r.status === 'Occupied');
    if (statusFilter === 'Maintenance') rooms = rooms.filter((r) => r.status === 'Maintenance');
    return rooms;
  }, [buildingList, buildingKey, floorKey, statusFilter]);

  const showFloorFilters = buildingKey !== 'all';

  return (
    <Layout title="Room Availability" subtitle="Real-time room availability across all buildings">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 w-fit max-w-full">
          <StatusFilterRow
            value={statusFilter}
            onChange={setStatusFilter}
            options={['All', 'Available', 'Occupied', 'Maintenance']}
          />
        </div>

        <div className="bg-white rounded-[10px] shadow-md p-5 border border-gray-100">
          <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: '#2B3235' }}>
            Filter by building
          </p>
          <PillFilterRow
            options={buildingOptions}
            value={buildingKey}
            onChange={(v) => {
              setBuildingKey(v);
              setFloorKey('all');
            }}
          />

          {showFloorFilters && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider mb-3 mt-5" style={{ color: '#2B3235' }}>
                Floor
              </p>
              <PillFilterRow options={floorOptions} value={floorKey} onChange={setFloorKey} variant="outline" />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleRooms.map((room) => {
            // Get floor data to check floor manager
            const building = buildingList.find(b => b.id === room.buildingId);
            const floorData = building?.floorData.find(f => f.floor === room.floor);
            const floorManagedBy = floorData?.managedBy || null;
            
            return (
              <div key={`${room.buildingId}-${room.id}`} className="bg-white rounded-[10px] shadow-md border border-gray-100 p-5 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-black text-base" style={{ color: '#2B3235' }}>{room.id}</h3>
                    <p className="text-xs font-semibold mt-0.5" style={{ color: '#2B3235', opacity: 0.72 }}>{room.type}</p>
                    {(room.managedByName || floorData?.managedByName) && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <Users size={10} className="text-blue-600" />
                        <p className="text-[10px] font-bold text-blue-600">
                          Managed by {room.managedByName || floorData?.managedByName}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        room.status === 'Available'
                          ? 'badge-available'
                          : room.status === 'Occupied'
                          ? 'badge-occupied'
                          : 'badge-maintenance'
                      }
                    >
                      {room.status}
                    </span>
                    {isRegistrar && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setManagerModalRoom({ ...room, floorId: floorData?.floorId, floorManagedBy });
                        }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        title="Manager Settings"
                      >
                        <Settings size={14} className="text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-9 h-9 flex items-center justify-center" style={{ background: '#FFFBFB', borderRadius: 10 }}>
                    <Users size={18} style={{ color: '#7A0808' }} />
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#2B3235' }}>{room.capacity} Seats</span>
                </div>
                <TimelineBar segments={segmentsFor(room.id)} />
                <button
                  type="button"
                  className="btn-maroon w-full justify-center mt-5 py-2.5 text-sm"
                  style={{ borderRadius: 10 }}
                  onClick={() =>
                    navigate(`/room/${room.id}`, {
                      state: { room, buildingId: room.buildingId, buildingName: room.buildingName, floor: room.floor },
                    })
                  }
                >
                  See Room Details
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {managerModalRoom && (
        <RoomManagerSettingsModal
          room={managerModalRoom}
          buildingId={managerModalRoom.buildingId}
          floorId={managerModalRoom.floorId}
          floorManagedBy={managerModalRoom.floorManagedBy}
          onClose={() => setManagerModalRoom(null)}
          onSuccess={() => {
            // Refresh handled by real-time subscription
            setManagerModalRoom(null);
          }}
        />
      )}
    </Layout>
  );
}
