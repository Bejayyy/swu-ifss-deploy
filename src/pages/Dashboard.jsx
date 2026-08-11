import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DoorOpen, ClipboardList, CheckCircle, XCircle, Clock,
  Building2, ArrowRight, BarChart3, Calendar,
  BookOpen, Activity, Filter, RefreshCw, Layers, Sparkles, TrendingUp,
  Search, Plus, GitBranch, Wrench, PieChart, ShieldAlert, Cpu
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, AreaChart, Area
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
  computeRoomAvailabilityGrid,
  computeHourlyDemand,
  computeFacilityTypeDistribution,
  formatRelativeTime,
} from '../services/dashboardService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';

// ───── Design Tokens ─────
const MAROON = '#800000';

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
  approved: <CheckCircle size={15} className="text-emerald-500" />,
  rejected: <XCircle size={15} className="text-rose-500" />,
  pending: <Clock size={15} className="text-amber-500" />,
  'in-progress': <RefreshCw size={15} className="text-blue-500" />,
  draft: <ClipboardList size={15} className="text-slate-400" />,
  postponed: <Clock size={15} className="text-purple-500" />,
  info: <Activity size={15} className="text-slate-400" />,
};

// ───── Availability Grid Colors ─────
const AVAIL_COLORS = {
  available: '#D1FAE5',
  occupied: '#FECACA',
  reserved: '#FDE68A',
  maintenance: '#E5E7EB',
};

const AVAIL_LABELS = {
  available: 'Available',
  occupied: 'Occupied',
  reserved: 'Reserved',
  maintenance: 'Maintenance',
};

// ───── Custom Recharts Tooltip ─────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900/95 backdrop-blur-md text-white border border-slate-800 p-3 rounded-lg shadow-xl text-xs">
      <p className="font-bold text-slate-200 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || MAROON }} />
          <span className="text-slate-300">{entry.name || entry.dataKey}:</span>
          <span className="font-bold text-white">{entry.value}</span>
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

// ───── Modern Stat Card Component ─────
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
  const [assignmentSort, setAssignmentSort] = useState('subject');

  const isLoading = buildingsLoading || requestsLoading;

  // ───── Computed Analytics ─────
  const roomStats = useMemo(() => computeRoomStats(buildingList), [buildingList]);
  const requestStats = useMemo(() => computeRequestStats(requests), [requests]);
  const utilization = useMemo(() => computeRoomUtilization(buildingList, requests), [buildingList, requests]);
  const deptActivity = useMemo(() => computeDepartmentActivity(requests), [requests]);
  const hourlyDemand = useMemo(() => computeHourlyDemand(requests), [requests]);
  const facilityTypes = useMemo(() => computeFacilityTypeDistribution(buildingList), [buildingList]);
  const subjectAssignments = useMemo(() => computeSubjectRoomAssignments(buildingList, requests), [buildingList, requests]);
  const recentActivity = useMemo(() => buildRecentActivity(requests, 10), [requests]);
  const availabilityGrid = useMemo(
    () => computeRoomAvailabilityGrid(buildingList, requests, selectedBuilding),
    [buildingList, requests, selectedBuilding]
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
  const operationalPct = roomStats.total > 0
    ? Math.round(((roomStats.total - roomStats.maintenance) / roomStats.total) * 100)
    : 100;

  return (
    <Layout title="Dashboard" subtitle="Facility Overview & Analytics">
      {/* ───── Quick Actions Toolbar ───── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#800000]" />
          <span className="text-xs font-bold text-slate-800">Quick Operations</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/room-finder')}
            className="text-xs gap-1.5 border-slate-200 hover:bg-slate-50 font-semibold"
          >
            <Search size={14} className="text-[#800000]" />
            Find Available Room
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/approvals')}
            className="text-xs gap-1.5 border-slate-200 hover:bg-slate-50 font-semibold"
          >
            <ClipboardList size={14} className="text-[#800000]" />
            View Approvals
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate('/course-scheduling')}
            className="text-xs gap-1.5 border-slate-200 hover:bg-slate-50 font-semibold"
          >
            <Calendar size={14} className="text-[#800000]" />
            Course Schedules
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('/building-management')}
            className="text-xs gap-1.5 bg-[#800000] hover:bg-[#5E0606] text-white font-semibold shadow-xs"
          >
            <Building2 size={14} />
            Facility Management
          </Button>
        </div>
      </div>

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


      {/* ───── 2. Primary Charts Section (2 Columns) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Room Utilization Rate */}
        <Card className="border-slate-200/80 shadow-xs bg-white">
          <CardHeader className="pb-2 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-50 text-[#800000]">
                  <BarChart3 size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Room Utilization Rate</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Facility usage intensity across buildings</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-semibold text-slate-600 border-slate-200">
                <TrendingUp size={12} className="mr-1 text-emerald-500" />
                Live Rate
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-64">
              {utilization.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={utilization} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} unit="%" />
                    <YAxis dataKey="building" type="category" width={110} tick={{ fill: '#334155', fontSize: 11, fontWeight: 500 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="utilization" name="Utilization" radius={[0, 6, 6, 0]}>
                      {utilization.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.utilization > 75 ? '#800000' : entry.utilization > 50 ? '#d97706' : '#059669'}
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

        {/* Peak Hourly Demand Analysis (7:00 AM - 7:00 PM) */}
        <Card className="border-slate-200/80 shadow-xs bg-white">
          <CardHeader className="pb-2 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-50 text-[#800000]">
                  <Clock size={18} />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">Peak Hours Demand Analysis</CardTitle>
                  <CardDescription className="text-xs text-slate-500">Time-slot reservation volume throughout the day</CardDescription>
                </div>
              </div>
              <Badge variant="outline" className="text-xs font-semibold text-slate-600 border-slate-200">
                7:00 AM – 7:00 PM
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyDemand} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="demandGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#800000" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#800000" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="demand" name="Active Reservations" stroke="#800000" strokeWidth={2.5} fillOpacity={1} fill="url(#demandGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ───── 3. Secondary Analytics Section (Department Activity + Facility Types) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Department Scheduling Activity */}
        <Card className="border-slate-200/80 shadow-xs bg-white">
          <CardHeader className="pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-50 text-[#800000]">
                <Layers size={18} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Department Scheduling Volume</CardTitle>
                <CardDescription className="text-xs text-slate-500">Total room allocations requested per college</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-60">
              {deptActivity.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptActivity} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} allowDecimals={false} />
                    <YAxis dataKey="department" type="category" width={120} tick={{ fill: '#334155', fontSize: 10, fontWeight: 500 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Requests" fill="#800000" radius={[0, 6, 6, 0]} />
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
        <Card className="border-slate-200/80 shadow-xs bg-white">
          <CardHeader className="pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-50 text-[#800000]">
                <PieChart size={18} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Facility Type Distribution</CardTitle>
                <CardDescription className="text-xs text-slate-500">Breakdown of campus facilities by room category</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {facilityTypes.map((item) => {
                const totalRooms = roomStats.total || 1;
                const percentage = Math.round((item.value / totalRooms) * 100);
                return (
                  <div key={item.name} className="space-y-1">
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

      {/* ───── 4. Room Availability Grid ───── */}
      <Card className="border-slate-200/80 shadow-xs bg-white mb-6">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-50 text-[#800000]">
                <Calendar size={18} />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-slate-900">Room Availability Matrix</CardTitle>
                <CardDescription className="text-xs text-slate-500">Weekly room schedule and occupancy status</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50/50 text-xs">
                <Filter size={13} className="text-slate-400" />
                <select
                  className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer"
                  value={selectedBuilding || ''}
                  onChange={(e) => setSelectedBuilding(e.target.value || null)}
                >
                  <option value="">All Campus Buildings</option>
                  {buildingList.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Status Legend Pills */}
          <div className="flex gap-4 mt-3 pt-2 flex-wrap border-t border-slate-100/80">
            {Object.entries(AVAIL_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-xs shadow-2xs border border-black/5" style={{ background: AVAIL_COLORS[key] }} />
                <span className="text-xs font-semibold text-slate-600">{label}</span>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-700">
                  <th className="text-left py-2.5 px-3 font-bold sticky left-0 bg-slate-50 z-10 min-w-[100px]">Room</th>
                  {availabilityGrid.days.map((day) => (
                    <th key={day} colSpan={availabilityGrid.timeSlots.length} className="text-center py-2 px-1 font-bold border-l border-slate-200/60">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {availabilityGrid.grid.length > 0 ? (
                  availabilityGrid.grid.map(({ room, slots }, idx) => (
                    <tr key={room.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      <td className="py-2 px-3 font-bold sticky left-0 bg-white z-10 whitespace-nowrap text-slate-800 shadow-xs border-r border-slate-100">
                        {room.id}
                      </td>
                      {availabilityGrid.days.map((day) =>
                        availabilityGrid.timeSlots.map((slot) => {
                          const key = `${day}-${slot.hour}`;
                          const status = slots[key] || 'available';
                          return (
                            <td key={key} className="p-0">
                              <div
                                className="w-full h-6 border-r border-slate-100/60 transition-opacity hover:opacity-80 cursor-pointer"
                                style={{ background: AVAIL_COLORS[status] || AVAIL_COLORS.available }}
                                title={`${room.id} · ${day} ${slot.label} — ${AVAIL_LABELS[status]}`}
                              />
                            </td>
                          );
                        })
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={1 + availabilityGrid.days.length * availabilityGrid.timeSlots.length} className="text-center py-10 text-slate-400 text-xs">
                      No rooms found for selected building
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ───── 5. Bottom Grid: Subject Assignments + Recent Activity ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Subject-to-Room Assignment Table (2 Columns) */}
        <Card className="lg:col-span-2 border-slate-200/80 shadow-xs bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-50 text-[#800000]">
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

        {/* Recent Activity Timeline (1 Column) */}
        <Card className="border-slate-200/80 shadow-xs bg-white">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-50 text-[#800000]">
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
                    className="flex gap-3 items-start p-2.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all"
                  >
                    <div className="mt-0.5 p-1.5 rounded-md bg-slate-50 border border-slate-100 flex-shrink-0">
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
