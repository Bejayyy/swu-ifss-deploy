import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, DoorOpen, ClipboardList, Users, Activity, CheckCircle, XCircle, Clock, ArrowRight } from 'lucide-react';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import PageSkeleton from '../components/SkeletonLoader';

const stats = [
  { label: 'Total Buildings', value: '04', icon: Building2 },
  { label: 'Total Rooms', value: '500', icon: DoorOpen },
  { label: 'Pending Request', value: '10', icon: ClipboardList },
  { label: 'Active Users', value: '10', icon: Users },
];

const recentActivity = [
  { text: 'ENG-201 schedule approved', sub: 'Engineering Building · 2 hours ago', type: 'approved' },
  { text: 'New booking request pending', sub: 'Science Building · 3 hours ago', type: 'pending' },
  { text: 'Lecture schedule rejected', sub: 'Business Building · 6 hours ago', type: 'rejected' },
  { text: 'PH-101 marked as available', sub: 'Phinma Hall · 8 hours ago', type: 'approved' },
  { text: 'Room maintenance scheduled', sub: 'Merlo Building · 1 day ago', type: 'pending' },
];

const actIcon = { approved: <CheckCircle size={14} className="text-green-500" />, rejected: <XCircle size={14} className="text-red-500" />, pending: <Clock size={14} className="text-yellow-500" /> };

const roomUtilization = [
  { building: 'Engineering', used: 75 },
  { building: 'Phinma Hall', used: 60 },
  { building: 'Merlo Building', used: 45 },
  { building: 'Business Building', used: 30 },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { buildingList, requests, buildingsLoading, requestsLoading } = useApp();

  const pendingReqs = requests.filter((r) => r.status === 'Pending' || r.status === 'In Progress').length;
  const isLoading = buildingsLoading || requestsLoading;

  if (isLoading) {
    return (
      <Layout title="Dashboard" subtitle="Facility Overview">
        <PageSkeleton />
      </Layout>
    );
  }

  return (
    <Layout title="Dashboard" subtitle="Facility Overview">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="stat-card">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#2B3235', opacity: 0.55 }}>{label}</p>
              <p className="text-3xl font-black" style={{ color: '#2B3235' }}>{label === 'Pending Request' ? pendingReqs || value : value}</p>
            </div>
            <div className="stat-icon-box"><Icon size={18} /></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Buildings & Facilities */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base" style={{ color: '#2B3235' }}>Buildings & Facilities</h2>
            <button onClick={() => navigate('/building-management')} className="text-xs font-bold flex items-center gap-1" style={{ color: '#7A0808' }}>
              View All <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {buildingList.slice(0, 4).map(b => (
              <div key={b.id} className="rounded-xl overflow-hidden bg-white shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/building/${b.id}`)}>
                <div className="h-32 overflow-hidden bg-gray-100">
                  {b.image ? (
                    <img src={b.image} alt={b.name} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="p-3">
                  <p className="font-bold text-sm" style={{ color: '#2B3235' }}>{b.name}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-gray-400">{b.floors} floors</span>
                    <span className="text-xs text-gray-400">{b.totalRooms} rooms</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Room Utilization */}
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm" style={{ borderLeft: '5px solid #7A0808' }}>
            <h3 className="font-bold text-sm mb-4" style={{ color: '#2B3235' }}>Room Utilization</h3>
            <div className="space-y-3">
              {roomUtilization.map(({ building, used }) => (
                <div key={building}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-semibold" style={{ color: '#2B3235' }}>{building}</span>
                    <span className="text-xs font-bold" style={{ color: '#7A0808' }}>{used}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${used}%`, background: '#7A0808' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm" style={{ borderLeft: '5px solid #7A0808' }}>
            <h3 className="font-bold text-sm mb-4" style={{ color: '#2B3235' }}>Recent Activity</h3>
            <div className="space-y-3">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex gap-2.5 items-start">
                  <div className="mt-0.5">{actIcon[a.type]}</div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: '#2B3235' }}>{a.text}</p>
                    <p className="text-[10px] text-gray-400">{a.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
