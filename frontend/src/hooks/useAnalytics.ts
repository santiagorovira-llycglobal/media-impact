import { useState, useCallback } from 'react';
import type { AnalyticsState, ApiResponse } from '../types';

const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:8080' 
  : '';

export const useAnalytics = () => {
  const [state, setState] = useState<AnalyticsState>({
    market: 'all',
    days: 30,
    from: '2025-04-01',
    to: '2025-04-30',
    connection_id: '',
    property_id: '',
  });

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (overrides?: Partial<AnalyticsState>) => {
    const currentState = { ...state, ...overrides };
    if (!currentState.connection_id && !currentState.property_id) return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/mcp-analytics/run-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: currentState.connection_id,
          property_id: currentState.property_id,
          session_id: currentState.session_id,
          start_date: currentState.from,
          end_date: currentState.to,
          market: currentState.market
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'API Error');
      }

      const result = await response.json();
      setData(result);
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError(err.message);
      // Fallback or keep old data
    } finally {
      setLoading(false);
    }
  }, [state]);

  const updateState = (updates: Partial<AnalyticsState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  return { state, data, loading, error, fetchData, updateState };
};
