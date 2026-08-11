'use client';

import { useEffect, useState } from 'react';

// Kept in sync by hand with lib/performance.ts's PerformanceMetrics export.
// (Not imported directly — this is a client component and that file has
// server-only Prisma calls.)
interface PerformanceMetrics {
  timestamp: string;
  databaseResponseTime: number;
  activeMemorials: number;
  pendingModerations: number;
  todaySubmissions: number;
  auditTrail: {
    totalEvents: number;
    eventsLast24h: number;
    eventsPerMinute: number;
  };
  entities: {
    totalMemorials: number;
    totalMemories: number;
    sealedPercentage: number;
  };
}

export function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/system/performance');
      if (response.status === 403) {
        setError('Platform admin access required.');
        return;
      }
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
        setError(null);
      } else {
        setError('Failed to load metrics.');
      }
    } catch (err) {
      console.error('Failed to fetch metrics:', err);
      setError('Failed to load metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div>Loading metrics...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-900 font-medium">{error}</p>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Performance Metrics</h2>

      {/* Live Snapshot */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Live Snapshot</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.databaseResponseTime} ms
            </div>
            <div className="text-sm text-gray-500">DB Response Time</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.activeMemorials.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Active Memorials</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.pendingModerations.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Pending Moderations</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.todaySubmissions.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Submissions (24h)</div>
          </div>
        </div>
      </div>

      {/* Audit Trail Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Audit Trail</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.auditTrail.totalEvents.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Total Events</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.auditTrail.eventsLast24h.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Last 24 Hours</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.auditTrail.eventsPerMinute.toFixed(2)}
            </div>
            <div className="text-sm text-gray-500">Avg Events/Minute (24h)</div>
          </div>
        </div>
      </div>

      {/* Entity Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Entities</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.entities.totalMemorials.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Memorials</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {metrics.entities.totalMemories.toLocaleString()}
            </div>
            <div className="text-sm text-gray-500">Memories</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {metrics.entities.sealedPercentage.toFixed(1)}%
            </div>
            <div className="text-sm text-gray-500">Sealed</div>
          </div>
        </div>
      </div>
    </div>
  );
}
