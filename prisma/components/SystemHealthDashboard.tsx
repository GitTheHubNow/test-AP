'use client';

import { useEffect, useState } from 'react';

interface SystemHealth {
  timestamp: Date;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  checks: {
    database: HealthCheck;
    auditTrail: HealthCheck;
    immutability: HealthCheck;
    deleteProtection: HealthCheck;
  };
  metrics: {
    totalMemorials: number;
    totalMemories: number;
    totalAuditEvents: number;
    sealedMemorials: number;
    sealedMemories: number;
  };
}

interface HealthCheck {
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

export function SystemHealthDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError(false);

      const response = await fetch('/api/system/health');
      
      if (!response.ok) {
        setError(true);
        return;
      }

      const data = await response.json();
      setHealth(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Loading system health...</p>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-900 font-medium mb-2">System Health Check Failed</p>
        <button
          onClick={fetchHealth}
          className="text-red-700 text-sm hover:text-red-900"
        >
          Retry
        </button>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'HEALTHY':
      case 'PASS':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'WARNING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'CRITICAL':
      case 'FAIL':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className={`border rounded-lg p-6 ${getStatusColor(health.status)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">System Status</h2>
            <p className="text-sm mt-1">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </p>
          </div>
          <div className="text-4xl font-bold">{health.status}</div>
        </div>
      </div>

      {/* Health Checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(health.checks).map(([name, check]) => (
          <div
            key={name}
            className={`border rounded-lg p-4 ${getStatusColor(check.status)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold capitalize">
                {name.replace(/([A-Z])/g, ' $1').trim()}
              </h3>
              <span className="font-bold">{check.status}</span>
            </div>
            <p className="text-sm">{check.message}</p>
            {check.details && (
              <pre className="text-xs mt-2 p-2 bg-white bg-opacity-50 rounded overflow-auto">
                {JSON.stringify(check.details, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* Metrics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold mb-4">System Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">
              {health.metrics.totalMemorials}
            </div>
            <div className="text-sm text-gray-500">Memorials</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">
              {health.metrics.totalMemories}
            </div>
            <div className="text-sm text-gray-500">Memories</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">
              {health.metrics.totalAuditEvents}
            </div>
            <div className="text-sm text-gray-500">Audit Events</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">
              {health.metrics.sealedMemorials}
            </div>
            <div className="text-sm text-gray-500">Sealed Memorials</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">
              {health.metrics.sealedMemories}
            </div>
            <div className="text-sm text-gray-500">Sealed Memories</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={fetchHealth}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          Refresh Now
        </button>
      </div>
    </div>
  );
}