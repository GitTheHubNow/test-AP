'use client';

import { useEffect, useState } from 'react';
import { Users, CheckCircle, Clock, XCircle, Image } from 'lucide-react';

interface Stats {
  totalMemories: number;
  pendingMemories: number;
  approvedMemories: number;
  rejectedMemories: number;
  totalPhotos: number;
  pendingPhotos: number;
  approvedPhotos: number;
  recentSubmissions: number;
}

interface DashboardStatsProps {
  memorialId: string;
}

/**
 * Dashboard Statistics Component
 * 
 * Phase 3A - Feature 3
 * Displays memorial statistics
 */
export function DashboardStats({ memorialId }: DashboardStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/memorial/${memorialId}/stats`);
      const result = await response.json();

      if (result.success && result.data) {
        setStats(result.data);
      } else {
        setError('Failed to load statistics');
      }
    } catch (err) {
      console.error('Stats fetch error:', err);
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [memorialId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error || 'Failed to load statistics'}</p>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Total Memories',
      value: stats.totalMemories,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Pending Review',
      value: stats.pendingMemories,
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      highlight: stats.pendingMemories > 0,
    },
    {
      label: 'Approved',
      value: stats.approvedMemories,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      label: 'Photos',
      value: stats.totalPhotos,
      icon: Image,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div>
      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className={`bg-white rounded-lg border ${
                stat.highlight
                  ? 'border-yellow-300 shadow-sm'
                  : 'border-gray-200'
              } p-6 transition-all hover:shadow-md`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600">
                  {stat.label}
                </span>
                <div className={`${stat.bgColor} p-2 rounded-lg`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
              <div className="text-3xl font-bold text-gray-900">
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Last 7 Days</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">
            {stats.recentSubmissions} {stats.recentSubmissions === 1 ? 'submission' : 'submissions'}
          </div>
        </div>

        {/* Photo Stats */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Photos Pending</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">
            {stats.pendingPhotos}
          </div>
        </div>

        {/* Approval Rate */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Approval Rate</div>
          <div className="text-2xl font-semibold text-gray-900 mt-1">
            {stats.totalMemories > 0
              ? Math.round((stats.approvedMemories / stats.totalMemories) * 100)
              : 0}
            %
          </div>
        </div>
      </div>

      {/* Quick Actions Reminder */}
      {stats.pendingMemories > 0 && (
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Action needed:</strong> You have {stats.pendingMemories}{' '}
            {stats.pendingMemories === 1 ? 'memory' : 'memories'} waiting for review.
          </p>
        </div>
      )}
    </div>
  );
}
