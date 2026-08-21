'use client';

import { useState } from 'react';

interface AppearanceSettingsFormProps {
  memorialId: string;
  isLocked:   boolean;
  initialData: {
    primaryColor:    string;
    backgroundColor: string;
    fontFamily:      string;
    showTimeline:    boolean;
    showGallery:     boolean;
    showGuestBook:   boolean;
    showMemoryCount: boolean;
    guestBookTitle:  string;
    guestBookPrompt: string;
  };
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// Preset colour palettes — warm tones appropriate for memorial context
const COLOR_PRESETS = [
  { label: 'Warm Stone',   primary: '#7c6d5a', background: '#faf8f5' },
  { label: 'Deep Navy',    primary: '#1e3a5f', background: '#f0f4f8' },
  { label: 'Sage Green',   primary: '#4a7c59', background: '#f4f8f5' },
  { label: 'Dusty Rose',   primary: '#9b6b7a', background: '#fdf5f7' },
  { label: 'Slate Grey',   primary: '#4a5568', background: '#f7f8f9' },
  { label: 'Warm Burgundy',primary: '#7b2d42', background: '#fdf4f5' },
];

const FONT_OPTIONS = [
  { value: 'Georgia, serif',            label: 'Georgia (Classic Serif)' },
  { value: '"Times New Roman", serif',  label: 'Times New Roman' },
  { value: 'Palatino, serif',           label: 'Palatino (Elegant)' },
  { value: 'system-ui, sans-serif',     label: 'System (Modern Sans)' },
];

/**
 * AppearanceSettingsForm
 *
 * Manages MemorialSettings: colours, font, visibility toggles,
 * guest book label overrides.
 *
 * Phase 5B
 */
export function AppearanceSettingsForm({
  memorialId,
  isLocked,
  initialData,
}: AppearanceSettingsFormProps) {
  const [form, setForm]         = useState(initialData);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialData);

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: typeof COLOR_PRESETS[0]) {
    setForm(prev => ({
      ...prev,
      primaryColor:    preset.primary,
      backgroundColor: preset.background,
    }));
  }

  async function handleSave() {
    setSaveState('saving');
    setErrorMessage('');

    try {
      const res = await fetch(
        `/api/memorial/${memorialId}/settings/appearance`,
        {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            primaryColor:    form.primaryColor,
            backgroundColor: form.backgroundColor,
            fontFamily:      form.fontFamily,
            showTimeline:    form.showTimeline,
            showGallery:     form.showGallery,
            showGuestBook:   form.showGuestBook,
            showMemoryCount: form.showMemoryCount,
            guestBookTitle:  form.guestBookTitle  || null,
            guestBookPrompt: form.guestBookPrompt || null,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'Failed to save appearance settings');
      }

      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2500);

    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
      setSaveState('error');
      setTimeout(() => setSaveState('idle'), 4000);
    }
  }

  // ── Shared input styles ──────────────────────────────────────────────────
  const inputBase =
    'block w-full rounded-md border border-gray-300 px-3 py-2 text-sm ' +
    'text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ' +
    'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed';

  const labelBase = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="space-y-8">

      {isLocked && (
        <div className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-600">
            Appearance settings cannot be changed while the memorial is locked.
          </p>
        </div>
      )}

      {/* ── Colour presets ─────────────────────────────────────────────── */}
      <div>
        <p className={labelBase}>Colour theme</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {COLOR_PRESETS.map(preset => {
            const isActive =
              form.primaryColor    === preset.primary &&
              form.backgroundColor === preset.background;
            return (
              <button
                key={preset.label}
                type="button"
                disabled={isLocked}
                onClick={() => applyPreset(preset)}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  isActive
                    ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                {/* Colour swatch */}
                <span className="flex-shrink-0 flex gap-1">
                  <span
                    className="w-4 h-4 rounded-full border border-gray-200"
                    style={{ backgroundColor: preset.primary }}
                  />
                  <span
                    className="w-4 h-4 rounded-full border border-gray-200"
                    style={{ backgroundColor: preset.background }}
                  />
                </span>
                <span className="text-gray-700 font-medium truncate">{preset.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom colour pickers */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelBase}>Primary colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.primaryColor}
                onChange={e => set('primaryColor', e.target.value)}
                disabled={isLocked}
                className="h-9 w-14 rounded border border-gray-300 p-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <input
                type="text"
                value={form.primaryColor}
                onChange={e => set('primaryColor', e.target.value)}
                disabled={isLocked}
                maxLength={7}
                className={inputBase + ' font-mono uppercase'}
                placeholder="#7c6d5a"
              />
            </div>
          </div>
          <div>
            <label className={labelBase}>Background colour</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.backgroundColor}
                onChange={e => set('backgroundColor', e.target.value)}
                disabled={isLocked}
                className="h-9 w-14 rounded border border-gray-300 p-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <input
                type="text"
                value={form.backgroundColor}
                onChange={e => set('backgroundColor', e.target.value)}
                disabled={isLocked}
                maxLength={7}
                className={inputBase + ' font-mono uppercase'}
                placeholder="#faf8f5"
              />
            </div>
          </div>
        </div>

        {/* Live preview swatch */}
        <div
          className="mt-4 rounded-lg p-4 border border-gray-100 flex items-center gap-3"
          style={{ backgroundColor: form.backgroundColor }}
        >
          <div
            className="w-8 h-8 rounded-full flex-shrink-0"
            style={{ backgroundColor: form.primaryColor }}
          />
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: form.primaryColor, fontFamily: form.fontFamily }}
            >
              In Loving Memory
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: '#4a4035', fontFamily: form.fontFamily }}
            >
              This is how text will appear on the memorial page.
            </p>
          </div>
        </div>
      </div>

      {/* ── Font ───────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="fontFamily" className={labelBase}>Font style</label>
        <select
          id="fontFamily"
          value={form.fontFamily}
          onChange={e => set('fontFamily', e.target.value)}
          disabled={isLocked}
          className={inputBase}
        >
          {FONT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── Visibility toggles ─────────────────────────────────────────── */}
      <div>
        <p className={labelBase}>Visible sections</p>
        <p className="text-xs text-gray-500 mb-3">
          Control which sections visitors can see on the memorial page.
        </p>
        <div className="space-y-3">
          {([
            { key: 'showTimeline',    label: 'Memories tab',    description: 'Show the memories timeline' },
            { key: 'showGallery',     label: 'Gallery tab',     description: 'Show the photo gallery' },
            { key: 'showGuestBook',   label: 'Guest Book tab',  description: 'Allow visitors to sign the guest book' },
            { key: 'showMemoryCount', label: 'Memory count',    description: 'Show the count of memories in the hero' },
          ] as const).map(({ key, label, description }) => (
            <label
              key={key}
              className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={form[key]}
                onChange={e => set(key, e.target.checked)}
                disabled={isLocked}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ── Guest book label overrides ─────────────────────────────────── */}
      {form.showGuestBook && (
        <div className="space-y-4 rounded-lg bg-gray-50 p-4 border border-gray-100">
          <p className="text-sm font-medium text-gray-700">Guest book customisation</p>
          <div>
            <label htmlFor="guestBookTitle" className={labelBase}>
              Tab label{' '}
              <span className="text-gray-400 font-normal">(default: "Guest Book")</span>
            </label>
            <input
              type="text"
              id="guestBookTitle"
              value={form.guestBookTitle}
              onChange={e => set('guestBookTitle', e.target.value)}
              disabled={isLocked}
              maxLength={50}
              placeholder="Guest Book"
              className={inputBase}
            />
          </div>
          <div>
            <label htmlFor="guestBookPrompt" className={labelBase}>
              Submission prompt{' '}
              <span className="text-gray-400 font-normal">(default: "Leave a short message of remembrance.")</span>
            </label>
            <input
              type="text"
              id="guestBookPrompt"
              value={form.guestBookPrompt}
              onChange={e => set('guestBookPrompt', e.target.value)}
              disabled={isLocked}
              maxLength={150}
              placeholder="Leave a short message of remembrance."
              className={inputBase}
            />
          </div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {saveState === 'error' && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* ── Save button ────────────────────────────────────────────────── */}
      {!isLocked && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveState === 'saving'}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all disabled:cursor-not-allowed ${
              saveState === 'saved'
                ? 'bg-green-600 text-white'
                : saveState === 'saving'
                  ? 'bg-indigo-400 text-white cursor-wait'
                  : isDirty
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-100 text-gray-400'
            }`}
          >
            {saveState === 'saving' ? 'Saving…'
              : saveState === 'saved' ? '✓ Saved'
              : 'Save Appearance'}
          </button>
        </div>
      )}

    </div>
  );
}
