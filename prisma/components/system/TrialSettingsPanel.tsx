'use client';

import { useEffect, useState } from 'react';

interface TrialSettings {
  id: string;
  trialDays: number;
  promoActive: boolean;
  promoLabel: string | null;
  updatedAt: string;
}

/**
 * TrialSettingsPanel
 *
 * Platform-admin-only control for the free-trial length applied to new
 * Stripe Checkout subscriptions, plus an on/off switch for a promo label
 * shown on the pricing/signup UI (e.g. "Launch special — 2 months free").
 *
 * See app/api/system/trial-settings/route.ts for the API this talks to,
 * and app/api/billing/checkout/route.ts for where trialDays is actually
 * consumed at checkout time.
 */
export function TrialSettingsPanel() {
  const [settings, setSettings] = useState<TrialSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Local editable copies — only pushed to the server on explicit Save,
  // so the admin can type a new value without every keystroke firing a
  // PATCH request.
  const [trialDaysInput, setTrialDaysInput] = useState('');
  const [promoActiveInput, setPromoActiveInput] = useState(false);
  const [promoLabelInput, setPromoLabelInput] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/system/trial-settings');
      if (!res.ok) {
        setError('Failed to load settings');
        return;
      }
      const json = await res.json();
      const data: TrialSettings = json.data;
      setSettings(data);
      setTrialDaysInput(String(data.trialDays));
      setPromoActiveInput(data.promoActive);
      setPromoLabelInput(data.promoLabel ?? '');
    } catch {
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    const parsedDays = parseInt(trialDaysInput, 10);
    if (!Number.isInteger(parsedDays) || parsedDays < 0 || parsedDays > 365) {
      setError('Trial days must be a whole number between 0 and 365');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/system/trial-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialDays: parsedDays,
          promoActive: promoActiveInput,
          promoLabel: promoLabelInput.trim() || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? 'Failed to save settings');
        return;
      }

      const json = await res.json();
      setSettings(json.data);
      setSavedAt(Date.now());
    } catch {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Trial &amp; Promo Settings</h2>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Trial &amp; Promo Settings</h2>
      <p className="text-sm text-gray-500 mb-6">
        Controls the free-trial length applied to new sign-ups at checkout.
        Card details are always collected up front regardless of trial
        length — this only changes how long before the first charge.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="trialDays" className="block text-sm font-medium text-gray-700 mb-1">
            Trial length (days)
          </label>
          <input
            id="trialDays"
            type="number"
            min={0}
            max={365}
            value={trialDaysInput}
            onChange={(e) => setTrialDaysInput(e.target.value)}
            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Default is 30. New Checkout sessions created after saving will use this value —
            it does not change trials already in progress.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <input
            id="promoActive"
            type="checkbox"
            checked={promoActiveInput}
            onChange={(e) => setPromoActiveInput(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1">
            <label htmlFor="promoActive" className="block text-sm font-medium text-gray-700">
              Show promo label on pricing / sign-up
            </label>
            <input
              type="text"
              value={promoLabelInput}
              onChange={(e) => setPromoLabelInput(e.target.value)}
              disabled={!promoActiveInput}
              placeholder='e.g. "Launch special — 2 months free"'
              className="mt-2 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Turning this off hides the label but does not change the trial length above —
              update trial length separately if you want it to reset too.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {savedAt && Date.now() - savedAt < 3000 && (
            <span className="text-sm text-green-600">Saved</span>
          )}
        </div>

        {settings && (
          <p className="text-xs text-gray-400 pt-2">
            Last updated {new Date(settings.updatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </div>
  );
}
