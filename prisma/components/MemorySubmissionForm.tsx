'use client';

import { useState } from 'react';
import { UPLOAD_CONFIG } from '@/lib/upload-shared';

interface MemorySubmissionFormProps {
  memorialToken: string;
  /** If true, renders in guest book mode (short message, no photo upload) */
  guestBookMode?: boolean;
}

// Phase 4B: Category options shown to the submitter
const CATEGORY_OPTIONS = [
  { value: 'GENERAL',    label: 'General Memory' },
  { value: 'CONDOLENCE', label: 'Condolence' },
  { value: 'STORY',      label: 'Story or Anecdote' },
  { value: 'TRIBUTE',    label: 'Tribute' },
] as const;

type Category = typeof CATEGORY_OPTIONS[number]['value'];

/**
 * Memory submission form with photo upload support.
 *
 * ✅ Phase 2A: Photo Upload System (preserved)
 * ✅ Phase 4B: Category selector + guest book mode
 */
export function MemorySubmissionForm({
  memorialToken,
  guestBookMode = false,
}: MemorySubmissionFormProps) {
  const [authorName, setAuthorName]       = useState('');
  const [message, setMessage]             = useState('');
  const [category, setCategory]           = useState<Category>('GENERAL');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [submitStatus, setSubmitStatus]   = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage]   = useState('');

  const maxChars = guestBookMode ? 500 : 5000;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (files.length > UPLOAD_CONFIG.MAX_FILES_PER_MEMORY) {
      setErrorMessage(`Maximum ${UPLOAD_CONFIG.MAX_FILES_PER_MEMORY} photos allowed`);
      return;
    }

    const validFiles: File[] = [];
    for (const file of files) {
      if (!UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
        setErrorMessage(`Invalid file type: ${file.name}. Only images allowed.`);
        return;
      }
      if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
        const maxMB = UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024);
        setErrorMessage(`File too large: ${file.name}. Maximum ${maxMB}MB.`);
        return;
      }
      validFiles.push(file);
    }

    setSelectedFiles(validFiles);
    setErrorMessage('');
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      setErrorMessage('Please write a message');
      return;
    }

    if (message.trim().length > maxChars) {
      setErrorMessage(`Message must be ${maxChars} characters or less`);
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');
    setErrorMessage('');

    try {
      if (guestBookMode) {
        // Phase 4B: Guest book uses dedicated endpoint
        const res = await fetch(
          `/api/public/memorial/${memorialToken}/guest-book`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              authorName: authorName.trim() || undefined,
              message:    message.trim(),
            }),
          }
        );

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to submit guest book entry');
        }

      } else {
        // Standard memory submission (existing flow — preserved exactly)
        const memoryResponse = await fetch(
          `/api/public/memorial/${memorialToken}/memory`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              authorName: authorName.trim() || undefined,
              message:    message.trim(),
              category,   // Phase 4B: include category
            }),
          }
        );

        if (!memoryResponse.ok) {
          const errorData = await memoryResponse.json();
          throw new Error(errorData.error || 'Failed to submit memory');
        }

        const memoryData = await memoryResponse.json();
        const memoryId   = memoryData.data?.memory?.id;

        if (!memoryId) throw new Error('Failed to create memory');

        // Upload photos if any (existing flow — unchanged)
        if (selectedFiles.length > 0) {
          const uploadPromises = selectedFiles.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);

            const uploadResponse = await fetch(
              `/api/public/memorial/${memorialToken}/memory/${memoryId}/media`,
              { method: 'POST', body: formData }
            );

            if (!uploadResponse.ok) {
              const errorData = await uploadResponse.json();
              throw new Error(errorData.error || 'Failed to upload photo');
            }

            return uploadResponse.json();
          });

          await Promise.all(uploadPromises);
        }
      }

      // Success — reset form
      setSubmitStatus('success');
      setAuthorName('');
      setMessage('');
      setCategory('GENERAL');
      setSelectedFiles([]);

    } catch (error) {
      console.error('Submission error:', error);
      setSubmitStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to submit'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (submitStatus === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6">
        <div className="flex items-start">
          <svg className="h-6 w-6 text-green-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-green-800">
              {guestBookMode ? 'Guest book entry submitted' : 'Memory submitted successfully'}
            </h3>
            <p className="mt-1 text-sm text-green-700">
              Your {guestBookMode ? 'entry' : 'memory'} will be reviewed and published shortly.
            </p>
            <button
              onClick={() => setSubmitStatus('idle')}
              className="mt-3 text-sm font-medium text-green-800 hover:text-green-900"
            >
              Submit another {guestBookMode ? 'entry' : 'memory'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Error banner */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Name field */}
      <div>
        <label htmlFor="authorName" className="block text-sm font-medium text-gray-700">
          Your name (optional)
        </label>
        <input
          type="text"
          id="authorName"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          maxLength={100}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Leave blank to post anonymously"
          disabled={isSubmitting}
        />
      </div>

      {/* Phase 4B: Category selector — only shown for regular memories */}
      {!guestBookMode && (
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Type of memory
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
            disabled={isSubmitting}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            {CATEGORY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Message field */}
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-gray-700">
          {guestBookMode ? 'Your message' : 'Your memory'}{' '}
          <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={guestBookMode ? 3 : 6}
          maxLength={maxChars}
          required
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder={guestBookMode ? 'Leave a short message…' : 'Share your memory...'}
          disabled={isSubmitting}
        />
        <p className={`mt-1 text-sm ${message.length > maxChars * 0.9 ? 'text-amber-600' : 'text-gray-500'}`}>
          {message.length} / {maxChars} characters
        </p>
      </div>

      {/* Photo upload — hidden in guest book mode */}
      {!guestBookMode && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Photos (optional)
          </label>
          <p className="mt-1 text-sm text-gray-500">
            Add up to {UPLOAD_CONFIG.MAX_FILES_PER_MEMORY} photos (max 10MB each)
          </p>

          <div className="mt-2">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              disabled={isSubmitting || selectedFiles.length >= UPLOAD_CONFIG.MAX_FILES_PER_MEMORY}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center space-x-3">
                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    disabled={isSubmitting}
                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isSubmitting || !message.trim()}
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting
          ? 'Submitting...'
          : guestBookMode
            ? 'Sign Guest Book'
            : 'Submit Memory'}
      </button>
    </form>
  );
}
