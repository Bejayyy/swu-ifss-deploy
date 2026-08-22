import { useEffect, useMemo, useState } from 'react';
import { subscribeSchoolYears, subscribeCalendarBundle } from '../services/academicCalendarService';
import { normalizeExamPeriods } from '../utils/academicCalendarUtils';

export function useAcademicCalendar(preferredSchoolYearId = null) {
  const [schoolYears, setSchoolYears] = useState([]);
  const [activeSchoolYearId, setActiveSchoolYearId] = useState(preferredSchoolYearId);
  const [bundle, setBundle] = useState({ config: null, holidays: [], noClassPeriods: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = subscribeSchoolYears(
      (list) => {
        setSchoolYears(list);
        setLoading(false);
        setActiveSchoolYearId((prev) => prev || (list.length ? list[0].id : null));
      },
      (err) => {
        setError(err.message || 'Failed to load school years.');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!activeSchoolYearId) {
      setBundle({ config: null, holidays: [], noClassPeriods: [] });
      return undefined;
    }
    const unsub = subscribeCalendarBundle(
      activeSchoolYearId,
      setBundle,
      (err) => setError(err.message || 'Failed to load calendar data.'),
    );
    return unsub;
  }, [activeSchoolYearId]);

  const calendarData = useMemo(
    () => ({
      config: bundle.config,
      holidays: bundle.holidays || [],
      noClassPeriods: bundle.noClassPeriods || [],
      events: bundle.events || [],
      examPeriods: normalizeExamPeriods(bundle.config?.examPeriods),
    }),
    [bundle],
  );

  return {
    schoolYears,
    activeSchoolYearId,
    setActiveSchoolYearId,
    calendarData,
    loading,
    error,
  };
}
