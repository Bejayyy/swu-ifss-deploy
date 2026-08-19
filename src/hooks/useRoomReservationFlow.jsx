import { useState, useCallback } from 'react';
import SelectRoomModal from '../components/modals/SelectRoomModal';
import EventTypePickerModal from '../components/modals/EventTypePickerModal';
import RoomReservationModal from '../components/modals/RoomReservationModal';

export function useRoomReservationFlow() {
  const [selectRoomOpen, setSelectRoomOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [eventType, setEventType] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [prefill, setPrefill] = useState({});

  // 1. Full 3-step wizard starting with room selection filter
  const startNewReservation = useCallback((initialPrefill = {}) => {
    setPrefill(initialPrefill);
    setSelectedRoom(null);
    setSelectRoomOpen(true);
  }, []);

  // 2. Direct reservation if room is already picked (e.g. from room details page)
  const openReservation = useCallback((roomPrefill = {}) => {
    setPrefill(roomPrefill);
    setPickerOpen(true);
  }, []);

  const closeAll = useCallback(() => {
    setSelectRoomOpen(false);
    setPickerOpen(false);
    setReservationOpen(false);
    setEventType(null);
    setSelectedRoom(null);
    setPrefill({});
  }, []);

  const handleRoomSelected = (room) => {
    setSelectedRoom(room);
    const roomPrefill = {
      building: room.buildingName || '',
      room: room.id || '',
      designatedVenue: `${room.id}${room.buildingName ? `, ${room.buildingName}` : ''}`,
    };
    setPrefill(roomPrefill);
    setSelectRoomOpen(false);
    setPickerOpen(true);
  };

  const handleTypeSelect = (type) => {
    setEventType(type);
    setPickerOpen(false);
    setReservationOpen(true);
  };

  const modals = (
    <>
      {selectRoomOpen && (
        <SelectRoomModal
          isOpen={selectRoomOpen}
          onClose={closeAll}
          onSelectRoom={handleRoomSelected}
        />
      )}
      {pickerOpen && (
        <EventTypePickerModal
          selectedRoom={selectedRoom}
          onClose={closeAll}
          onSelect={handleTypeSelect}
        />
      )}
      {reservationOpen && eventType && (
        <RoomReservationModal
          eventType={eventType}
          prefill={prefill}
          onClose={closeAll}
        />
      )}
    </>
  );

  return { startNewReservation, openReservation, modals };
}
