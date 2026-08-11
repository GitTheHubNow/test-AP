'use client';

import { useState, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface TopMemory {
  id:             string;
  authorName:     string | null;
  excerpt:        string;
  featured:       boolean;
  totalReactions: number;
  emojiCounts:    Record<string, number>;
}

interface AnalyticsData {
  totalViews:     number;
  uniqueVisitors: number;
  viewsByDay:     Record<string, number>;
  referrers:      { source: string; count: number }[];
  topMemories:    TopMemory[];
}

const REFERRER_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email:    'Email',
  sms:      'SMS',
  direct:   'Direct / QR scan',
};

const REFERRER_COLORS: Record<string, string> = {
  whatsapp: '#25d366',
  email:    '#4f46e5',
  sms:      '#0891b2',
  direct:   '#9ca3af',
};

// ── Sparkline bar chart ────────────────────────────────────────────────────

function ViewsChart({ viewsByDay }: { viewsByDay: Record<string, number> }) {
  const entries = Object.entries(viewsByDay); // [YYYY-MM-DD, count][]
  const max     = Math.max(...entries.map(([, v]) => v), 1);

  // Show every 7th label to avoid crowding
  const labelIndices = new Set([0, 6, 13, 20, 27, entries.length - 1]);

  return (
    <div>
      <div className="flex items-end gap-0.5 h-24">
        {entries.map(([date, count], i) => {
          const pct     = (count / max) * 100;
          const isToday = i === entries.length - 1;
          return (
            <div
              key={date}
              className="flex-1 flex flex-col items-center justify-end group relative"
              title={`${date}: ${count} view${count !== 1 ? 's' : ''}`}
            >
              <div
                className="w-full rounded-t transition-all duration-200 group-hover:opacity-80"
                style={{
                  height:          `${Math.max(pct, 2)}%`,
                  backgroundColor: isToday ? '#4f46e5' : '#c7d2fe',
                  minHeight:       count > 0 ? '3px' : '1px',
                }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {count}
              </div>
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex mt-2">
        {entries.map(([date], i) => (
          <div key={date} className="flex-1 text-center">
            {labelIndices.has(i) && (
              <span className="text-[9px] text-gray-400">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-5">
      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function AnalyticsPanel({ memorialId }: { memorialId: string }) {
  const [data,    setData]    = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/memorial/${memorialId}/analytics`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data);
        else setError(json.error ?? 'Failed to load analytics');
      })
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [memorialId]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <div key={i} className="h-24 bg-gray-100 rounded-xl" />)}
        </div>
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">{error ?? 'No data available'}</p>
      </div>
    );
  }

  const totalReactions = data.topMemories.reduce((sum, m) => sum + m.totalReactions, 0);
  const last30Views    = Object.values(data.viewsByDay).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">

      {/* ── Stat cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Views"        value={data.totalViews.toLocaleString()} />
        <StatCard label="Unique Visitors"    value={data.uniqueVisitors.toLocaleString()} />
        <StatCard label="Views (30 days)"    value={last30Views.toLocaleString()} />
        <StatCard label="Total Reactions"    value={totalReactions.toLocaleString()} />
      </div>

      {/* ── Views over time ──────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">
          Views — Last 30 Days
        </h2>
        <div className="bg-gray-50 rounded-xl p-5">
          <ViewsChart viewsByDay={data.viewsByDay} />
        </div>
      </div>

      {/* ── Referrer breakdown ───────────────────────────────────────── */}
      {data.referrers.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">
            How People Found This Memorial
          </h2>
          <div className="space-y-3">
            {data.referrers.map(r => {
              const total = data.referrers.reduce((a, b) => a + b.count, 0);
              const pct   = total > 0 ? Math.round((r.count / total) * 100) : 0;
              return (
                <div key={r.source} className="flex items-center gap-3">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: REFERRER_COLORS[r.source] ?? '#9ca3af' }}
                  />
                  <span className="text-sm text-gray-600 w-36 flex-shrink-0">
                    {REFERRER_LABELS[r.source] ?? r.source}
                  </span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width:           `${pct}%`,
                        backgroundColor: REFERRER_COLORS[r.source] ?? '#9ca3af',
                      }}
                    />
                  </div>
                  <span className="text-sm text-gray-500 w-16 text-right flex-shrink-0">
                    {r.count} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Top memories by reactions ────────────────────────────────── */}
      {data.topMemories.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">
            Top Memories by Reactions
          </h2>
          <div className="space-y-3">
            {data.topMemories.map((memory, i) => (
              <div
                key={memory.id}
                className={`flex items-start gap-4 rounded-xl p-4 ${
                  i === 0 ? 'bg-indigo-50 border border-indigo-100' : 'bg-gray-50'
                }`}
              >
                {/* Rank */}
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {i + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-900">
                      {memory.authorName || 'Anonymous'}
                    </p>
                    {memory.featured && (
                      <span className="text-xs text-amber-600">★ Featured</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                    {memory.excerpt}
                  </p>
                </div>

                {/* Reaction summary */}
                <div className="flex-shrink-0 text-right">
                  <p className="text-lg font-bold text-gray-900">{memory.totalReactions}</p>
                  <div className="flex gap-0.5 justify-end mt-0.5">
                    {Object.entries(memory.emojiCounts)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 3)
                      .map(([emoji, count]) => (
                        <span key={emoji} className="text-xs" title={`${count} ${emoji}`}>
                          {emoji}
                        </span>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state — no views yet */}
      {data.totalViews === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-xl">
          <p className="text-gray-400">No visits recorded yet.</p>
          <p className="text-sm text-gray-300 mt-1">Share the memorial link or QR code to get started.</p>
        </div>
      )}

    </div>
  );
}
