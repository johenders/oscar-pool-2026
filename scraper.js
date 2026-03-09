// =====================================================
// OSCAR POOL 2026 — Wikipedia Scraper
// Runs via GitHub Actions every 5 min on ceremony night
// Uses Firebase REST API (no service account key needed)
// =====================================================

import fetch from 'node-fetch';

const DB_URL = process.env.FIREBASE_DATABASE_URL; // e.g. https://xxx-default-rtdb.firebaseio.com

// --- Category ID → section title on Wikipedia ---
const CATEGORY_MAP = [
  { id: 'best_picture',             section: 'Best Picture' },
  { id: 'best_director',            section: 'Best Director' },
  { id: 'best_actor',               section: 'Best Actor' },
  { id: 'best_actress',             section: 'Best Actress' },
  { id: 'best_supporting_actor',    section: 'Best Supporting Actor' },
  { id: 'best_supporting_actress',  section: 'Best Supporting Actress' },
  { id: 'best_animated',            section: 'Best Animated Feature Film' },
  { id: 'best_international',       section: 'Best International Feature Film' },
  { id: 'best_cinematography',      section: 'Best Cinematography' },
  { id: 'best_costume',             section: 'Best Costume Design' },
  { id: 'best_editing',             section: 'Best Film Editing' },
  { id: 'best_production_design',   section: 'Best Production Design' },
  { id: 'best_sound',               section: 'Best Sound' },
  { id: 'best_vfx',                 section: 'Best Visual Effects' },
  { id: 'best_makeup',              section: 'Best Makeup and Hairstyling' },
  { id: 'best_original_screenplay', section: 'Best Original Screenplay' },
  { id: 'best_adapted_screenplay',  section: 'Best Adapted Screenplay' },
  { id: 'best_score',               section: 'Best Original Score' },
  { id: 'best_song',                section: 'Best Original Song' },
  { id: 'best_documentary',         section: 'Best Documentary Feature Film' },
  { id: 'best_documentary_short',   section: 'Best Documentary Short Film' },
  { id: 'best_animated_short',      section: 'Best Animated Short Film' },
  { id: 'best_live_action_short',   section: 'Best Live Action Short Film' },
  { id: 'best_casting',             section: 'Best Casting' },
];

const NOMINEES = {
  best_picture:             ['Bugonia','F1','Frankenstein','Hamnet','Marty Supreme','One Battle After Another','The Secret Agent','Sentimental Value','Sinners','Train Dreams'],
  best_director:            ['Chloé Zhao','Josh Safdie','Paul Thomas Anderson','Joachim Trier','Ryan Coogler'],
  best_actor:               ['Timothée Chalamet','Leonardo DiCaprio','Ethan Hawke','Michael B. Jordan','Wagner Moura'],
  best_actress:             ['Jessie Buckley','Rose Byrne','Kate Hudson','Renate Reinsve','Emma Stone'],
  best_supporting_actor:    ['Benicio Del Toro','Jacob Elordi','Delroy Lindo','Sean Penn','Stellan Skarsgård'],
  best_supporting_actress:  ['Elle Fanning','Inga Ibsdotter Lilleaas','Amy Madigan','Wunmi Mosaku','Teyana Taylor'],
  best_animated:            ['Arco','Elio','KPop Demon Hunters','Little Amélie','Zootopia 2'],
  best_international:       ['The Secret Agent','It Was Just An Accident','Sentimental Value','Sirāt','The Voice of Hind Rajab'],
  best_cinematography:      ['Frankenstein','Marty Supreme','One Battle After Another','Sinners','Train Dreams'],
  best_costume:             ['Avatar: Fire and Ash','Frankenstein','Hamnet','Marty Supreme','Sinners'],
  best_editing:             ['F1','Marty Supreme','One Battle After Another','Sentimental Value','Sinners'],
  best_production_design:   ['Frankenstein','Hamnet','Marty Supreme','One Battle After Another','Sinners'],
  best_sound:               ['F1','Frankenstein','One Battle After Another','Sinners','Sirāt'],
  best_vfx:                 ['Avatar: Fire and Ash','F1','Jurassic World Rebirth','The Lost Bus','Sinners'],
  best_makeup:              ['Frankenstein','Kokuho','Sinners','The Smashing Machine','The Ugly Stepsister'],
  best_original_screenplay: ['Blue Moon','It Was Just An Accident','Marty Supreme','Sentimental Value','Sinners'],
  best_adapted_screenplay:  ['Bugonia','Frankenstein','Hamnet','One Battle After Another','Train Dreams'],
  best_score:               ['Avatar: Fire and Ash','Bugonia','Hamnet','One Battle After Another','Sinners'],
  best_song:                ['"Golden"','"I Lied to You"','"Dear Me"','"Sweet Dreams of Joy"','"Train Dreams"'],
  best_documentary:         ['The Alabama Solution','Come See Me in the Good Light','Cutting through Rocks','Mr. Nobody Against Putin','The Perfect Neighbor'],
  best_documentary_short:   ['All the Empty Rooms','Armed Only with a Camera','Children No More','The Devil Is Busy','Perfectly a Strangeness'],
  best_animated_short:      ['Butterfly','Forevergreen','The Girl Who Cried Pearls','Retirement Plan','The Three Sisters'],
  best_live_action_short:   ["Butcher's Stain","A Friend of Dorothy","Jane Austen's Period Drama","The Singers","Two People Exchanging Saliva"],
  best_casting:             ['Nina Gold','Jennifer Venditti','Cassandra Kulukundis','Gabriel Domingues','Francine Maisler'],
};

// --- Firebase REST helpers ---
async function firebaseGet(path) {
  const res = await fetch(`${DB_URL}/${path}.json`);
  return res.ok ? res.json() : null;
}

async function firebasePatch(path, data) {
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.ok;
}

// --- Main scraper ---
async function scrapeWikipedia() {
  console.log('📡 Fetching Wikipedia 98th Academy Awards...');

  const res  = await fetch('https://en.m.wikipedia.org/wiki/98th_Academy_Awards', {
    headers: { 'User-Agent': 'OscarPool2026Bot/1.0 (educational project)' }
  });
  const html = await res.text();

  const found = {};
  for (const cat of CATEGORY_MAP) {
    const winnerName = extractWinner(html, cat.section);
    if (!winnerName) continue;

    const nominees = NOMINEES[cat.id] || [];
    const idx = nominees.findIndex(n =>
      winnerName.toLowerCase().includes(n.toLowerCase()) ||
      n.toLowerCase().includes(winnerName.toLowerCase())
    );

    if (idx !== -1) {
      found[cat.id] = idx;
      console.log(`✅ ${cat.id}: ${nominees[idx]}`);
    } else {
      console.log(`⚠️  ${cat.id}: found "${winnerName}" — no nominee match`);
    }
  }

  if (Object.keys(found).length === 0) {
    console.log('ℹ️  No winners found yet on Wikipedia.');
    return;
  }

  // Only write categories not already in Firebase
  const existing = await firebaseGet('winners') || {};
  const toWrite  = {};
  for (const [k, v] of Object.entries(found)) {
    if (existing[k] === undefined) toWrite[k] = v;
  }

  if (Object.keys(toWrite).length > 0) {
    const ok = await firebasePatch('winners', toWrite);
    console.log(ok
      ? `🔥 Pushed ${Object.keys(toWrite).length} new winner(s) to Firebase`
      : '❌ Firebase write failed'
    );
  } else {
    console.log('ℹ️  All found winners already in Firebase.');
  }
}

function extractWinner(html, sectionTitle) {
  const titleIdx = html.indexOf(sectionTitle);
  if (titleIdx === -1) return null;
  const chunk = html.slice(titleIdx, titleIdx + 3000);
  const boldMatch = chunk.match(/<b>([^<]{3,80})<\/b>/);
  return boldMatch ? boldMatch[1].trim() : null;
}

scrapeWikipedia()
  .then(() => { console.log('Done.'); process.exit(0); })
  .catch(e  => { console.error('Scraper error:', e); process.exit(1); });
