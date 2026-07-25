export const SCHEDULE_TYPE_COLORS = {
  CAS: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  Lecture: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  Laboratory: { bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
};

export const SCHEDULE_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export const SCHEDULE_CELL_HEIGHT = 48;
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
  // Calculate the number of 30-minute slots needed
  const hours = endHour - startHour;
  const slots = hours * 2; // 2 slots per hour
  
  // Add one full slot height (48px) to make blocks reach the end time
  // This accounts for the visual offset between slot boundaries and time labels
  const heightPx = slots * SCHEDULE_CELL_HEIGHT + SCHEDULE_CELL_HEIGHT;
  
  return Math.max(heightPx, SCHEDULE_CELL_HEIGHT / 2);
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
