/**
 * prisma/download-music.js
 *
 * Downloads royalty-free MP3s into public/music/ so seed-music.ts can reference them.
 * All tracks are from Pixabay (free, no attribution required) or public domain.
 *
 * Run from project root:
 *   node prisma/download-music.js
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'music');

// Pixabay free music CDN URLs — these are stable public CDN links
// All are royalty-free, no attribution required for non-commercial use
const tracks = [
  // PEACEFUL / CLASSICAL — public domain recordings
  {
    filename: 'clair-de-lune.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6ff1bca.mp3',
  },
  {
    filename: 'gymnopedie-no1.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3',
  },
  {
    filename: 'moonlight-sonata.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/01/27/audio_d0ef42dfeb.mp3',
  },
  {
    filename: 'canon-in-d.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_946b6e835b.mp3',
  },
  {
    filename: 'ave-maria.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2021/09/06/audio_4beae95d93.mp3',
  },
  {
    filename: 'adagio-for-strings.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/11/21/audio_4938f5e3da.mp3',
  },
  {
    filename: 'peaceful-piano.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/10/10/audio_32e73a1f02.mp3',
  },
  {
    filename: 'gentle-acoustic.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/12/13/audio_62e83e9e6f.mp3',
  },
  {
    filename: 'soft-strings.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2023/01/23/audio_ca540c1052.mp3',
  },
  {
    filename: 'amazing-grace.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3',
  },
  {
    filename: 'how-great-thou-art.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/11/22/audio_febc508520.mp3',
  },
  {
    filename: 'ave-verum-corpus.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2021/10/25/audio_8ff3d7e1b2.mp3',
  },
  {
    filename: 'morning-inspiration.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/08/02/audio_884fe92c21.mp3',
  },
  {
    filename: 'hopeful-journey.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/11/17/audio_9dc73296d5.mp3',
  },
  {
    filename: 'ode-to-joy.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/10/31/audio_8cb749af15.mp3',
  },
  {
    filename: 'trumpet-voluntary.mp3',
    url: 'https://cdn.pixabay.com/download/audio/2022/11/20/audio_b8e0f04fac.mp3',
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      console.log(`  ⟳ skip (exists) ${path.basename(dest)}`);
      return resolve();
    }

    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;

    const request = (targetUrl) => {
      client.get(targetUrl, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          fs.unlinkSync(dest);
          return request(res.headers.location);
        }

        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          const size = fs.statSync(dest).size;
          if (size < 10000) {
            // Too small — likely an error page
            fs.unlinkSync(dest);
            return reject(new Error(`Response too small (${size} bytes) — probably not an MP3`));
          }
          console.log(`  ✓ ${path.basename(dest)} (${(size / 1024).toFixed(0)}KB)`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    };

    request(url);
  });
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created ${OUTPUT_DIR}`);
  }

  console.log(`Downloading ${tracks.length} tracks to public/music/...\n`);

  const failed = [];
  for (const track of tracks) {
    const dest = path.join(OUTPUT_DIR, track.filename);
    try {
      await download(track.url, dest);
    } catch (err) {
      console.error(`  ✗ ${track.filename}: ${err.message}`);
      failed.push(track.filename);
    }
  }

  console.log('\n─────────────────────────────────');
  if (failed.length === 0) {
    console.log('All tracks downloaded successfully.');
    console.log('\nNext step: npx ts-node prisma/seed-music.ts');
  } else {
    console.log(`${failed.length} track(s) failed:`);
    failed.forEach(f => console.log(`  - ${f}`));
    console.log('\nFor failed tracks, manually download an MP3 and place it in public/music/');
    console.log('with the exact filename listed above. Any royalty-free MP3 will work.');
    console.log('\nGood sources:');
    console.log('  https://pixabay.com/music/');
    console.log('  https://freemusicarchive.org/');
    console.log('  https://musopen.org/');
  }
}

main();
