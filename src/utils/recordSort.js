export function recordTimestamp(record = {}) {
  const value = record.createdAt || record.dateCreated || record.submittedAt || record.dateFiled || record.updatedAt;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000);
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function compareNewestFirst(a, b) {
  const timeDifference = recordTimestamp(b) - recordTimestamp(a);
  if (timeDifference !== 0) return timeDifference;
  return String(b?.id || b?.uid || '').localeCompare(String(a?.id || a?.uid || ''));
}
