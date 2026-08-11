"use client";


import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Memorial {
  id: string;
  title: string;
  createdAt: string;
  readOnly: boolean;
  status: string;
}

export function MemorialList() {
  const [memorials, setMemorials] = useState<Memorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchMemorials = async () => {
    try {
      setLoading(true);
      setError(false);

      const response = await fetch('/api/dashboard/memorials');

      if (!response.ok) {
        setError(true);
        return;
      }

      const data = await response.json();
      setMemorials(data.memorials);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemorials();
  }, []);

  const toggleReadOnly = async (memorialId: string) => {
    setProcessingId(memorialId);

    try {
      const response = await fetch(`/api/memorial/${memorialId}/readonly`, {
        method: 'POST',
      });

      if (response.ok) {
        await fetchMemorials();
      }
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading memorials...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">Unable to load memorials.</p>
        <button
          onClick={fetchMemorials}
          className="text-gray-900 font-medium hover:text-gray-700"
        >
          Try again
        </button>
      </div>
    );
  }

 if (memorials.length === 0) {
  return (
    <div className="bg-white shadow-sm rounded-lg p-12 text-center">
      <p className="text-gray-500 mb-4">
        You haven't created any memorials yet.
      </p>

      <a
        href="/dashboard/memorials/new"
        className="inline-block bg-gray-900 text-white py-2 px-6 rounded-lg font-medium hover:bg-gray-800"
      >
        Create Your First Memorial
      </a>
    </div>
  );
}


  return (
    <div className="space-y-4">
      {memorials.map((memorial) => (
        <div
          key={memorial.id}
          className="bg-white shadow-sm rounded-lg p-6"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {memorial.title}
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Created {new Date(memorial.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              
              <div className="flex items-center gap-4">
                <Link
                  href={`/dashboard/memorial/${memorial.id}/moderation`}
                  className="text-gray-900 font-medium hover:text-gray-700"
                >
                  Moderate
                </Link>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <span
                className={`text-sm font-medium ${
                  memorial.readOnly ? 'text-gray-600' : 'text-green-600'
                }`}
              >
                {memorial.readOnly ? 'Read-only' : 'Accepting submissions'}
              </span>
              
              <button
                onClick={() => toggleReadOnly(memorial.id)}
                disabled={processingId === memorial.id}
                className="text-sm text-gray-700 hover:text-gray-900 disabled:text-gray-400"
              >
                {processingId === memorial.id
                  ? 'Processing...'
                  : memorial.readOnly
                  ? 'Enable submissions'
                  : 'Disable submissions'}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}