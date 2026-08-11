/**
 * prisma/seed-music.ts
 *
 * Uses local files from public/music/ — reliable, no external dependencies.
 *
 * SETUP (run once before seeding):
 *   1. Copy this file to prisma/seed-music.ts
 *   2. Run the downloader:  node prisma/download-music.js
 *   3. Then seed:           npx ts-node prisma/seed-music.ts
 *
 * The blobKeys are local paths served by Next.js from the /public folder.
 * getPublicUrl('music/track.mp3') → '/music/track.mp3' in dev (no proxy needed).
 * In production, upload the files to S3 and replace blobKey with the S3 key.
 */

import { PrismaClient, MusicCategory } from '@prisma/client';

const prisma = new PrismaClient();

const tracks: {
  title: string;
  artist: string;
  category: MusicCategory;
  durationSeconds: number;
  blobKey: string;
  previewBlobKey?: string;
}[] = [
  // ── PEACEFUL ──────────────────────────────────────────────────────────────
  {
    title: 'Clair de Lune',
    artist: 'Claude Debussy',
    category: 'PEACEFUL',
    durationSeconds: 294,
    blobKey: 'music/clair-de-lune.mp3',
  },
  {
    title: 'Gymnopédie No. 1',
    artist: 'Erik Satie',
    category: 'PEACEFUL',
    durationSeconds: 195,
    blobKey: 'music/gymnopedie-no1.mp3',
  },
  {
    title: 'Moonlight Sonata',
    artist: 'Ludwig van Beethoven',
    category: 'PEACEFUL',
    durationSeconds: 360,
    blobKey: 'music/moonlight-sonata.mp3',
  },

  // ── CLASSICAL ─────────────────────────────────────────────────────────────
  {
    title: 'Canon in D',
    artist: 'Johann Pachelbel',
    category: 'CLASSICAL',
    durationSeconds: 270,
    blobKey: 'music/canon-in-d.mp3',
  },
  {
    title: 'Ave Maria',
    artist: 'Franz Schubert',
    category: 'CLASSICAL',
    durationSeconds: 252,
    blobKey: 'music/ave-maria.mp3',
  },
  {
    title: 'Adagio for Strings',
    artist: 'Samuel Barber',
    category: 'CLASSICAL',
    durationSeconds: 480,
    blobKey: 'music/adagio-for-strings.mp3',
  },

  // ── INSTRUMENTAL ──────────────────────────────────────────────────────────
  {
    title: 'Peaceful Piano',
    artist: 'Instrumental',
    category: 'INSTRUMENTAL',
    durationSeconds: 180,
    blobKey: 'music/peaceful-piano.mp3',
  },
  {
    title: 'Gentle Acoustic',
    artist: 'Instrumental',
    category: 'INSTRUMENTAL',
    durationSeconds: 210,
    blobKey: 'music/gentle-acoustic.mp3',
  },
  {
    title: 'Soft Strings',
    artist: 'Instrumental',
    category: 'INSTRUMENTAL',
    durationSeconds: 240,
    blobKey: 'music/soft-strings.mp3',
  },

  // ── HYMN ──────────────────────────────────────────────────────────────────
  {
    title: 'Amazing Grace',
    artist: 'Traditional',
    category: 'HYMN',
    durationSeconds: 210,
    blobKey: 'music/amazing-grace.mp3',
  },
  {
    title: 'How Great Thou Art',
    artist: 'Traditional',
    category: 'HYMN',
    durationSeconds: 240,
    blobKey: 'music/how-great-thou-art.mp3',
  },
  {
    title: 'Ave Verum Corpus',
    artist: 'W.A. Mozart',
    category: 'HYMN',
    durationSeconds: 195,
    blobKey: 'music/ave-verum-corpus.mp3',
  },

  // ── UPLIFTING ─────────────────────────────────────────────────────────────
  {
    title: 'Morning Inspiration',
    artist: 'Instrumental',
    category: 'UPLIFTING',
    durationSeconds: 180,
    blobKey: 'music/morning-inspiration.mp3',
  },
  {
    title: 'Hopeful Journey',
    artist: 'Instrumental',
    category: 'UPLIFTING',
    durationSeconds: 200,
    blobKey: 'music/hopeful-journey.mp3',
  },

  // ── CELEBRATION ───────────────────────────────────────────────────────────
  {
    title: 'Ode to Joy',
    artist: 'Ludwig van Beethoven',
    category: 'CELEBRATION',
    durationSeconds: 180,
    blobKey: 'music/ode-to-joy.mp3',
  },
  {
    title: 'Trumpet Voluntary',
    artist: 'Jeremiah Clarke',
    category: 'CELEBRATION',
    durationSeconds: 210,
    blobKey: 'music/trumpet-voluntary.mp3',
  },
];

async function main() {
  console.log('Seeding music tracks...');
  let created = 0;
  let skipped = 0;

  for (const track of tracks) {
    const existing = await prisma.musicTrack.findFirst({
      where: { title: track.title, artist: track.artist },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.musicTrack.create({
      data: {
        ...track,
        active: true,
      },
    });
    created++;
    console.log(`  ✓ ${track.title}`);
  }

  console.log(`\nDone — ${created} created, ${skipped} skipped.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
