import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { CreateMemorialForm } from '@/components/CreateMemorialForm';

export default async function NewMemorialPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white shadow-sm rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Create Memorial
          </h1>
          
          <CreateMemorialForm />
        </div>
      </div>
    </main>
  );
}