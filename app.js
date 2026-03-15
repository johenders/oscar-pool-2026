// =====================================================
// OSCAR POOL 2026 — Main App
// Firebase Realtime Database + Wikipedia scraper
// =====================================================

import { CATEGORIES } from './data.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getDatabase, ref, set, get, onValue, update }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// =====================================================
// 🔧 FIREBASE CONFIG — Replace with your own values
// =====================================================
const firebaseConfig = {
  apiKey: "AIzaSyDH3gYJ0AmXHQ7USYNbF8a7eCw61VzR6a4",
  authDomain: "oscar-pool-2026-cbea6.firebaseapp.com",
  databaseURL: "https://oscar-pool-2026-cbea6-default-rtdb.firebaseio.com",
  projectId: "oscar-pool-2026-cbea6",
  storageBucket: "oscar-pool-2026-cbea6.firebasestorage.app",
  messagingSenderId: "554324751785",
  appId: "1:554324751785:web:ff1295500dee98fc0900b8"
};
// =====================================================

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ---- State ----
let currentPlayer = null;
let myVotes       = {};   // { catId: nomineeIndex }
let allVotes      = {};   // { playerName: { catId: nomineeIndex } }
let winners       = {};   // { catId: nomineeIndex }

// =====================================================
// DEADLINE — Dimanche 15 mars 2026 à 18h30 EST
// =====================================================
const DEADLINE = new Date('2026-03-15T18:30:00-05:00');

function isLocked() {
  return new Date() >= DEADLINE;
}

function startCountdown() {
  function update() {
    const now  = new Date();
    const diff = DEADLINE - now;

    if (diff <= 0) {
      // Votes fermés
      document.getElementById('cdDays').textContent  = '00';
      document.getElementById('cdHours').textContent = '00';
      document.getElementById('cdMins').textContent  = '00';
      document.getElementById('cdSecs').textContent  = '00';
      const msg = document.getElementById('countdownMsg');
      if (msg) msg.textContent = '🔒 Les votes sont fermés';
      const nameEntry = document.getElementById('nameEntry');
      if (nameEntry) {
        nameEntry.innerHTML = '<div class="votes-locked-banner">🔒 Les votes sont fermés — bonne chance !</div>';
      }
      return; // stop ticking
    }

    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000)  / 60000);
    const secs  = Math.floor((diff % 60000)    / 1000);

    document.getElementById('cdDays').textContent  = String(days).padStart(2, '0');
    document.getElementById('cdHours').textContent = String(hours).padStart(2, '0');
    document.getElementById('cdMins').textContent  = String(mins).padStart(2, '0');
    document.getElementById('cdSecs').textContent  = String(secs).padStart(2, '0');

    setTimeout(update, 1000);
  }
  update();
}

// =====================================================
// SPLASH — Start
// =====================================================
window.startApp = async function () {
  const input = document.getElementById('playerName');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }

  currentPlayer = name;
  localStorage.setItem('oscarpool_name', name);
  document.getElementById('headerName').textContent = name;

  // Load existing votes for this player
  const snap = await get(ref(db, `votes/${safeName(name)}`));
  if (snap.exists()) myVotes = snap.val();

  // Listen to all data in real-time
  setupListeners();

  document.getElementById('splash').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  renderVoteView();
};

window.switchUser = function () {
  localStorage.removeItem('oscarpool_name');
  location.reload();
};

// Les modules ES s'exécutent après le DOM — appel direct
startCountdown();
const saved = localStorage.getItem('oscarpool_name');
if (saved) {
  document.getElementById('playerName').value = saved;
  document.getElementById('splashNote').textContent = `Bon retour, ${saved} !`;
}

document.getElementById('playerName')
  .addEventListener('keydown', e => { if (e.key === 'Enter') window.startApp(); });

// =====================================================
// FIREBASE — Real-time listeners
// =====================================================
function setupListeners() {
  onValue(ref(db, 'votes'), snap => {
    allVotes = snap.exists() ? snap.val() : {};
    if (!document.getElementById('boardView').classList.contains('hidden')) {
      renderBoard();
    }
  });

  onValue(ref(db, 'winners'), snap => {
    winners = snap.exists() ? snap.val() : {};
    if (!document.getElementById('boardView').classList.contains('hidden')) {
      renderBoard();
    }
    updateWinnerBadges();
  });
}

// =====================================================
// NAVIGATION
// =====================================================
window.showVote = function () {
  document.getElementById('voteView').classList.remove('hidden');
  document.getElementById('boardView').classList.add('hidden');
  document.getElementById('navVote').classList.add('active');
  document.getElementById('navBoard').classList.remove('active');
};

window.showBoard = function () {
  document.getElementById('voteView').classList.add('hidden');
  document.getElementById('boardView').classList.remove('hidden');
  document.getElementById('navVote').classList.remove('active');
  document.getElementById('navBoard').classList.add('active');
  populateAdminSelect();
  renderBoard();
};

// =====================================================
// VOTE VIEW — Render categories
// =====================================================
function renderVoteView() {
  const grid = document.getElementById('categoriesGrid');
  grid.innerHTML = '';

  CATEGORIES.forEach((cat, ci) => {
    const chosen = myVotes[cat.id] !== undefined ? myVotes[cat.id] : null;
    const winner = winners[cat.id] !== undefined ? winners[cat.id] : null;
    const isChosen = chosen !== null;
    const isCorrect = winner !== null && chosen === winner;

    const card = document.createElement('div');
    card.className = 'category-card' +
      (isChosen ? ' selected' : '') +
      (winner !== null ? ' winner-set' : '');
    card.id = `card-${cat.id}`;

    const pickLabel = isChosen
      ? cat.nominees[chosen].name
      : 'Pas encore choisi';

    card.innerHTML = `
      <div class="category-header" onclick="toggleCard('${cat.id}')">
        <span class="category-number">${String(ci + 1).padStart(2, '0')}</span>
        <span class="category-name">${cat.name}</span>
        <span class="category-pick ${isChosen ? 'chosen' : ''}" id="pick-label-${cat.id}">
          ${isCorrect ? '✓ ' : ''}${pickLabel}
        </span>
        <span class="category-expand">▼</span>
      </div>
      <div class="nominees-list" id="nominees-${cat.id}">
        ${cat.nominees.map((n, ni) => `
          <div class="nominee-item ${chosen === ni ? 'selected' : ''}"
               id="nominee-${cat.id}-${ni}"
               onclick="selectNominee('${cat.id}', ${ni})">
            <div class="nominee-radio">
              <div class="nominee-radio-dot"></div>
            </div>
            <div class="nominee-text">
              <div class="nominee-name">${n.name}</div>
              ${n.film ? `<div class="nominee-film">${n.film}</div>` : ''}
            </div>
            ${winner === ni ? '<span class="winner-badge">GAGNANT</span>' : ''}
          </div>
        `).join('')}
      </div>
    `;
    grid.appendChild(card);
  });

  updateProgress();
}

window.toggleCard = function (catId) {
  const card = document.getElementById(`card-${catId}`);
  card.classList.toggle('open');
};

window.selectNominee = function (catId, nomineeIndex) {
  // Unselect old
  const old = myVotes[catId];
  if (old !== undefined) {
    document.getElementById(`nominee-${catId}-${old}`)?.classList.remove('selected');
  }

  myVotes[catId] = nomineeIndex;

  // Select new
  document.getElementById(`nominee-${catId}-${nomineeIndex}`)?.classList.add('selected');

  // Update pick label
  const cat = CATEGORIES.find(c => c.id === catId);
  const label = document.getElementById(`pick-label-${catId}`);
  if (label && cat) {
    label.textContent = cat.nominees[nomineeIndex].name;
    label.classList.add('chosen');
  }

  // Mark card as selected
  document.getElementById(`card-${catId}`)?.classList.add('selected');

  updateProgress();
};

function updateProgress() {
  const total   = CATEGORIES.length;
  const chosen  = Object.keys(myVotes).length;
  const pct     = Math.round((chosen / total) * 100);

  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = `${chosen} / ${total} catégories`;

  const voteStatus = document.getElementById('voteStatus');
  if (chosen === total) {
    voteStatus.textContent = '🎉 Tous tes pronostics sont faits !';
  } else {
    voteStatus.textContent = `Il te reste ${total - chosen} catégorie${total - chosen > 1 ? 's' : ''} à choisir`;
  }
}

function updateWinnerBadges() {
  CATEGORIES.forEach(cat => {
    const winner = winners[cat.id];
    cat.nominees.forEach((n, ni) => {
      const el = document.getElementById(`nominee-${cat.id}-${ni}`);
      if (!el) return;
      const existing = el.querySelector('.winner-badge');
      if (winner === ni && !existing) {
        el.insertAdjacentHTML('beforeend', '<span class="winner-badge">GAGNANT</span>');
      } else if (winner !== ni && existing) {
        existing.remove();
      }
    });

    // Update pick label with checkmark
    if (winner !== undefined && myVotes[cat.id] === winner) {
      const label = document.getElementById(`pick-label-${cat.id}`);
      if (label && !label.textContent.startsWith('✓')) {
        label.textContent = '✓ ' + label.textContent;
      }
    }
  });
}

// =====================================================
// SAVE VOTES
// =====================================================
window.saveVotes = async function () {
  const btn  = document.getElementById('saveBtn');
  const note = document.getElementById('saveNote');
  btn.disabled = true;
  note.textContent = 'Sauvegarde en cours…';

  try {
    await set(ref(db, `votes/${safeName(currentPlayer)}`), myVotes);
    note.style.color = 'var(--green)';
    note.textContent = '✓ Tes choix sont sauvegardés !';
    showToast('✓ Votes sauvegardés !');
  } catch (e) {
    note.style.color = 'var(--red)';
    note.textContent = '✗ Erreur — vérifie ta connexion';
  } finally {
    btn.disabled = false;
  }
};

// =====================================================
// BOARD — Scores + Results
// =====================================================
function renderBoard() {
  renderScores();
  renderResults();
}

function renderScores() {
  const list = document.getElementById('scoresList');
  const total = Object.keys(winners).length;

  const scores = Object.entries(allVotes).map(([name, votes]) => {
    let pts = 0;
    Object.entries(winners).forEach(([catId, winnerIdx]) => {
      if (votes[catId] === winnerIdx) pts++;
    });
    return { name: decodeName(name), pts };
  });

  scores.sort((a, b) => b.pts - a.pts);
  const max = scores[0]?.pts || 1;

  list.innerHTML = '';
  if (scores.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);font-size:14px;padding:12px">Personne n\'a encore voté.</p>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];

  scores.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = `score-row ${i < 3 ? 'rank-' + (i + 1) : ''}`;
    row.innerHTML = `
      <span class="score-rank ${i < 3 ? 'medal' : ''}">${medals[i] ?? (i + 1)}</span>
      <span class="score-name">${s.name}</span>
      <div class="score-bar-wrap">
        <div class="score-bar" style="width:${total > 0 ? (s.pts / max * 100) : 0}%"></div>
      </div>
      <span class="score-value">${s.pts}</span>
      <span class="score-total">/ ${total}</span>
    `;
    list.appendChild(row);
  });
}

function renderResults() {
  const table    = document.getElementById('resultsTable');
  const revealed = isLocked();
  table.innerHTML = '';

  CATEGORIES.forEach(cat => {
    const winnerIdx = winners[cat.id];
    const announced = winnerIdx !== undefined;

    const row = document.createElement('div');
    row.className = `result-row ${announced ? 'announced' : ''}`;

    let picksHtml;
    if (!revealed) {
      picksHtml = '<span class="picks-hidden">🔒 Révélés dimanche à 18h30</span>';
    } else {
      picksHtml = Object.entries(allVotes).map(([rawName, votes]) => {
        const pick = votes[cat.id];
        if (pick === undefined) return '';
        const nom = cat.nominees[pick];
        let cls = '';
        if (announced) cls = (pick === winnerIdx) ? 'correct' : 'wrong';
        return `<span class="pick-tag ${cls}">${decodeName(rawName).split(' ')[0]}: ${nom.name}</span>`;
      }).filter(Boolean).join('') || '<span style="color:var(--text-muted);font-size:11px">Aucun vote</span>';
    }

    row.innerHTML = `
      <span class="result-category">${cat.name}</span>
      ${announced
        ? `<span class="result-winner">${cat.nominees[winnerIdx].name}</span>`
        : `<span class="result-pending">En attente…</span>`
      }
      <div class="result-picks">${picksHtml}</div>
    `;
    table.appendChild(row);
  });
}

// =====================================================
// ADMIN — Manual winner entry
// =====================================================
function populateAdminSelect() {
  const catSel = document.getElementById('adminCategory');
  if (catSel.children.length > 1) return;
  CATEGORIES.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name;
    catSel.appendChild(opt);
  });

  // Populate nominee dropdown when category changes
  catSel.addEventListener('change', () => {
    const nomSel = document.getElementById('adminWinner');
    nomSel.innerHTML = '<option value="">-- Choisir le gagnant --</option>';
    const cat = CATEGORIES.find(c => c.id === catSel.value);
    if (!cat) return;
    cat.nominees.forEach((n, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = n.name + (n.film ? ` — ${n.film}` : '');
      nomSel.appendChild(opt);
    });
  });
}

window.toggleAdmin = function () {
  const panel = document.getElementById('adminPanel');
  const arrow = document.getElementById('adminArrow');
  panel.classList.toggle('hidden');
  arrow.textContent = panel.classList.contains('hidden') ? '▼' : '▲';
};

window.adminSetWinner = async function () {
  const catId  = document.getElementById('adminCategory').value;
  const idxStr = document.getElementById('adminWinner').value;
  const fb     = document.getElementById('adminFeedback');

  if (!catId || idxStr === '') { fb.style.color = 'var(--red)'; fb.textContent = 'Choisis une catégorie et un gagnant.'; return; }

  const cat = CATEGORIES.find(c => c.id === catId);
  const idx = parseInt(idxStr, 10);

  await update(ref(db, 'winners'), { [catId]: idx });
  fb.style.color = 'var(--green)';
  fb.textContent = `✓ Gagnant enregistré : ${cat.nominees[idx].name}`;
  document.getElementById('adminWinner').value = '';
};

// =====================================================
// SCRAPER — GitHub Actions handles this automatically.
// This button calls a Cloud Function / proxy if set up.
// =====================================================
window.manualScrape = async function () {
  const fb = document.getElementById('scraperFeedback');
  fb.style.color = 'var(--text-muted)';
  fb.textContent = 'Scraping Wikipedia…';

  // The GitHub Actions scraper runs automatically every 5 min.
  // This button is just a convenience notice.
  fb.style.color = 'var(--gold)';
  fb.textContent = 'Le scraper GitHub Actions tourne automatiquement toutes les 5 min. Utilise le mode admin pour forcer un résultat.';
};

// =====================================================
// UTILS
// =====================================================
function safeName(name) {
  return name.replace(/[.#$/[\]]/g, '_').trim();
}

function decodeName(name) {
  return name.replace(/_/g, ' ');
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.add('hidden'), 300);
  }, 3000);
}
