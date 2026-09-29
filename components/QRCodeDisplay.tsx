'use client';

import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

interface QRCodeDisplayProps {
  memorialId: string;
  memorialTitle: string;
}

/**
 * QR Code Display Component
 * 
 * Phase 3A - Feature 1
 * Shows QR code and allows download
 */
export function QRCodeDisplay({ memorialId, memorialTitle }: QRCodeDisplayProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQRCode = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/memorial/${memorialId}/qr`);
      const result = await response.json();

      if (result.success && result.data?.qrCode) {
        setQrDataUrl(result.data.qrCode);
      } else {
        setError('Failed to load QR code');
      }
    } catch (err) {
      console.error('QR fetch error:', err);
      setError('Failed to load QR code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQRCode();
  }, [memorialId]);

  const handleDownload = () => {
    if (!qrDataUrl) return;

    // Create download link
    const link = document.createElement('a');
    link.href = qrDataUrl;
    link.download = `${memorialTitle.replace(/[^a-z0-9]/gi, '-')}-QR-Code.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchQRCode}
            className="mt-4 text-sm text-blue-600 hover:text-blue-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex flex-col items-center">
        {/* QR Code */}
        <div className="mb-4">
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt={`QR Code for ${memorialTitle}`}
              className="w-64 h-64 border-4 border-gray-100 rounded-lg"
            />
          )}
        </div>

        {/* Instructions */}
        <div className="text-center mb-4">
          <h3 className="font-semibold text-gray-900 mb-2">
            Share Your Memorial
          </h3>
          <p className="text-sm text-gray-600">
            Scan this QR code to access the memorial page.<br />
            Perfect for printing and displaying at services.
          </p>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Download className="w-5 h-5" />
          Download QR Code
        </button>

        {/* Usage Tips */}
        <div className="mt-6 pt-6 border-t border-gray-200 w-full">
          <h4 className="font-medium text-gray-900 mb-3">Usage Tips:</h4>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>• Print and display at the service</li>
            <li>• Include in memorial programs</li>
            <li>• Share digitally via email or text</li>
            <li>• Post on social media</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
