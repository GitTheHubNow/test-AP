'use client';

import { useState, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface ReactionBarProps {
  memoryId:      string;
  memorialToken: string;
  initialCounts: Record<string, number>;
  initialMine:   string[];   // emojis this visitor has already reacted with
  visitorToken:  string;
  primaryColor:  string;
}

// ── Constants ──────────────────────────────────────────────────────────────

// Curated for memorial context — no party emojis, no thumbs up
export const MEMORIAL_EMOJIS = [
  { emoji: '❤️',  label: 'Love'       },
  { emoji: '🕊️', label: 'Peace'      },
  { emoji: '🙏',  label: 'Gratitude'  },
  { emoji: '💐',  label: 'Flowers'    },
  { emoji: '⭐',  label: 'Light'      },
];

// ── Component ──────────────────────────────────────────────────────────────

export function ReactionBar({
  memoryId,
  memorialToken,
  initialCounts,
  initialMine,
  visitorToken,
  primaryColor,
}: ReactionBarProps) {
  const [counts, setCounts]   = useState<Record<string, number>>(initialCounts);
  const [mine, setMine]       = useState<string[]>(initialMine);
  const [pending, setPending] = useState<string | null>(null);

  const handleReact = useCallback(async (emoji: string) => {
    if (pending) return; // debounce — one at a time
    const alreadyReacted = mine.includes(emoji);
    const method = alreadyReacted ? 'DELETE' : 'POST';

    // Optimistic update
    setCounts(prev => ({
      ...prev,
      [emoji]: Math.max(0, (prev[emoji] ?? 0) + (alreadyReacted ? -1 : 1)),
    }));
    setMine(prev =>
      alreadyReacted ? prev.filter(e => e !== emoji) : [...prev, emoji]
    );

    setPending(emoji);
    try {
      const res = await fetch(
        `/api/public/memorial/${memorialToken}/memory/${memoryId}/react`,
        {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitorToken, emoji }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.counts) {
          // Sync with server truth
          setCounts(json.data.counts);
        }
      } else {
        // Revert on error
        setCounts(prev => ({
          ...prev,
          [emoji]: Math.max(0, (prev[emoji] ?? 0) + (alreadyReacted ? 1 : -1)),
        }));
        setMine(prev =>
          alreadyReacted ? [...prev, emoji] : prev.filter(e => e !== emoji)
        );
      }
    } catch {
      // Revert on network error
      setCounts(prev => ({
        ...prev,
        [emoji]: Math.max(0, (prev[emoji] ?? 0) + (alreadyReacted ? 1 : -1)),
      }));
      setMine(prev =>
        alreadyReacted ? [...prev, emoji] : prev.filter(e => e !== emoji)
      );
    } finally {
      setPending(null);
    }
  }, [pending, mine, memoryId, memorialToken, visitorToken]);

  const totalReactions = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="mt-5 pt-4 border-t border-gray-100">
      <div className="flex items-center gap-1.5 flex-wrap">
        {MEMORIAL_EMOJIS.map(({ emoji, label }) => {
          const count    = counts[emoji] ?? 0;
          const reacted  = mine.includes(emoji);
          const isLoading = pending === emoji;

          return (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              disabled={!!pending}
              title={label}
              aria-label={`${reacted ? 'Remove' : 'Add'} ${label} reaction${count > 0 ? ` (${count})` : ''}`}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm transition-all duration-150 border select-none
                disabled:cursor-wait
                ${reacted
                  ? 'font-medium shadow-sm'
                  : 'border-transparent bg-gray-50 hover:bg-gray-100 text-gray-500'
                }
                ${isLoading ? 'opacity-60 scale-95' : 'hover:scale-105 active:scale-95'}
              `}
              style={reacted ? {
                backgroundColor: primaryColor + '18',
                borderColor:     primaryColor + '55',
                color:           primaryColor,
              } : {}}
            >
              <span className={`text-base leading-none transition-transform ${isLoading ? 'animate-pulse' : ''}`}>
                {emoji}
              </span>
              {count > 0 && (
                <span className="text-xs font-medium tabular-nums leading-none">
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Total reactions — only shown when > 0 */}
        {totalReactions > 0 && (
          <span className="ml-1 text-xs text-gray-300 select-none">
            {totalReactions} {totalReactions === 1 ? 'reaction' : 'reactions'}
          </span>
        )}
      </div>
    </div>
  );
}
