import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Clock, MapPin, Sparkles, Building2, Users, AlertTriangle,
  CheckCircle2, RefreshCw, ChevronRight, ShieldAlert
} from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { useModal } from '../hooks/useModal';
import { ModalRenderer } from '../components/modals/ModalProvider';
import { fetchRoomReservation } from '../services/reservationService';
import { getRecommendedRooms, rescheduleReservation } from '../services/noClassDayService';

export default function RescheduleReservation() {
  const { reservationId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { buildingList } = useApp();
  const { showConfirm, showNotification, confirmState, notificationState } = useModal();

  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [selectedRec, setSelectedRec] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Manual fallback state
  const [customDate, setCustomDate] = useState('');
  const [customTimeStart, setCustomTimeStart] = useState('');
  const [customTimeEnd, setCustomTimeEnd] = useState('');
  const [customBuildingId, setCustomBuildingId] = useState('');
  const [customFloorId, setCustomFloorId] = useState('');
  const [customRoomDocId, setCustomRoomDocId] = useState('');

  // Fetch reservation details
  useEffect(() => {
    async function loadData() {
      if (!reservationId) return;
      setLoading(true);
      try {
        const res = await fetchRoomReservation(reservationId);
        setReservation(res);
        if (res) {
          setCustomTimeStart(res.timeStart || '08:00');
          setCustomTimeEnd(res.timeEnd || '10:00');
          // Load recommendations
          setLoadingRecommendations(true);
          const recs = await getRecommendedRooms(res, buildingList);
          setRecommendations(recs);
          setLoadingRecommendations(false);
        }
      } catch (err) {
        console.error('Error loading reservation:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [reservationId, buildingList]);

  // Handle recommendation select & submit
  const handleConfirmReschedule = async (rec) => {
    const targetRec = rec || selectedRec;
    if (!targetRec) return;

    const confirmed = await showConfirm({
      title: 'Confirm Reschedule',
      message: `Move reservation "${reservation.title || reservation.activity}" to ${targetRec.roomName} (${targetRec.buildingName}) on ${targetRec.availableDate}?`,
      confirmText: 'Confirm & Reschedule',
      cancelText: 'Cancel',
      variant: 'primary',
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await rescheduleReservation(reservation.id, {
        newDate: targetRec.availableDate,
        newTimeStart: targetRec.availableTimeStart,
        newTimeEnd: targetRec.availableTimeEnd,
        newRoom: targetRec.roomName,
        newRoomDocId: targetRec.roomDocId,
        newBuilding: targetRec.buildingName,
        newBuildingId: targetRec.buildingId,
        newFloor: targetRec.floor,
        newFloorId: targetRec.floorId,
        newDesignatedVenue: `${targetRec.roomName}, ${targetRec.buildingName} Floor ${targetRec.floor}`,
      });

      showNotification({
        type: 'success',
        title: 'Reservation Rescheduled!',
        message: `Your reservation has been moved to ${targetRec.availableDate} at ${targetRec.roomName}.`,
      });

      setTimeout(() => {
        navigate('/dashboard');
      }, 1500);
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Reschedule Failed',
        message: err.message || 'Failed to reschedule reservation.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Reschedule Reservation" subtitle="Smart Room Recommender">
        <div className="py-20 text-center text-gray-500">
          <RefreshCw className="animate-spin mx-auto mb-3 text-[#800000]" size={24} />
          Loading reservation details & generating smart recommendations…
        </div>
      </Layout>
    );
  }

  if (!reservation) {
    return (
      <Layout title="Reservation Not Found">
        <div className="py-12 text-center text-gray-500">
          <p className="mb-4 text-sm">The requested reservation could not be found.</p>
          <button type="button" onClick={() => navigate(-1)} className="btn-maroon text-xs">
            Go Back
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Reschedule Reservation" subtitle="Smart Room Recommender System">
      <ModalRenderer confirmState={confirmState} notificationState={notificationState} />

      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header navigation */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>

        {/* Postponement Notice Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 shadow-2xs flex items-start gap-4">
          <div className="p-3 bg-amber-100 rounded-xl text-amber-800 flex-shrink-0">
            <ShieldAlert size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900">
                Postponed — No Class Day
              </span>
            </div>
            <h2 className="text-base font-black text-amber-950">
              {reservation.title || reservation.activity || 'Room Reservation'}
            </h2>
            <p className="text-xs text-amber-800 mt-1">
              <strong>Reason for suspension:</strong> {reservation.postponedReason || 'Declared No Class Day'}
            </p>
            <div className="flex items-center gap-4 mt-3 text-xs text-amber-900 font-semibold flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar size={14} /> Original Date: <strong className="line-through">{reservation.postponedFromDate || reservation.dateOfActivity}</strong>
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={14} /> Venue: {reservation.designatedVenue || reservation.room}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} /> Time: {reservation.timeStart} – {reservation.timeEnd}
              </span>
            </div>
          </div>
        </div>

        {/* Smart Recommender System Card */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100 flex-wrap gap-3">
            <div>
              <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <Sparkles size={20} className="text-amber-500" />
                Smart Room Recommendations
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Suggested available schedules matching your room type and capacity requirements on closest upcoming dates.
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                setLoadingRecommendations(true);
                const recs = await getRecommendedRooms(reservation, buildingList);
                setRecommendations(recs);
                setLoadingRecommendations(false);
              }}
              disabled={loadingRecommendations}
              className="px-3.5 py-1.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw size={13} className={loadingRecommendations ? 'animate-spin' : ''} />
              Refresh Suggestions
            </button>
          </div>

          {loadingRecommendations ? (
            <div className="py-12 text-center text-gray-400 text-xs">
              <RefreshCw className="animate-spin mx-auto mb-2 text-[#800000]" size={20} />
              Scanning room availability and schedule conflicts…
            </div>
          ) : recommendations.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-xs bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              <AlertTriangle className="mx-auto mb-2 text-amber-500" size={24} />
              No matching room recommendations found in the next 7 days.
              <p className="mt-1 text-[11px] text-gray-400">Try using custom date/time selection below.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map((rec, idx) => {
                const isSelected = selectedRec?.roomDocId === rec.roomDocId && selectedRec?.availableDate === rec.availableDate;

                return (
                  <div
                    key={`${rec.roomDocId}_${rec.availableDate}_${idx}`}
                    onClick={() => setSelectedRec(rec)}
                    className={`border rounded-2xl p-5 cursor-pointer transition-all flex flex-col justify-between space-y-4 ${
                      isSelected
                        ? 'border-[#800000] bg-red-50/30 ring-2 ring-[#800000]/20 shadow-xs'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          rec.priority === 1
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : rec.priority === 2
                            ? 'bg-blue-100 text-blue-800 border border-blue-200'
                            : rec.priority === 3
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {rec.label}
                        </span>
                        <span className="text-xs font-bold text-gray-400">
                          Capacity: {rec.capacity}
                        </span>
                      </div>

                      <h4 className="text-base font-black text-gray-900">
                        {rec.roomName}
                      </h4>

                      <div className="text-xs space-y-1 text-gray-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={14} className="text-gray-400" />
                          <span>{rec.buildingName} • Floor {rec.floor}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-gray-400" />
                          <span className="font-bold text-[#800000]">{rec.availableDate}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className="text-gray-400" />
                          <span>{rec.availableTimeStart} – {rec.availableTimeEnd}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConfirmReschedule(rec);
                      }}
                      disabled={isSubmitting}
                      className="w-full btn-maroon text-xs py-2.5 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 size={15} /> Select & Confirm Schedule
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
