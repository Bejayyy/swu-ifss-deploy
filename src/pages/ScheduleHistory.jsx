import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Clock, User, Building2 } from 'lucide-react';
import Layout from '../components/Layout';
import ProgressStatCards from '../components/ProgressStatCards';
import { deanScheduleHistory } from '../data/mockSchedules';
import ScheduleTagReviewModal from '../components/modals/ScheduleTagReviewModal';

export default function ScheduleHistory() {
  const [expandedId, setExpandedId] = useState(deanScheduleHistory[0]?.id || null);
  const [openBuilding, setOpenBuilding] = useState({});
  const [openFloor, setOpenFloor] = useState({});
  const [review, setReview] = useState(null);

  useEffect(() => {
    setOpenBuilding({});
    setOpenFloor({});
  }, [expandedId]);

  const totalTags = deanScheduleHistory.reduce((a, d) => a + d.schedulesTagged, 0);
  const totalDeans = deanScheduleHistory.length;

  const stats = [
    { label: 'Tagged schedules', value: totalTags, icon: Clock, accent: 'total' },
    { label: 'Faculty / deans', value: totalDeans, icon: User, accent: 'approved' },
    { label: 'Buildings covered', value: deanScheduleHistory.reduce((a, d) => a + d.buildingsTagged, 0), icon: Building2, accent: 'pending' },
    { label: 'This month', value: 12, icon: Clock, accent: 'neutral' },
  ];

  const toggleMap = (setMap, key) => {
    setMap((m) => ({ ...m, [key]: !m[key] }));
  };

  return (
    <Layout title="Schedule History" subtitle="Dean and faculty tagging activity across buildings and rooms">
      <ProgressStatCards items={stats} />

      <div className="mt-6">
        <h2 className="font-bold text-base mb-4" style={{ color: '#2B3235' }}>
          Faculty &amp; deans — select a card to view where they tagged schedules
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {deanScheduleHistory.map((person) => {
            const isOpen = expandedId === person.id;
            return (
              <div
                key={person.id}
                className="bg-white shadow-md border border-gray-100 overflow-hidden flex flex-col"
                style={{ borderRadius: 10, borderLeftWidth: 5, borderLeftColor: person.accent || '#7A0808' }}
              >
                <button
                  type="button"
                  className="w-full flex items-center gap-4 p-5 text-left transition-colors hover:bg-[#F9FAFB]"
                  onClick={() => setExpandedId(isOpen ? null : person.id)}
                  style={{ color: '#2B3235' }}
                >
                  <div
                    className="w-12 h-12 flex items-center justify-center font-black text-base text-white flex-shrink-0"
                    style={{ background: person.accent || '#7A0808', borderRadius: 10 }}
                  >
                    {person.avatarInitials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-base">{person.dean}</p>
                    <p className="text-xs font-semibold mt-1" style={{ opacity: 0.7 }}>
                      {person.role}
                    </p>
                    <p className="text-[11px] font-bold mt-2" style={{ color: '#7A0808' }}>
                      {person.buildingsTagged} buildings · {person.schedulesTagged} tagged schedules
                    </p>
                  </div>
                  {person.isAdmin && (
                    <span className="text-[10px] font-black px-2 py-1 flex-shrink-0" style={{ background: '#F9FAFB', color: '#2B3235', borderRadius: 8 }}>
                      Admin
                    </span>
                  )}
                  <span className="flex-shrink-0">
                    {isOpen ? <ChevronDown size={22} /> : <ChevronRight size={22} />}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-5 pt-0 border-t border-gray-100 bg-[#F9FAFB] space-y-3">
                    {person.buildings.map((b, bi) => {
                      const bk = `${person.id}-${bi}`;
                      const bOpen = openBuilding[bk];
                      return (
                        <div key={b.name} className="bg-white border border-gray-100 shadow-sm overflow-hidden" style={{ borderRadius: 10 }}>
                          <button
                            type="button"
                            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50/80"
                            onClick={() => toggleMap(setOpenBuilding, bk)}
                            style={{ color: '#2B3235' }}
                          >
                            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0" style={{ background: '#FFFBFB', borderRadius: 10 }}>
                              <Building2 size={20} style={{ color: '#7A0808' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-sm">{b.name}</p>
                              <p className="text-[11px] font-semibold mt-1" style={{ opacity: 0.65 }}>
                                Pending {b.pending} · Approved {b.approved} · Rejected {b.rejected}
                              </p>
                            </div>
                            {bOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>

                          {bOpen && (
                            <div className="px-3 pb-3 space-y-2">
                              {b.floors.map((fl, fi) => {
                                const fk = `${person.id}-${bi}-${fi}`;
                                const fOpen = openFloor[fk];
                                return (
                                  <div key={fl.floor} className="border border-gray-100 overflow-hidden" style={{ borderRadius: 10 }}>
                                    <button
                                      type="button"
                                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-bold bg-gray-50 hover:bg-gray-100"
                                      onClick={() => toggleMap(setOpenFloor, fk)}
                                      style={{ color: '#2B3235' }}
                                    >
                                      {fOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                      Floor {fl.floor}
                                    </button>
                                    {fOpen && (
                                      <div className="p-2 space-y-3 bg-[#F9FAFB]">
                                        {fl.rooms.map((room) => (
                                          <div key={room.name}>
                                            <p
                                              className="text-[11px] font-bold uppercase tracking-wide px-2 py-1.5 mb-2"
                                              style={{ color: '#2B3235', background: '#E5E7EB', borderRadius: 8 }}
                                            >
                                              {room.name}
                                            </p>
                                            {room.items.map((it, idx) => (
                                              <div
                                                key={idx}
                                                className="bg-white border border-gray-100 p-4 mb-2 shadow-sm"
                                                style={{ borderRadius: 10 }}
                                              >
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                  <span className={it.status === 'Approved' ? 'badge-approved' : 'badge-pending'}>{it.status}</span>
                                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900">{it.tag}</span>
                                                </div>
                                                <p className="font-black text-sm" style={{ color: '#2B3235' }}>{it.course}</p>
                                                <p className="text-xs font-semibold mb-2" style={{ color: '#2B3235' }}>{it.subject}</p>
                                                <div className="flex flex-wrap gap-3 text-xs font-medium" style={{ color: '#2B3235', opacity: 0.85 }}>
                                                  <span className="flex items-center gap-1">
                                                    <Clock size={12} /> {it.when}
                                                  </span>
                                                  <span className="flex items-center gap-1">
                                                    <User size={12} /> {it.professor}
                                                  </span>
                                                </div>
                                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                                  <span className="text-xs font-bold" style={{ color: '#2B3235' }}>{it.mode}</span>
                                                  <button
                                                    type="button"
                                                    className="btn-maroon text-xs py-1.5 px-4"
                                                    style={{ borderRadius: 10 }}
                                                    onClick={() =>
                                                      setReview({
                                                        taggerName: person.dean,
                                                        buildingName: b.name,
                                                        roomName: room.name,
                                                        item: it,
                                                      })
                                                    }
                                                  >
                                                    Review
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {review && (
        <ScheduleTagReviewModal
          taggerName={review.taggerName}
          buildingName={review.buildingName}
          roomName={review.roomName}
          item={review.item}
          onClose={() => setReview(null)}
        />
      )}
    </Layout>
  );
}
