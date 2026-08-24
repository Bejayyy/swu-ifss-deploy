import { useEffect, useMemo, useState, useCallback } from 'react';
import { subscribeSchoolYears, subscribeCalendarBundle } from '../services/academicCalendarService';
import { normalizeExamPeriods } from '../utils/academicCalendarUtils';
import { resolveActiveSchoolYearId, setStoredActiveSchoolYearId } from '../utils/schoolYearResolver';

export function useAcademicCalendar(preferredSchoolYearId = null) {
  const [schoolYears, setSchoolYears] = useState([]);
  const [activeSchoolYearId, setActiveSchoolYearIdState] = useState(preferredSchoolYearId);
  const [bundle, setBundle] = useState({ config: null, holidays: [], noClassPeriods: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Setter that updates state, localStorage, and broadcasts to other components
  const setActiveSchoolYearId = useCallback((id) => {
    setActiveSchoolYearIdState(id);
    setStoredActiveSchoolYearId(id);
  }, []);

  // Listen to global school year change events from other components/pages
  useEffect(() => {
    const handleGlobalChange = (e) => {
      const newId = e.detail;
      if (newId && newId !== activeSchoolYearId) {
        setActiveSchoolYearIdState(newId);
      }
    };

    window.addEventListener('swu_active_school_year_changed', handleGlobalChange);
    return () => {
      window.removeEventListener('swu_active_school_year_changed', handleGlobalChange);
    };
  }, [activeSchoolYearId]);

  // Subscribe to real-time school years collection
  useEffect(() => {
    const unsub = subscribeSchoolYears(
      (list) => {
        setSchoolYears(list);
        setLoading(false);

        // Determine active school year based on date resolution
        setActiveSchoolYearIdState((currentActive) => {
          if (preferredSchoolYearId && list.some((sy) => sy.id === preferredSchoolYearId)) {
            return preferredSchoolYearId;
          }
          if (currentActive && list.some((sy) => sy.id === currentActive)) {
            return currentActive;
          }
          return resolveActiveSchoolYearId(list, new Date());
        });
      },
      (err) => {
        setError(err.message || 'Failed to load school years.');
        setLoading(false);
      },
    );
    return unsub;
  }, [preferredSchoolYearId]);

  // Subscribe to calendar bundle whenever activeSchoolYearId changes
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
