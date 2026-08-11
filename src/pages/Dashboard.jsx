import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DoorOpen, ClipboardList, CheckCircle, XCircle, Clock,
  Building2, ArrowRight, BarChart3, Calendar,
  BookOpen, Activity, Filter, RefreshCw, Layers, TrendingUp,
  Search, Plus, PieChart, ShieldAlert, Check, AlertCircle, Wrench
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, Legend
} from 'recharts';
import Layout from '../components/Layout';
import { useApp } from '../context/AppContext';
import PageSkeleton from '../components/SkeletonLoader';
import {
  computeRoomStats,
  computeRequestStats,
  computeRoomUtilization,
  computeDepartmentActivity,
  computeSubjectRoomAssignments,
  buildRecentActivity,
  computeWeeklyDemandByDay,
  computeStructuredRoomAvailability,
  computeFacilityTypeDistribution,
  formatRelativeTime,
} from '../services/dashboardService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

// ───── Design Tokens (Solid Colors — No Gradients) ─────
const MAROON = '#800000';
const AMBER = '#D97706';
const EMERALD = '#059669';
const BLUE = '#2563EB';

// ───── Status Badge Color Schemes ─────
const STATUS_COLORS = {
  Approved: { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  Rejected: { bg: 'bg-rose-50 text-rose-700 border-rose-200' },
  Pending: { bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  'In Progress': { bg: 'bg-blue-50 text-blue-700 border-blue-200' },
  Draft: { bg: 'bg-slate-50 text-slate-700 border-slate-200' },
  Postponed: { bg: 'bg-purple-50 text-purple-700 border-purple-200' },
};

// ───── Activity Icons ─────
const ACTIVITY_ICONS = {
  approved: <CheckCircle size={15} className="text-emerald-600" />,
  rejected: <XCircle size={15} className="text-rose-600" />,
  pending: <Clock size={15} className="text-amber-600" />,
  'in-progress': <RefreshCw size={15} className="text-blue-600" />,
  draft: <ClipboardList size={15} className="text-slate-400" />,
  postponed: <Clock size={15} className="text-purple-600" />,
  info: <Activity size={15} className="text-slate-400" />,
};

// ───── Custom Clean Tooltip ─────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 text-white border border-slate-800 p-3 rounded-lg shadow-lg text-xs">
      <p className="font-bold text-slate-200 mb-1 pb-1 border-b border-slate-800">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 mt-1">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color || MAROON }} />
          <span className="text-slate-300 font-medium">{entry.name || entry.dataKey}:</span>
          <span className="font-bold text-white ml-auto">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ───── Status Badge Component ─────
function StatusBadge({ status }) {
  const styleClass = STATUS_COLORS[status]?.bg || STATUS_COLORS.Draft.bg;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${styleClass}`}>
      {status}
    </span>
  );
}

// ───── Modern Uniform Stat Card Component ─────
function StatCard({ label, value, icon: Icon, color = 'blue', onClick }) {
  const COLOR_MAP = {
    blue: 'bg-blue-100/70 text-blue-600',
    green: 'bg-emerald-100/70 text-emerald-600',
    emerald: 'bg-emerald-100/70 text-emerald-600',
    rose: 'bg-rose-100/70 text-rose-600',
    amber: 'bg-amber-100/70 text-amber-600',
    maroon: 'bg-red-100/70 text-[#800000]',
    slate: 'bg-slate-100 text-slate-500',
  };
  const colorStyle = COLOR_MAP[color] || COLOR_MAP.blue;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-[16px] border border-slate-200/70 p-5 shadow-2xs flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-11 h-11 rounded-[12px] flex items-center justify-center ${colorStyle}`}>
          {Icon && <Icon size={20} strokeWidth={2} />}
        </div>
        <span className="text-2xl sm:text-3xl font-extrabold text-slate-800 tabular-nums">
          {typeof value === 'number' ? value : value}
        </span>
      </div>
      <p className="text-[13px] font-bold text-slate-700 leading-tight">{label}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// MAIN DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { buildingList, requests, buildingsLoading, requestsLoading } = useApp();
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [activeDay, setActiveDay] = useState('Mon');
  const [assignmentSort, setAssignmentSort] = useState('subject');

  const isLoading = buildingsLoading || requestsLoading;

  // ───── Computed Analytics ─────
  const roomStats = useMemo(() => computeRoomStats(buildingList), [buildingList]);
  const requestStats = useMemo(() => computeRequestStats(requests), [requests]);
  const utilization = useMemo(() => computeRoomUtilization(buildingList, requests), [buildingList, requests]);
  const deptActivity = useMemo(() => computeDepartmentActivity(requests), [requests]);
  const weeklyDemand = useMemo(() => computeWeeklyDemandByDay(requests), [requests]);
  const facilityTypes = useMemo(() => computeFacilityTypeDistribution(buildingList), [buildingList]);
  const subjectAssignments = useMemo(() => computeSubjectRoomAssignments(buildingList, requests), [buildingList, requests]);
  const recentActivity = useMemo(() => buildRecentActivity(requests, 10), [requests]);
  
  const { timeBlocks, roomCards } = useMemo(
    () => computeStructuredRoomAvailability(buildingList, requests, selectedBuilding, activeDay),
    [buildingList, requests, selectedBuilding, activeDay]
  );

  // Sort assignments
  const sortedAssignments = useMemo(() => {
    const copy = [...subjectAssignments];
    copy.sort((a, b) => {
      if (assignmentSort === 'status') return (a.status || '').localeCompare(b.status || '');
      if (assignmentSort === 'room') return (a.room || '').localeCompare(b.room || '');
      return (a.subject || '').localeCompare(b.subject || '');
    });
    return copy.slice(0, 15);
  }, [subjectAssignments, assignmentSort]);

  if (isLoading) {
    return (
      <Layout title="Dashboard" subtitle="Facility Overview & Analytics">
        <PageSkeleton />
      </Layout>
    );
  }

  const pendingTotal = requestStats.pending + requestStats.inProgress;

  return (
    <Layout title="Dashboard" subtitle="Facility Overview & Analytics">
      {/* ───── 1. Top Metric Cards (4 Cards Grid) ───── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Facilities"
          value={roomStats.total}
          icon={DoorOpen}
          color="maroon"
          onClick={() => navigate('/building-management')}
        />
        <StatCard
          label="Available Rooms"
          value={roomStats.available}
          icon={CheckCircle}
          color="green"
          onClick={() => navigate('/room-finder')}
        />
        <StatCard
          label="Occupied Rooms"
          value={roomStats.occupied}
          icon={Building2}
          color="rose"
          onClick={() => navigate('/building-management')}
        />
        <StatCard
          label="Pending Requests"
          value={pendingTotal}
          icon={ClipboardList}
          color="amber"
          onClick={() => navigate('/approvals')}
        />
      </div>

      {/* ───── 2. Primary Analytics Charts (Solid Colors — No Gradients) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Room Utilization Rate by Building */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#800000] border border-red-100">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Room Utilization Rate</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Facility usage intensity per building</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-semibold text-[#800000] bg-red-50/60 border-red-200">
                Live Rate
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-64">
              {utilization.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={utilization} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                    <YAxis dataKey="building" type="category" width={110} tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="utilization" name="Utilization" radius={[0, 6, 6, 0]}>
                      {utilization.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.utilization > 75 ? MAROON : entry.utilization > 50 ? AMBER : EMERALD}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  No building utilization data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Campus Room Demand (Mon - Sat Report) */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#800000] border border-red-100">
                  <Calendar size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Weekly Room Demand & Booking Volume</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Day-by-day reservation requests (Mon – Sat)</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-semibold text-slate-700 bg-slate-50 border-slate-200">
                Mon – Sat Report
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyDemand} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="Approved" fill={MAROON} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Pending" fill={AMBER} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── 3. Secondary Analytics Section (Department Activity + Facility Types) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Department Scheduling Volume */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-50 text-[#800000] border border-red-100">
                <Layers size={18} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Department Scheduling Volume</CardTitle>
                <CardDescription className="text-xs text-slate-500">Total room allocations requested per college</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="h-60">
              {deptActivity.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptActivity} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="department" type="category" width={120} tick={{ fill: '#334155', fontSize: 10, fontWeight: 600 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Requests" fill={MAROON} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  No department scheduling data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Facility Type Distribution */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-50 text-[#800000] border border-red-100">
                <PieChart size={18} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Facility Type Distribution</CardTitle>
                <CardDescription className="text-xs text-slate-500">Breakdown of campus facilities by room category</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="space-y-3.5">
              {facilityTypes.map((item) => {
                const totalRooms = roomStats.total || 1;
                const percentage = Math.round((item.value / totalRooms) * 100);
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        <span className="font-bold text-slate-900">{item.value} rooms</span>
                        <span className="text-slate-400 text-[10px]">({percentage}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%`, backgroundColor: item.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── 4. REDESIGNED ROOM AVAILABILITY BOARD (Clean, Intuitive Cards) ───── */}
      <Card className="border-slate-200/80 shadow-2xs bg-white mb-6 rounded-2xl">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-50 text-[#800000] border border-red-100">
                <DoorOpen size={18} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Room Availability & Schedule Board</CardTitle>
                <CardDescription className="text-xs text-slate-500">Real-time room occupancy and hourly schedule status</CardDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Day Filter Tabs */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <button
                    key={day}
                    onClick={() => setActiveDay(day)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                      activeDay === day
                        ? 'bg-[#800000] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              {/* Building Filter */}
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50/50 text-xs">
                <Filter size={13} className="text-slate-400" />
                <select
                  className="bg-transparent font-semibold text-slate-700 outline-none cursor-pointer"
                  value={selectedBuilding || ''}
                  onChange={(e) => setSelectedBuilding(e.target.value || null)}
                >
                  <option value="">All Buildings</option>
                  {buildingList.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Quick Legend Pills */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-slate-100 text-xs">
            <span className="font-semibold text-slate-500">Time Block Status:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-medium text-slate-700">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#800000]" />
              <span className="font-medium text-slate-700">Occupied / Reserved</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
              <span className="font-medium text-slate-700">Under Maintenance</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {roomCards.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {roomCards.map((room) => (
                <div
                  key={room.id}
                  className="bg-slate-50/50 rounded-xl border border-slate-200/80 p-4 transition-all hover:bg-white hover:shadow-xs hover:border-slate-300"
                >
                  {/* Room Card Header */}
                  <div className="flex items-start justify-between mb-3 pb-2.5 border-b border-slate-200/70">
                    <div>
                      <h4 className="font-extrabold text-slate-900 text-sm">{room.name}</h4>
                      <p className="text-xs text-slate-500 font-medium">
                        {room.buildingName} · {room.type} ({room.capacity} seats)
                      </p>
                    </div>
                    {room.maintenanceStatus === 'under-maintenance' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        <Wrench size={12} /> Maintenance
                      </span>
                    ) : room.status === 'Occupied' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertCircle size={12} /> Occupied
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <Check size={12} /> Available
                      </span>
                    )}
                  </div>

                  {/* Hourly Schedule Pills Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {timeBlocks.map((tb) => {
                      const slotStatus = room.slots[tb.id] || 'available';
                      const isFree = slotStatus === 'available';
                      const isMaint = slotStatus === 'maintenance';

                      return (
                        <div
                          key={tb.id}
                          className={`p-1.5 rounded-lg border text-center transition-all ${
                            isMaint
                              ? 'bg-slate-100 text-slate-500 border-slate-200'
                              : isFree
                              ? 'bg-emerald-50/70 text-emerald-800 border-emerald-200/80 font-semibold'
                              : 'bg-red-50 text-[#800000] border-red-200 font-bold'
                          }`}
                        >
                          <p className="text-[10px] font-semibold text-slate-500 leading-none mb-0.5">{tb.label}</p>
                          <p className="text-[11px] font-bold capitalize">
                            {isMaint ? 'Maint.' : isFree ? 'Free' : 'Booked'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-slate-400 text-xs font-medium">
              No rooms found matching selected criteria.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───── 5. Bottom Section: Subject Assignments & Activity ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subject Room Assignments */}
        <Card className="lg:col-span-2 border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#800000] border border-red-100">
                  <BookOpen size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Academic Subject Assignments</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Allocated classrooms and facility specs</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Sort by:</span>
                <select
                  className="text-xs font-medium border border-slate-200 rounded-md px-2.5 py-1 bg-white text-slate-700 outline-none cursor-pointer"
                  value={assignmentSort}
                  onChange={(e) => setAssignmentSort(e.target.value)}
                >
                  <option value="subject">Subject Code</option>
                  <option value="room">Assigned Room</option>
                  <option value="status">Status</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[550px]">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-600 font-bold">
                    <th className="text-left py-2.5 px-4">Subject</th>
                    <th className="text-left py-2.5 px-3">Room</th>
                    <th className="text-center py-2.5 px-3">Capacity</th>
                    <th className="text-left py-2.5 px-3">Type</th>
                    <th className="text-center py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {sortedAssignments.length > 0 ? (
                    sortedAssignments.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{row.subject}</td>
                        <td className="py-2.5 px-3 font-mono text-xs font-bold text-[#800000]">{row.room}</td>
                        <td className="py-2.5 px-3 text-center tabular-nums font-medium">{row.capacity}</td>
                        <td className="py-2.5 px-3 text-slate-500">{row.type}</td>
                        <td className="py-2.5 px-3 text-center">
                          <StatusBadge status={row.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-400">
                        No subject room assignments found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-slate-200/80 shadow-2xs bg-white rounded-2xl">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-red-50 text-[#800000] border border-red-100">
                  <Activity size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Recent Activity</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Live reservation events</CardDescription>
                </div>
              </div>
              <button
                onClick={() => navigate('/approvals')}
                className="text-xs font-bold text-[#800000] hover:underline flex items-center gap-1"
              >
                View All <ArrowRight size={12} />
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {recentActivity.length > 0 ? (
                recentActivity.map((a, i) => (
                  <div
                    key={a.id || i}
                    className="flex gap-3 items-start p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all"
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg bg-slate-50 border border-slate-100 flex-shrink-0">
                      {ACTIVITY_ICONS[a.type] || ACTIVITY_ICONS.info}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{a.text}</p>
                      <p className="text-[11px] text-slate-500 truncate">{a.sub}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400 flex-shrink-0 whitespace-nowrap">
                      {formatRelativeTime(a.timestamp)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-400 text-xs">No recent activity logged</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
