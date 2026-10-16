import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Landing } from '@/components/landing/Landing';

export const metadata: Metadata = {
  title: 'Absolute Posterity | Digital memorials for funeral directors',
  description:
    'Create the tribute during the service, hand ownership to the family, and keep the margin. 25 years of hosting and all end-user support included.',
  openGraph: {
    title: 'Absolute Posterity | Digital memorials for funeral directors',
    description: 'A memorial that lasts 25 years, and profit on every service.',
    type: 'website',
  },
};

export default async function HomePage() {
  // Signed-in users go straight to their work, as before. Signed-out visitors
  // (including people who just want to read what this is) get the landing page;
  // "Sign in" and "Start your free month" in the nav lead to /sign-in and /sign-up.
  const { userId } = await auth();
  if (userId) redirect('/dashboard/memorials');

  return <Landing year={new Date().getFullYear()} />;
}
