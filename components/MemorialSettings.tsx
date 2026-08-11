'use client';

// ⚠️ SUPERSEDED — not imported by any live page. The real Settings page
// uses components/MemorialSettingsForm.tsx instead, which correctly
// calls PATCH /api/memorial/[memorialId] (not this component's target,
// /api/memorial/[memorialId]/settings, which was itself broken until
// the pre-launch audit fix — see that route's header comment). Left in
// place, not deleted, per the same approach used for other dead files
// found during the audit.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';

interface Memorial {
  id: string;
  title: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  dateOfDeath: string | null;
  biography: string | null;
  readOnly: boolean;
}

interface MemorialSettingsProps {
  memorial: Memorial;
}

/**
 * Memorial Settings Component
 * 
 * Phase 3A - Feature 4
 * Edit memorial details
 */
export function MemorialSettings({ memorial }: MemorialSettingsProps) {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: memorial.firstName,
    lastName: memorial.lastName,
    dateOfBirth: memorial.dateOfBirth || '',
    dateOfDeath: memorial.dateOfDeath || '',
    biography: memorial.biography || '',
    readOnly: memorial.readOnly,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch(`/api/memorial/${memorial.id}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(true);
        router.refresh();
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || 'Failed to save changes');
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">
            ✓ Settings saved successfully
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Basic Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Basic Information
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* First Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name *
            </label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) =>
                setFormData({ ...formData, firstName: e.target.value })
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Last Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name *
            </label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) =>
                setFormData({ ...formData, lastName: e.target.value })
              }
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date of Birth
            </label>
            <input
              type="date"
              value={formData.dateOfBirth}
              onChange={(e) =>
                setFormData({ ...formData, dateOfBirth: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Date of Death */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date of Death
            </label>
            <input
              type="date"
              value={formData.dateOfDeath}
              onChange={(e) =>
                setFormData({ ...formData, dateOfDeath: e.target.value })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Biography */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Biography
          </label>
          <textarea
            value={formData.biography}
            onChange={(e) =>
              setFormData({ ...formData, biography: e.target.value })
            }
            rows={6}
            placeholder="Share their life story, achievements, and cherished memories..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-1 text-sm text-gray-500">
            This will appear on the public memorial page.
          </p>
        </div>
      </div>

      {/* Privacy Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Privacy Settings
        </h3>

        <div className="flex items-start">
          <input
            type="checkbox"
            id="readOnly"
            checked={formData.readOnly}
            onChange={(e) =>
              setFormData({ ...formData, readOnly: e.target.checked })
            }
            className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <label htmlFor="readOnly" className="ml-3">
            <span className="block text-sm font-medium text-gray-900">
              Read-Only Mode
            </span>
            <span className="block text-sm text-gray-600">
              Prevent new memory submissions. Existing memories will still be visible.
            </span>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 text-gray-700 hover:text-gray-900"
          disabled={saving}
        >
          Cancel
        </button>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
