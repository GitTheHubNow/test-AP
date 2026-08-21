'use client';

/**
 * components/dashboard/StatsCard.tsx
 *
 * Fetches and renders the 4 dashboard stat cards.
 * Self-contained — no props required.
 *
 * Drop into any dashboard page:
 *   import { StatsCard } from '@/components/dashboard/StatsCard'
 *   <StatsCard />
 *
 * Phase 3A - Feature 2
 */

import { useEffect, useState } from 'react';
import {
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

interface Stats {
  totalMemorials:   number;
  approvedMemories: number;
  pendingMemories:  number;
  totalMedia:       number;
}

type LoadState = 'loading' | 'loaded' | 'error';

interface CardConfig {
  label:       string;
  value:       number;
  icon:        React.ElementType;
  iconBg:      string;
  iconColor:   string;
  description: string;
}

function buildCards(stats: Stats): CardConfig[] {
  return [
    {
      label:       'Total Memorials',
      value:       stats.totalMemorials,
      icon:        BookOpenIcon,
      iconBg:      'bg-indigo-50',
      iconColor:   'text-indigo-600',
      description: 'Memorials you have created',
    },
    {
      label:       'Approved Memories',
      value:       stats.approvedMemories,
      icon:        CheckCircleIcon,
      iconBg:      'bg-green-50',
      iconColor:   'text-green-600',
      description: 'Memories visible to the public',
    },
    {
      label:       'Pending Review',
      value:       stats.pendingMemories,
      icon:        ClockIcon,
      iconBg:      'bg-amber-50',
      iconColor:   'text-amber-600',
      description: 'Memories awaiting your approval',
    },
    {
      label:       'Media Uploads',
      value:       stats.totalMedia,
      icon:        PhotoIcon,
      iconBg:      'bg-sky-50',
      iconColor:   'text-sky-600',
      description: 'Photos and videos across all memorials',
    },
  ];
}

function Skeleton() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-lg bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 rounded bg-gray-100" />
          <div className="h-6 w-12 rounded bg-gray-200" />
        </div>
      </div>
      <div className="mt-3 h-3 w-36 rounded bg-gray-100" />
    </div>
  );
}

function Card({ config }: { config: CardConfig }) {
  const Icon = config.icon;
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-4">
        <div className={`flex-shrink-0 rounded-lg p-3 ${config.iconBg}`}>
          <Icon className={`h-6 w-6 ${config.iconColor}`} aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{config.label}</p>
          <p className="mt-0.5 text-2xl font-semibold text-gray-900">
            {config.value.toLocaleString()}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-400">{config.description}</p>
    </div>
  );
}

export function StatsCard() {
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res  = await fetch('/api/dashboard/stats');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) throw new Error(json.error ?? 'Failed');
        setStats(json.data);
        setLoadState('loaded');
      } catch (err) {
        if (!cancelled) {
          console.error('[StatsCard]', err);
          setLoadState('error');
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loadState === 'loading') {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} />)}
      </div>
    );
  }

  if (loadState === 'error' || !stats) {
    return (
      <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3">
        <p className="text-sm text-red-600">
          Could not load stats — please refresh the page.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {buildCards(stats).map((c) => <Card key={c.label} config={c} />)}
    </div>
  );
}
