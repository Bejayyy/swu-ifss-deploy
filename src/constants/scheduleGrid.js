export const SCHEDULE_TYPE_COLORS = {
  Lecture: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  Laboratory: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  Reservation: { bg: '#F3E8FF', text: '#6B21A8', border: '#D8B4FE' },
  'Reservation (Academic)': { bg: '#F3E8FF', text: '#6B21A8', border: '#D8B4FE' },
  'Reservation (Non-Academic)': { bg: '#E0E7FF', text: '#3730A3', border: '#A5B4FC' },
  Maintenance: { bg: '#FFEDD5', text: '#C2410C', border: '#FDBA74' },
  CAS: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
};

export const SCHEDULE_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export const SCHEDULE_CELL_HEIGHT = 36;
export const SCHEDULE_START_HOUR = 6;
export const SCHEDULE_END_HOUR = 20;
export const SCHEDULE_SLOT_COUNT = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 2;

export function formatScheduleHour(hour) {
  const totalMins = Math.round(hour * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function slotIndexToHour(slotIndex) {
  return SCHEDULE_START_HOUR + slotIndex * 0.5;
}

export function hourToSlotIndex(hour) {
  return Math.round((hour - SCHEDULE_START_HOUR) * 2);
}

export function hourToTimeInput(hour) {
  const totalMins = Math.round(hour * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function gridTotalHeightPx() {
  return SCHEDULE_SLOT_COUNT * SCHEDULE_CELL_HEIGHT;
}

export function blockTopPx(startHour) {
  // Convert hour to number of 30-minute slots, then multiply by cell height
  // For startHour=8: (8-6) * 2 slots/hour = 4 slots
  // 4 slots * 48px/slot = 192px ✓
  const slotsFromStart = (startHour - SCHEDULE_START_HOUR) * 2;
  return slotsFromStart * SCHEDULE_CELL_HEIGHT;
}

export function blockHeightPx(startHour, endHour) {
  // The end time is a boundary, not another occupied 30-minute row.
  const hours = Math.max(0, endHour - startHour);
  const slots = Math.max(1, Math.round(hours * 2));
  return slots * SCHEDULE_CELL_HEIGHT;
}

export function clampScheduleHours(startHour, endHour) {
  const start = Math.max(SCHEDULE_START_HOUR, Math.min(startHour, SCHEDULE_END_HOUR));
  const end = Math.max(start + 0.5, Math.min(endHour, SCHEDULE_END_HOUR));
  return { start, end };
}

export function addDays(date, daysToAdd) {
  const d = new Date(date);
  d.setDate(d.getDate() + daysToAdd);
  return d;
}

export function formatWeekRange(startDate) {
  const endDate = addDays(startDate, 6);
  const monthOpts = { month: 'short' };
  const startMonth = startDate.toLocaleString('en-US', monthOpts);
  const endMonth = endDate.toLocaleString('en-US', monthOpts);
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  if (sameMonth) {
    return `${startMonth} ${startDate.getDate()} - ${endDate.getDate()}`;
  }
  return `${startMonth} ${startDate.getDate()} - ${endMonth} ${endDate.getDate()}`;
}
