const pathDisplay = document.getElementById('pathDisplay');
const browseBtn = document.getElementById('browseBtn');
const playBtn = document.getElementById('playBtn');
const hintMsg = document.getElementById('hintMsg');
const minBtn = document.getElementById('minBtn');
const closeBtn = document.getElementById('closeBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const bgMusic = document.getElementById('bgMusic');
const muteBtn = document.getElementById('muteBtn');
const customBackground = document.getElementById('customBackground');
const infoContent = document.getElementById('infoContent');
const refreshInfoBtn = document.getElementById('refreshInfoBtn');
const versionLabel = document.getElementById('versionLabel');
const updateOverlay = document.getElementById('updateOverlay');
const updateText = document.getElementById('updateText');
const patchnotesBtn = document.getElementById('patchnotesBtn');
const patchnotesModal = document.getElementById('patchnotesModal');
const patchnotesBackdrop = document.getElementById('patchnotesBackdrop');
const closePatchnotesBtn = document.getElementById('closePatchnotesBtn');
const repairBtn = document.getElementById('repairBtn');
const serverStatus = document.getElementById('serverStatus');
const serverStatusLabel = document.getElementById('serverStatusLabel');
function setHint(text, type) {
  hintMsg.textContent = text || '';
  hintMsg.className = 'hint-msg' + (type ? ' ' + type : '');
}

function updatePathUI(exePath) {
  if (exePath) {
    pathDisplay.value = exePath;
    playBtn.disabled = false;
    setHint('Ready to play.', 'success');
  } else {
    pathDisplay.value = '';
    playBtn.disabled = true;
    setHint('Click the gear icon in the top right to select your Wow.exe.');
  }
}

// Het meegeleverde bestand in de installer; wordt gebruikt zolang er geen
// achtergrond vanaf GitHub is.
const LOCAL_BACKGROUND = 'assets/theme.jpg';
const LOCAL_MUSIC = 'assets/music/theme.mp3';

function applyBackground() {
  // Geen achtergrond beschikbaar (geen assets/theme.jpg en niets op GitHub)?
  // Dan blijft de ingebouwde ijslandschap-illustratie (bg-default) zichtbaar.
  customBackground.addEventListener('error', () => {
    customBackground.style.display = 'none';
  });
}

// ---- Thema-assets: achtergrond en muziek die van GitHub kunnen komen ----
function applyThemeAssets(assets) {
  const data = assets || {};

  const backgroundSrc = data.background || LOCAL_BACKGROUND;
  if (!customBackground.src.endsWith(backgroundSrc)) {
    customBackground.style.display = '';
    customBackground.src = backgroundSrc;
  }

  const musicSrc = data.music || LOCAL_MUSIC;
  if (!bgMusic.src.endsWith(musicSrc)) {
    // Bewaar de mute-stand en het volume: die horen bij de gebruiker, niet
    // bij het bestand.
    const wasMuted = bgMusic.muted;
    bgMusic.src = musicSrc;
    bgMusic.load();
    bgMusic.muted = wasMuted;
    bgMusic.volume = 0.35;
    if (musicInitialised && !musicStopped) tryPlayMusic();
  }
}

async function init() {
  const cfg = await window.launcherAPI.getConfig();
  updatePathUI(cfg && cfg.exePath ? cfg.exePath : null);
  applyBackground();
  initMusic(cfg.musicMuted);
  checkPatchnotesBadge();

  const version = await window.launcherAPI.getAppVersion();
  versionLabel.textContent = 'v' + version;
}

// ---- Achtergrondmuziek ----
// musicInitialised: de mute-stand van de gebruiker is ingelezen, dus we mogen
// beginnen met spelen. musicStopped: het spel is gestart, dus niet meer
// opnieuw beginnen (ook niet als er intussen andere muziek binnenkomt).
let musicInitialised = false;
let musicStopped = false;

function setMuteIcon(muted) {
  muteBtn.textContent = muted ? '\u{1F507}' : '\u{1F50A}'; // 🔇 / 🔊
  muteBtn.title = muted ? 'Turn music on' : 'Turn music off';
  muteBtn.classList.toggle('is-muted', muted);
}

function tryPlayMusic() {
  bgMusic.play().catch(() => {
    // Sommige browsers/OS-instellingen blokkeren autoplay; start alsnog
    // zodra de gebruiker ergens klikt.
    document.addEventListener('click', () => {
      if (!musicStopped) bgMusic.play().catch(() => {});
    }, { once: true });
  });
}

function initMusic(muted) {
  bgMusic.volume = 0.35;
  bgMusic.muted = !!muted;
  setMuteIcon(!!muted);
  musicInitialised = true;
  tryPlayMusic();
}

muteBtn.addEventListener('click', async () => {
  const newMuted = !bgMusic.muted;
  bgMusic.muted = newMuted;
  setMuteIcon(newMuted);
  await window.launcherAPI.setMusicMuted(newMuted);
});

// ---- Instellingenpaneel (tandwiel) ----
function toggleSettings(forceOpen) {
  const shouldOpen = forceOpen !== undefined ? forceOpen : settingsPanel.classList.contains('hidden');
  settingsPanel.classList.toggle('hidden', !shouldOpen);
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePatchnotes(false);
  toggleSettings();
});

document.addEventListener('click', (e) => {
  if (!settingsPanel.classList.contains('hidden') &&
      !settingsPanel.contains(e.target) &&
      e.target !== settingsBtn) {
    toggleSettings(false);
  }
});

// ---- Bladeren (spel) ----
browseBtn.addEventListener('click', async () => {
  const exePath = await window.launcherAPI.browseExe();
  if (exePath) {
    updatePathUI(exePath);
    toggleSettings(false);
  }
});

// ---- Repareren ----
// Het main-process vraagt eerst om bevestiging in een echt Windows-venster.
// Zegt de gebruiker ja, dan wordt de nieuwste versie opnieuw gedownload en
// herstart de launcher; de update-overlay verschijnt via 'update-status'.
repairBtn.addEventListener('click', async () => {
  repairBtn.disabled = true;
  toggleSettings(false);

  try {
    const result = await window.launcherAPI.repairLauncher();
    if (result && result.cancelled) {
      setHint('Repair cancelled.');
    } else if (result && !result.ok) {
      setHint(result.error || 'Could not repair the installation.', 'error');
    }
  } finally {
    repairBtn.disabled = false;
  }
});

// ---- Spelen ----
playBtn.addEventListener('click', async () => {
  const exePath = pathDisplay.value;
  if (!exePath) return;

  musicStopped = true;
  bgMusic.pause();

  playBtn.disabled = true;
  setHint('Starting the game...');

  const result = await window.launcherAPI.launchGame(exePath);

  if (result.ok) {
    setHint('Game started!', 'success');
  } else {
    setHint(result.error || 'Could not start the game.', 'error');
  }

  setTimeout(() => {
    playBtn.disabled = false;
  }, 2000);
});

minBtn.addEventListener('click', () => window.launcherAPI.minimize());
closeBtn.addEventListener('click', () => window.launcherAPI.close());

// ---- Patchnotes (los te openen paneel) ----
async function checkPatchnotesBadge() {
  const result = await window.launcherAPI.checkNewPatchnotes();
  patchnotesBtn.classList.toggle('has-unread', !!(result && result.ok && result.hasNew));
}

function togglePatchnotes(forceOpen) {
  const shouldOpen = forceOpen !== undefined ? forceOpen : patchnotesModal.classList.contains('hidden');
  patchnotesModal.classList.toggle('hidden', !shouldOpen);
  if (shouldOpen) loadPatchnotes();
}

// Bouwt tekst/<strong>/<em>-knopen op uit segmenten en voegt ze toe aan parent.
function appendSegments(parent, segments) {
  for (const seg of segments) {
    let node;
    if (seg.bold) {
      node = document.createElement('strong');
      node.textContent = seg.text;
    } else if (seg.italic) {
      node = document.createElement('em');
      node.textContent = seg.text;
    } else {
      node = document.createTextNode(seg.text);
    }
    parent.appendChild(node);
  }
}

const HEADING_TAGS = { 1: 'h3', 2: 'h4', 3: 'h5' };

let patchnotesLoading = false;

async function loadPatchnotes() {
  // Twee keer tegelijk laden heeft geen zin en maakt de knop verwarrend.
  if (patchnotesLoading) return;
  patchnotesLoading = true;
  refreshInfoBtn.classList.add('is-busy');

  infoContent.innerHTML = '';
  infoContent.classList.remove('error');
  infoContent.textContent = 'Loading...';

  let result;
  try {
    result = await window.launcherAPI.getPatchnotes();
  } finally {
    patchnotesLoading = false;
    refreshInfoBtn.classList.remove('is-busy');
  }

  infoContent.innerHTML = '';

  if (!result.ok) {
    infoContent.textContent = result.error || 'Could not load the patch notes.';
    infoContent.classList.add('error');
    return;
  }

  if (!result.blocks || result.blocks.length === 0) {
    infoContent.textContent = '(empty file)';
  } else {
    for (const block of result.blocks) {
      if (block.type === 'image') {
        const img = document.createElement('img');
        img.src = block.dataUrl;
        img.alt = block.alt || '';
        img.className = 'patchnote-image';
        infoContent.appendChild(img);
      } else if (block.type === 'heading') {
        const level = Math.min(Math.max(block.level, 1), 3);
        const heading = document.createElement(HEADING_TAGS[level]);
        heading.className = 'patchnote-heading patchnote-heading-' + level;
        appendSegments(heading, block.segments);
        infoContent.appendChild(heading);
      } else {
        const p = document.createElement('p');
        p.className = 'patchnote-text' + (block.error ? ' error' : '');
        block.lineSegments.forEach((lineSegments, i) => {
          if (i > 0) p.appendChild(document.createElement('br'));
          appendSegments(p, lineSegments);
        });
        infoContent.appendChild(p);
      }
    }
  }

  // Gelezen: badge verdwijnt tot er weer een nieuwe hash op GitHub staat.
  if (result.hash) {
    await window.launcherAPI.markPatchnotesRead(result.hash);
    patchnotesBtn.classList.remove('has-unread');
  }
}

patchnotesBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleSettings(false);
  togglePatchnotes();
});

closePatchnotesBtn.addEventListener('click', () => togglePatchnotes(false));
patchnotesBackdrop.addEventListener('click', () => togglePatchnotes(false));

refreshInfoBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  loadPatchnotes();
});

// ---- Auto-update: statusmeldingen van het main-process ----
window.launcherAPI.onUpdateStatus((data) => {
  if (data.status === 'updating') {
    updateOverlay.classList.remove('hidden');
    updateText.textContent = data.message || `Updating to version ${data.version}...`;
  } else if (data.status === 'restarting') {
    updateText.textContent = 'Update complete \u2014 restarting the launcher...';
  } else if (data.status === 'error') {
    updateOverlay.classList.add('hidden');
    setHint('Automatic update failed: ' + data.message, 'error');
  }
  // 'up-to-date' -> geen actie nodig, blijft onopgemerkt op de achtergrond
});

// ---- Thema-assets: achtergrond en muziek uit servercon/theme/ op GitHub ----
// Wordt bij elke start twee keer gestuurd: eerst wat er in de cache zit
// (meteen zichtbaar, ook zonder internet), daarna de verse versie als er iets
// gewijzigd is.
window.launcherAPI.onThemeAssets(applyThemeAssets);

// ---- Realm-status: bolletje naast het versienummer ----
// Groen = de logon-server neemt verbindingen aan, rood = niet. Het main
// process test dit elke minuut; klikken op het bolletje test meteen.
const OFFLINE_REASONS = {
  timeout: 'no response in time',
  ENOTFOUND: 'host name not found',
  ECONNREFUSED: 'connection refused',
  ETIMEDOUT: 'connection timed out',
  EHOSTUNREACH: 'host unreachable',
  ENETUNREACH: 'network unreachable',
};

function applyServerStatus(data) {
  if (!data) return;

  const online = data.state === 'online';
  serverStatus.classList.remove('is-checking', 'is-online', 'is-offline');
  serverStatus.classList.add(online ? 'is-online' : 'is-offline');
  serverStatusLabel.textContent = online ? 'Realm online' : 'Realm offline';

  const target = `${data.host}:${data.port}`;
  const checked = data.checkedAt
    ? new Date(data.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const detail = online
    ? `responded in ${data.latencyMs} ms`
    : (OFFLINE_REASONS[data.reason] || 'not reachable');

  serverStatus.title =
    `${target} — ${detail}` +
    (checked ? `\nLast checked at ${checked}` : '') +
    '\nClick to check again';
}

function setServerStatusChecking() {
  serverStatus.classList.remove('is-online', 'is-offline');
  serverStatus.classList.add('is-checking');
  serverStatusLabel.textContent = 'Checking...';
  serverStatus.title = 'Checking realm status...';
}

window.launcherAPI.onServerStatus(applyServerStatus);

serverStatus.addEventListener('click', async (e) => {
  e.stopPropagation();
  setServerStatusChecking();
  await window.launcherAPI.checkServerStatus();
});

// ---- IJzige sliert achter de draak ----
// De draak beweegt met een CSS-animatie, dus we lezen zijn werkelijke
// positie uit en zetten daar wolkjes neer. Die blijven achter waar ze
// gezet zijn en verdwijnen na iets meer dan een seconde - vandaar de
// indruk van een sliert die achterblijft en optrekt.
function startFrostTrail() {
  const track = document.querySelector('.runner-track');
  const dragon = document.querySelector('.runner-dragon');
  if (!track || !dragon) return;

  // Wie beweging uitgezet heeft, krijgt ook geen sliert.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Tijdens de overvlucht elke 90 ms een wolkje; daarbuiten alleen af en toe
  // kijken of de draak er al is. De draak is 31 van de 34 seconden weg, dus
  // dat scheelt onnodig werk terwijl de launcher openstaat.
  const SPAWN_MS = 90;
  const IDLE_MS = 400;

  const tick = () => {
    let next = IDLE_MS;

    if (!document.hidden) {
      const t = track.getBoundingClientRect();
      const d = dragon.getBoundingClientRect();

      if (d.right >= t.left && d.left <= t.right) {
        next = SPAWN_MS;
        spawnWisp(track, dragon, t, d);
      }
    }

    setTimeout(tick, next);
  };

  tick();
}

function spawnWisp(track, dragon, t, d) {
  // Vlak achter het lichaam, ter hoogte van de staart.
  const x = d.left - t.left + d.width * (0.12 + Math.random() * 0.22);
  const y = d.top - t.top + d.height * (0.5 + Math.random() * 0.3);
  if (x < -20 || x > t.width + 20) return;

  const wisp = document.createElement('div');
  const shard = Math.random() < 0.22;
  const size = shard ? 2 + Math.random() * 2 : 5 + Math.random() * 8;

  wisp.className = 'frost-wisp' + (shard ? ' shard' : '');
  wisp.style.left = x.toFixed(1) + 'px';
  wisp.style.top = y.toFixed(1) + 'px';
  wisp.style.width = size.toFixed(1) + 'px';
  wisp.style.height = size.toFixed(1) + 'px';
  wisp.style.setProperty('--life', (1100 + Math.random() * 700).toFixed(0) + 'ms');
  wisp.style.setProperty('--dx', (-14 - Math.random() * 16).toFixed(1) + 'px');
  wisp.style.setProperty('--dy', (2 + Math.random() * 10).toFixed(1) + 'px');
  wisp.style.setProperty('--spin', (Math.random() * 90 - 45).toFixed(0) + 'deg');

  // Onder de draak invoegen, en zichzelf opruimen zodra de animatie klaar is.
  track.insertBefore(wisp, dragon);
  wisp.addEventListener('animationend', () => wisp.remove(), { once: true });
}

// ---- Ambient snow ----
function spawnSnow() {
  const overlay = document.getElementById('frostOverlay');
  const count = 40;
  for (let i = 0; i < count; i++) {
    const flake = document.createElement('div');
    flake.className = 'flake';
    const size = (Math.random() * 2.5 + 1.5).toFixed(1);
    flake.style.width = size + 'px';
    flake.style.height = size + 'px';
    flake.style.left = Math.random() * 100 + 'vw';
    flake.style.opacity = (Math.random() * 0.4 + 0.2).toFixed(2);
    const duration = Math.random() * 12 + 10;
    flake.style.animationDuration = duration + 's';
    flake.style.animationDelay = (-Math.random() * duration) + 's';
    overlay.appendChild(flake);
  }
}

spawnSnow();
startFrostTrail();
init();
