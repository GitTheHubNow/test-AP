// scripts/check-ffmpeg-core.ts
//
// AUDIT SCRIPT — checks whether ffmpeg-core.js / ffmpeg-core.wasm already
// exist in your R2 bucket, and if so, reports their exact key (path) and
// size, without needing to paste credentials anywhere. Uses the same
// AWS_*/CF_ACCOUNT_ID env vars your app already has in .env.
//
// Usage:
//   npx tsx scripts/check-ffmpeg-core.ts

import { S3Client, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';

const REQUIRED_ENV = ['AWS_REGION', 'CF_ACCOUNT_ID', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET'];

async function main() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    console.error('Make sure you\'re running this from the project root with .env loaded.');
    process.exit(1);
  }

  const client = new S3Client({
    region:   process.env.AWS_REGION!,
    endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const bucket = process.env.AWS_S3_BUCKET!;

  console.log(`Searching bucket "${bucket}" for ffmpeg-related files...\n`);

  const result = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
  const matches = (result.Contents ?? []).filter((o) =>
    o.Key?.toLowerCase().includes('ffmpeg')
  );

  if (matches.length === 0) {
    console.log('❌ No ffmpeg-related files found in this bucket.');
    console.log('   Nothing is uploaded yet — run scripts/upload-ffmpeg-core.ts to add them.');
    return;
  }

  console.log(`Found ${matches.length} matching file(s):\n`);

  for (const obj of matches) {
    const sizeMB = obj.Size ? (obj.Size / 1024 / 1024).toFixed(1) : '?';
    console.log(`  ${obj.Key}  (${sizeMB} MB)`);
  }

  console.log('\n--- Sanity checks ---');

  const jsFile   = matches.find((o) => o.Key?.endsWith('ffmpeg-core.js'));
  const wasmFile = matches.find((o) => o.Key?.endsWith('ffmpeg-core.wasm'));

  if (!jsFile)   console.log('⚠️  ffmpeg-core.js not found by that exact filename.');
  if (!wasmFile) console.log('⚠️  ffmpeg-core.wasm not found by that exact filename.');

  if (wasmFile && wasmFile.Size) {
    const sizeMB = wasmFile.Size / 1024 / 1024;
    if (sizeMB < 25 || sizeMB > 35) {
      console.log(`⚠️  ffmpeg-core.wasm is ${sizeMB.toFixed(1)} MB — expected ~31 MB. This may be the wrong file, a different version, or a partial/corrupted upload.`);
    } else {
      console.log(`✅ ffmpeg-core.wasm size looks correct (${sizeMB.toFixed(1)} MB).`);
    }
  }

  if (jsFile && wasmFile) {
    const dir = jsFile.Key!.substring(0, jsFile.Key!.lastIndexOf('/'));
    console.log(`\nBoth files found under: ${dir}/`);
    console.log('\nSet this in your .env:');
    const cdnBase = process.env.NEXT_PUBLIC_CDN_URL ? process.env.NEXT_PUBLIC_CDN_URL.replace(/\/$/, '') : '<your CDN base URL>';
    console.log(`  NEXT_PUBLIC_FFMPEG_CORE_URL=${cdnBase}/${dir}`);

    // Also verify the files are actually publicly fetchable, not just
    // present in the bucket — a private bucket would still list them here
    // but the browser wouldn't be able to load them.
    if (process.env.NEXT_PUBLIC_CDN_URL) {
      console.log('\n--- Checking public accessibility ---');
      for (const key of [jsFile.Key!, wasmFile.Key!]) {
        const url = `${cdnBase}/${key}`;
        try {
          const res = await fetch(url, { method: 'HEAD' });
          console.log(`  ${res.ok ? '✅' : '❌'} ${url} → ${res.status}`);
        } catch (e) {
          console.log(`  ❌ ${url} → fetch failed (${e instanceof Error ? e.message : 'unknown error'})`);
        }
      }
    } else {
      console.log('\n(NEXT_PUBLIC_CDN_URL not set — skipping public-accessibility check.)');
    }
  }
}

main().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
