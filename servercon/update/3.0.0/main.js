const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { spawn, exec } = require('child_process');

// Persoonlijke instellingen van de speler (exe-pad, mute, gelezen patchnotes).
// Staat per gebruiker in %APPDATA%.
const CONFIG_PATH = () => path.join(app.getPath('userData'), 'launcher-config.json');

// De bron-instellingen (welke publieke GitHub-repo) worden MEEGELEVERD met de
// app zelf, in source-config.json naast dit bestand. Spelers hoeven dus
// helemaal niets in te stellen: ze installeren de launcher en die weet al waar
// de patchnotes en updates staan. Geen login of wachtwoord nodig - alles gaat
// via publieke, niet-ingelogde HTTP-links.
const SOURCE_CONFIG_PATH = () => path.join(app.getAppPath(), 'source-config.json');

// Fallback als source-config.json ontbreekt of onleesbaar is. De lege
// owner/repo zorgen voor een duidelijke foutmelding in plaats van vage
// netwerkfouten.
const DEFAULT_SOURCE_CONFIG = {
  owner: '',
  repo: '',
  branch: 'main',
  infoFilePath: 'servercon/patchnotes.txt',
  updateFolderPath: 'servercon/update',
  themeFolderPath: 'servercon/theme',
};

const SOURCE_NOT_CONFIGURED =
  'De bron-repository is niet ingesteld. Vul "owner" en "repo" in source-config.json in ' +
  'voordat je een installer bouwt.';

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH(), 'utf-8');
    const cfg = JSON.parse(raw);
    return {
      exePath: cfg.exePath || null,
      musicMuted: !!cfg.musicMuted,
      patchnotesLastSeenHash: cfg.patchnotesLastSeenHash || null,
    };
  } catch (e) {
    return { exePath: null, musicMuted: false, patchnotesLastSeenHash: null };
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2), 'utf-8');
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

// ---- GitHub: publieke, niet-ingelogde HTTP-helpers ----
// raw.githubusercontent.com serveert bestanden uit een publieke repo
// zonder enige login. api.github.com vereist wel een User-Agent header
// (anders 403), maar ook daar is geen token/login voor nodig zolang de
// repo publiek is.

function rawUrl(cfg, filePath) {
  return `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${filePath}`;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kon ${url} niet ophalen (HTTP ${res.status}).`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kon ${url} niet ophalen (HTTP ${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchDataUrl(url, ext) {
  const buffer = await fetchBuffer(url);
  const mime = IMAGE_MIME_TYPES[ext.toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'wotlk-launcher' } });
  if (!res.ok) throw new Error(`Kon ${url} niet ophalen (HTTP ${res.status}).`);
  return res.json();
}

// Splitst de platte-tekst patchnotes op in tekst-, titel- en
// afbeeldingsblokken. Een regel met  ![omschrijving](bestandsnaam.jpg)
// op zichzelf wordt een afbeelding; een regel die begint met #, ## of ###
// wordt een titel/kopje; al de rest blijft gewone tekst.
function parsePatchnotes(content) {
  const lines = content.split(/\r?\n/);
  const blocks = [];
  let textBuffer = [];
  const imageLineRegex = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
  const headingLineRegex = /^(#{1,3})\s+(.+)$/;

  const flushText = () => {
    if (textBuffer.length > 0) {
      blocks.push({ type: 'text', lines: textBuffer.slice() });
      textBuffer = [];
    }
  };

  for (const line of lines) {
    const imgMatch = line.match(imageLineRegex);
    if (imgMatch) {
      flushText();
      blocks.push({ type: 'image', alt: imgMatch[1], relativePath: imgMatch[2].trim() });
      continue;
    }

    const headMatch = line.match(headingLineRegex);
    if (headMatch) {
      flushText();
      blocks.push({ type: 'heading', level: headMatch[1].length, text: headMatch[2] });
      continue;
    }

    textBuffer.push(line);
  }
  flushText();

  return blocks;
}

// Ontleedt **vet**, *cursief* en _cursief_ binnen één regel tekst naar een
// reeks segmenten die de renderer als losse tekstknopen/<strong>/<em>
// kan opbouwen.
function parseInlineFormatting(line) {
  const segments = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      segments.push({ text: match[1], bold: true });
    } else if (match[2] !== undefined) {
      segments.push({ text: match[2], italic: true });
    } else if (match[3] !== undefined) {
      segments.push({ text: match[3], italic: true });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex) });
  }
  if (segments.length === 0) {
    segments.push({ text: line });
  }

  return segments;
}

// ---- Bron-configuratie (meegeleverd in de app, niets in te stellen) ----

// Leest source-config.json uit de app-map. Dit bestand wordt door de
// updater meegekopieerd, dus een nieuwe versie kan de repo desnoods
// verhuizen zonder dat spelers iets moeten doen.
function readSourceConfig() {
  try {
    const raw = fs.readFileSync(SOURCE_CONFIG_PATH(), 'utf-8');
    const cfg = { ...DEFAULT_SOURCE_CONFIG, ...JSON.parse(raw) };
    return {
      owner: String(cfg.owner || '').trim(),
      repo: String(cfg.repo || '').trim(),
      branch: String(cfg.branch || 'main').trim(),
      infoFilePath: String(cfg.infoFilePath || DEFAULT_SOURCE_CONFIG.infoFilePath).trim(),
      updateFolderPath: String(cfg.updateFolderPath || DEFAULT_SOURCE_CONFIG.updateFolderPath).trim(),
      themeFolderPath: String(cfg.themeFolderPath || DEFAULT_SOURCE_CONFIG.themeFolderPath).trim(),
    };
  } catch (e) {
    return { ...DEFAULT_SOURCE_CONFIG };
  }
}

function isSourceConfigured(cfg) {
  return !!(cfg && cfg.owner && cfg.repo);
}

// ---- Thema-assets (achtergrond & muziek) vanaf GitHub ----
// De achtergrond en de muziek staan in servercon/theme/ op GitHub, als
// background.<ext> en music.<ext>. Bij elke start vergelijkt de launcher de
// blob-SHA uit de bestandslijst (die we voor de update-controle toch al
// ophalen - dus geen extra API-aanvraag) met wat er in de cache zit, en
// downloadt alleen wat echt gewijzigd is. Zo kan de sfeer van de launcher
// aangepast worden zonder een nieuwe versie uit te brengen.

const THEME_CACHE_DIR = () => path.join(app.getPath('userData'), 'theme-cache');
const THEME_CACHE_MANIFEST = () => path.join(THEME_CACHE_DIR(), 'theme-cache.json');

const THEME_SLOTS = {
  background: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'],
  music: ['.mp3', '.ogg', '.oga', '.m4a', '.wav', '.flac'],
};

function readThemeCache() {
  try {
    return JSON.parse(fs.readFileSync(THEME_CACHE_MANIFEST(), 'utf-8')) || {};
  } catch (e) {
    return {};
  }
}

function writeThemeCache(manifest) {
  try {
    fs.mkdirSync(THEME_CACHE_DIR(), { recursive: true });
    fs.writeFileSync(THEME_CACHE_MANIFEST(), JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (e) {
    // Niet kunnen cachen is niet fataal: dan wordt er volgende keer opnieuw
    // gedownload.
  }
}

// Zet de cache om in file://-URL's die de UI direct kan gebruiken. Bestanden
// die intussen verdwenen zijn, worden overgeslagen.
function themeUrlsFromCache(manifest) {
  const urls = {};
  for (const slot of Object.keys(THEME_SLOTS)) {
    const entry = manifest[slot];
    if (!entry || !entry.file) continue;
    const full = path.join(THEME_CACHE_DIR(), entry.file);
    urls[slot] = fs.existsSync(full) ? pathToFileURL(full).href : null;
  }
  return urls;
}

function removeCachedFile(fileName) {
  if (!fileName) return;
  try {
    fs.unlinkSync(path.join(THEME_CACHE_DIR(), fileName));
  } catch (e) {
    // bestond al niet meer
  }
}

// Zoekt in de bestandslijst naar servercon/theme/<slot>.<ext>.
function findThemeBlob(tree, themePrefix, slot) {
  const allowed = THEME_SLOTS[slot];
  const matches = tree.filter((entry) => {
    if (entry.type !== 'blob' || !entry.path.startsWith(themePrefix)) return false;
    const rest = entry.path.slice(themePrefix.length);
    if (!rest || rest.includes('/')) return false;
    // Let op: de extensie moet met de originele schrijfwijze van het pad
    // afgeknipt worden, anders wordt "background.JPG" niet herkend.
    const rawExt = path.posix.extname(rest);
    const base = path.posix.basename(rest, rawExt).toLowerCase();
    return base === slot && allowed.includes(rawExt.toLowerCase());
  });

  // Staan er per ongeluk twee (background.jpg én background.png), dan kiezen
  // we er altijd dezelfde, zodat het niet per opstart wisselt.
  matches.sort((a, b) => a.path.localeCompare(b.path));
  return matches[0] || null;
}

async function syncThemeAssets(cfg, tree) {
  const manifest = readThemeCache();
  if (!cfg.themeFolderPath) return themeUrlsFromCache(manifest);

  const themePrefix = cfg.themeFolderPath.replace(/\/+$/, '') + '/';
  let changed = false;

  for (const slot of Object.keys(THEME_SLOTS)) {
    const blob = findThemeBlob(tree, themePrefix, slot);
    const cached = manifest[slot];

    // Staat het bestand niet meer op GitHub? Dan de cache ook leegmaken,
    // zodat de launcher terugvalt op wat in de installer zit.
    if (!blob) {
      if (cached) {
        removeCachedFile(cached.file);
        delete manifest[slot];
        changed = true;
      }
      continue;
    }

    const fileName = slot + path.posix.extname(blob.path).toLowerCase();
    const fullPath = path.join(THEME_CACHE_DIR(), fileName);
    const upToDate = cached && cached.sha === blob.sha && cached.file === fileName && fs.existsSync(fullPath);
    if (upToDate) continue;

    try {
      const buffer = await fetchBuffer(rawUrl(cfg, blob.path));
      fs.mkdirSync(THEME_CACHE_DIR(), { recursive: true });
      fs.writeFileSync(fullPath, buffer);
      if (cached && cached.file && cached.file !== fileName) removeCachedFile(cached.file);
      manifest[slot] = { sha: blob.sha, file: fileName };
      changed = true;
    } catch (e) {
      // Download mislukt (offline, bestand te groot, ...): laat de bestaande
      // cache staan en probeer het volgende keer opnieuw.
    }
  }

  if (changed) writeThemeCache(manifest);
  return themeUrlsFromCache(manifest);
}

let mainWindow;

// ---- Versiebeheer & auto-update ----

function getLocalVersion() {
  try {
    return fs.readFileSync(path.join(app.getAppPath(), 'version.txt'), 'utf-8').trim();
  } catch (e) {
    return '0.0.0';
  }
}

function isValidVersion(name) {
  return /^\d+\.\d+\.\d+$/.test(name);
}

// Retourneert > 0 als a nieuwer is dan b, < 0 als ouder, 0 als gelijk.
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

// Test of we zonder beheerdersrechten naar deze map mogen schrijven
// (bv. niet het geval bij een installatie in C:\Program Files).
function canWriteToDir(dir) {
  try {
    const testFile = path.join(dir, `.write-test-${Date.now()}.tmp`);
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch (e) {
    return false;
  }
}

// Bouwt en start een los .bat-script dat:
//  1) wacht tot dit programma volledig afgesloten is (zodat Windows de
//     bestandsvergrendeling op de actief gebruikte app-bestanden loslaat),
//  2) de nieuwe bestanden (al klaargezet in stagingDir) over de
//     geïnstalleerde versie kopieert,
//  3) de launcher opnieuw opstart,
//  4) zichzelf en de tijdelijke map opruimt.
// Als de doelmap beheerdersrechten vereist (bv. Program Files), wordt het
// script via UAC verheven uitgevoerd.
function launchUpdaterAndQuit(stagingDir, targetDir, exePath, needsElevation) {
  return new Promise((resolve, reject) => {
    const batPath = path.join(os.tmpdir(), `wotlk-updater-${Date.now()}.bat`);
    const exeName = path.basename(exePath);

    const batContent =
      `@echo off\r\n` +
      `:waitloop\r\n` +
      `tasklist /FI "IMAGENAME eq ${exeName}" 2>NUL | find /I "${exeName}" >NUL\r\n` +
      `if not errorlevel 1 (\r\n` +
      `  timeout /t 1 /nobreak >NUL\r\n` +
      `  goto waitloop\r\n` +
      `)\r\n` +
      `timeout /t 1 /nobreak >NUL\r\n` +
      `xcopy "${stagingDir}\\*" "${targetDir}\\" /E /I /Y /H\r\n` +
      `rd /s /q "${stagingDir}"\r\n` +
      `start "" "${exePath}"\r\n` +
      `del "%~f0"\r\n`;

    fs.writeFileSync(batPath, batContent, 'utf-8');

    if (needsElevation) {
      const psCommand = `Start-Process -FilePath '${batPath}' -Verb RunAs -WindowStyle Hidden`;
      exec(`powershell -NoProfile -Command "${psCommand}"`, (err) => {
        if (err) {
          reject(new Error('De update vereist beheerdersrechten. Bevestig het UAC-venster, of installeer de launcher buiten "Program Files".'));
          return;
        }
        resolve();
      });
    } else {
      const child = spawn('cmd.exe', ['/c', batPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      resolve();
    }
  });
}

function sendUpdateStatus(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', data);
  }
}

function sendThemeAssets(urls) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-assets', urls || {});
  }
}

// Haalt de volledige bestandsboom van de repo op. Dit is de enige
// api.github.com-aanvraag die de launcher doet, en zowel de update-controle
// als de thema-assets werken ermee.
async function fetchRepoTree(cfg) {
  const treeUrl = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/trees/${cfg.branch}?recursive=1`;
  const treeData = await fetchJson(treeUrl);
  if (!treeData || !Array.isArray(treeData.tree)) return null;
  return treeData.tree;
}

// Bij elke start, in deze volgorde:
//  1) meteen tonen wat er in de thema-cache zit (werkt ook zonder internet),
//  2) de bestandsboom ophalen,
//  3) is er een nieuwere launcher-versie? dan bijwerken en herstarten,
//  4) zo niet: de thema-assets vernieuwen als ze op GitHub gewijzigd zijn.
async function runStartupSync() {
  sendThemeAssets(themeUrlsFromCache(readThemeCache()));

  const cfg = readSourceConfig();
  if (!isSourceConfigured(cfg)) {
    sendUpdateStatus({ status: 'error', message: SOURCE_NOT_CONFIGURED });
    return;
  }

  let tree;
  try {
    tree = await fetchRepoTree(cfg);
  } catch (err) {
    sendUpdateStatus({ status: 'error', message: err.message });
    return;
  }

  if (!tree) {
    sendUpdateStatus({ status: 'up-to-date' });
    return;
  }

  const isUpdating = await checkForUpdates(cfg, tree);
  if (isUpdating) return; // de launcher sluit zichzelf af en herstart

  try {
    sendThemeAssets(await syncThemeAssets(cfg, tree));
  } catch (err) {
    // Een mislukte thema-sync mag de launcher nooit blokkeren.
  }
}

// Retourneert true als er een update gestart is (en de launcher dus gaat
// afsluiten), false als de launcher gewoon door kan.
async function checkForUpdates(cfg, tree) {
  if (!cfg.updateFolderPath) {
    sendUpdateStatus({ status: 'up-to-date' });
    return false;
  }

  try {
    const updatePrefix = cfg.updateFolderPath.replace(/\/+$/, '') + '/';
    const localVersion = getLocalVersion();

    // Directe submappen (versienummers) net onder de update-map.
    const versionNames = new Set();
    for (const entry of tree) {
      if (entry.type === 'tree' && entry.path.startsWith(updatePrefix)) {
        const rest = entry.path.slice(updatePrefix.length);
        if (rest && !rest.includes('/')) versionNames.add(rest);
      }
    }

    let newestVersion = null;
    for (const name of versionNames) {
      if (isValidVersion(name) && compareVersions(name, localVersion) > 0) {
        if (!newestVersion || compareVersions(name, newestVersion) > 0) {
          newestVersion = name;
        }
      }
    }

    if (!newestVersion) {
      sendUpdateStatus({ status: 'up-to-date' });
      return false;
    }

    sendUpdateStatus({ status: 'updating', version: newestVersion, message: `Update ${newestVersion} downloaden...` });

    const versionPrefix = `${updatePrefix}${newestVersion}/`;
    const filesToDownload = tree.filter(
      (entry) => entry.type === 'blob' && entry.path.startsWith(versionPrefix)
    );

    // Stap 1: download eerst alles naar een tijdelijke map. Dit raakt geen
    // enkel bestand dat de draaiende launcher op dit moment gebruikt, dus
    // dit kan altijd, ongeacht bestandsvergrendelingen.
    const stagingDir = path.join(os.tmpdir(), `wotlk-update-staging-${Date.now()}`);
    fs.mkdirSync(stagingDir, { recursive: true });

    for (const file of filesToDownload) {
      const relPath = file.path.slice(versionPrefix.length);
      const destPath = path.join(stagingDir, ...relPath.split('/'));
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const buffer = await fetchBuffer(rawUrl(cfg, file.path));
      fs.writeFileSync(destPath, buffer);
    }

    // Zet het versienummer alvast goed in de staging-map, zodat het na de
    // echte kopieerstap altijd overeenkomt met de map die op GitHub stond -
    // dit voorkomt een oneindige update-loop.
    fs.writeFileSync(path.join(stagingDir, 'version.txt'), newestVersion + '\n', 'utf-8');

    const targetDir = app.getAppPath();
    const exePath = process.execPath;
    const needsElevation = !canWriteToDir(targetDir);

    sendUpdateStatus({
      status: 'updating',
      version: newestVersion,
      message: needsElevation
        ? 'Beheerdersrechten vereist — bevestig het UAC-venster...'
        : `Bijwerken naar versie ${newestVersion}... de launcher herstart zo.`,
    });

    await launchUpdaterAndQuit(stagingDir, targetDir, exePath, needsElevation);

    // Het externe script neemt het vanaf hier over: het wacht tot dit
    // proces volledig gestopt is, kopieert dan de bestanden, en start de
    // launcher opnieuw. Geef de UI heel even de tijd om de boodschap te
    // tonen voor we echt afsluiten.
    setTimeout(() => {
      app.exit(0);
    }, 800);

    return true;
  } catch (err) {
    sendUpdateStatus({ status: 'error', message: err.message });
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 640,
    minWidth: 800,
    minHeight: 520,
    frame: false,
    resizable: true,
    backgroundColor: '#05080c',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools({ mode: 'detach' }); // debug indien nodig

  mainWindow.webContents.once('did-finish-load', () => {
    runStartupSync();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC handlers ----

ipcMain.handle('get-config', () => {
  return readConfig();
});

ipcMain.handle('browse-exe', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecteer de spel-executable (bv. Wow.exe)',
    properties: ['openFile'],
    filters: [
      { name: 'Programma', extensions: ['exe'] },
      { name: 'Alle bestanden', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const exePath = result.filePaths[0];
  const cfg = readConfig();
  cfg.exePath = exePath;
  writeConfig(cfg);
  return exePath;
});

ipcMain.handle('set-music-muted', (_event, muted) => {
  const cfg = readConfig();
  cfg.musicMuted = !!muted;
  writeConfig(cfg);
  return cfg;
});

ipcMain.handle('get-patchnotes', async () => {
  const cfg = readSourceConfig();

  if (!isSourceConfigured(cfg)) {
    return { ok: false, error: SOURCE_NOT_CONFIGURED };
  }

  try {
    const content = await fetchText(rawUrl(cfg, cfg.infoFilePath));
    const hash = hashContent(content);
    const rawBlocks = parsePatchnotes(content);
    const baseDir = path.posix.dirname(cfg.infoFilePath);

    const blocks = await Promise.all(rawBlocks.map(async (block) => {
      if (block.type === 'image') {
        const imgRelPath = path.posix.join(baseDir, block.relativePath);
        const ext = path.extname(imgRelPath);
        try {
          const dataUrl = await fetchDataUrl(rawUrl(cfg, imgRelPath), ext);
          return { type: 'image', alt: block.alt, dataUrl };
        } catch (e) {
          return {
            type: 'text',
            lineSegments: [parseInlineFormatting(`[Afbeelding niet gevonden: ${block.relativePath}]`)],
            error: true,
          };
        }
      }

      if (block.type === 'heading') {
        return {
          type: 'heading',
          level: block.level,
          segments: parseInlineFormatting(block.text),
        };
      }

      // type 'text'
      return {
        type: 'text',
        lineSegments: block.lines.map(parseInlineFormatting),
      };
    }));

    return { ok: true, blocks, hash };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Lichte controle (alleen tekst, geen afbeeldingen) of de patchnotes op
// GitHub gewijzigd zijn t.o.v. wat de gebruiker het laatst gezien heeft.
ipcMain.handle('check-new-patchnotes', async () => {
  const cfg = readSourceConfig();
  if (!isSourceConfigured(cfg)) return { ok: false };

  try {
    const content = await fetchText(rawUrl(cfg, cfg.infoFilePath));
    const hash = hashContent(content);
    const localCfg = readConfig();

    return { ok: true, hasNew: localCfg.patchnotesLastSeenHash !== hash, hash };
  } catch (err) {
    return { ok: false };
  }
});

ipcMain.handle('mark-patchnotes-read', (_event, hash) => {
  const cfg = readConfig();
  cfg.patchnotesLastSeenHash = hash;
  writeConfig(cfg);
  return cfg;
});

ipcMain.handle('get-app-version', () => {
  return getLocalVersion();
});

ipcMain.handle('launch-game', async (_event, exePath) => {
  if (!exePath || !fs.existsSync(exePath)) {
    return { ok: false, error: 'Het opgegeven bestand bestaat niet meer. Selecteer de exe opnieuw.' };
  }

  try {
    const child = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
