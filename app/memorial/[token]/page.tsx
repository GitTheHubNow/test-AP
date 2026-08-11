import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPublicMemorialByToken } from '@/lib/publicMemorial';
import type { PublicMemorialData } from '@/lib/publicMemorial';

interface MemorialPageProps {
  params: {
    token: string;
  };
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata(
  { params }: MemorialPageProps
): Promise<Metadata> {
  const data = await getPublicMemorialByToken(params.token);

  if (!data) {
    return {
      title: 'Memorial Not Found',
    };
  }

  return {
    title: `${data.memorial.title} - Memorial`,
  };
}

/**
 * Public memorial page.
 * Read-only display of approved content.
 */
export default async function MemorialPage({ params }: MemorialPageProps) {
  const data = await getPublicMemorialByToken(params.token);

  if (!data) {
    notFound();
  }

  const { memorial, memories } = data;

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Memorial Header */}
        <div className="bg-white shadow-sm rounded-lg p-8 mb-8">
          <h1 className="text-3xl font-serif font-bold text-gray-900 mb-4">
            {memorial.title}
          </h1>
          
          {memorial.description && (
            <p className="text-gray-700 text-lg whitespace-pre-wrap">
              {memorial.description}
            </p>
          )}
        </div>

        {/* Memories */}
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-gray-900">
            Memories ({memories.length})
          </h2>

          {memories.length === 0 ? (
            <div className="bg-white shadow-sm rounded-lg p-8 text-center text-gray-500">
              No memories have been shared yet.
            </div>
          ) : (
            <div className="space-y-4">
              {memories.map((memory) => (
                <article
                  key={memory.id}
                  className="bg-white shadow-sm rounded-lg p-6"
                >
                  <div className="flex items-start justify-between mb-3">
                    <p className="font-medium text-gray-900">
                      {memory.authorName || 'Anonymous'}
                    </p>
                    <time className="text-sm text-gray-500">
                      {new Date(memory.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </time>
                  </div>
                  
                  <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {memory.message}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}