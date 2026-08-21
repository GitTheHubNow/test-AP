'use client';

import { useState } from 'react';

interface ShareBarProps {
  memorialTitle: string;
  primaryColor:  string;
}

/**
 * ShareBar
 *
 * Floating share row on the public memorial page.
 * Channels: Copy link · WhatsApp · Email · SMS
 * Passes referrer source in URL (?ref=whatsapp etc.) so analytics
 * can track which channel drove the visit.
 *
 * Phase 9
 */
export function ShareBar({ memorialTitle, primaryColor }: ShareBarProps) {
  const [copied, setCopied] = useState(false);

  // Build a shareable URL with a referrer tag
  function urlFor(ref: string) {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('ref', ref);
    return url.toString();
  }

  function baseUrl() {
    if (typeof window === 'undefined') return '';
    return window.location.href.split('?')[0];
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(baseUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that block clipboard
      const ta = document.createElement('textarea');
      ta.value = baseUrl();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleWhatsApp() {
    const text = `${memorialTitle} — A place to remember and share memories. ${urlFor('whatsapp')}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  function handleEmail() {
    const subject = encodeURIComponent(`In memory of ${memorialTitle}`);
    const body    = encodeURIComponent(
      `I wanted to share this memorial page with you.\n\n${memorialTitle} — A place to remember and share memories.\n\n${urlFor('email')}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function handleSMS() {
    const text = encodeURIComponent(`${memorialTitle} — ${urlFor('sms')}`);
    // sms: works on iOS and Android
    window.location.href = `sms:?&body=${text}`;
  }

  const btnBase = `
    flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
    transition-all duration-150 hover:scale-[1.03] active:scale-[0.97]
    focus:outline-none focus:ring-2 focus:ring-offset-1
  `;

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 pb-8">
      <div
        className="rounded-2xl px-5 sm:px-7 py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{ backgroundColor: primaryColor + '10', border: `1px solid ${primaryColor}22` }}
      >
        {/* Label */}
        <p
          className="text-sm font-medium flex-shrink-0"
          style={{ color: primaryColor, fontFamily: 'Georgia, serif' }}
        >
          Share this memorial
        </p>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2 flex-1">

          {/* Copy link */}
          <button
            onClick={handleCopy}
            className={btnBase}
            style={{
              backgroundColor: copied ? primaryColor : '#fff',
              color:           copied ? '#fff' : '#374151',
              border:          `1px solid ${copied ? primaryColor : '#e5e7eb'}`,
            }}
            aria-label="Copy link to clipboard"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy Link
              </>
            )}
          </button>

          {/* WhatsApp */}
          <button
            onClick={handleWhatsApp}
            className={btnBase}
            style={{ backgroundColor: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}
            aria-label="Share via WhatsApp"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            WhatsApp
          </button>

          {/* Email */}
          <button
            onClick={handleEmail}
            className={btnBase}
            style={{ backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe' }}
            aria-label="Share via Email"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </button>

          {/* SMS */}
          <button
            onClick={handleSMS}
            className={btnBase}
            style={{ backgroundColor: '#ecfeff', color: '#0e7490', border: '1px solid #a5f3fc' }}
            aria-label="Share via SMS"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            SMS
          </button>

        </div>
      </div>
    </div>
  );
}
