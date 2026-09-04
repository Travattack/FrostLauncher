# WotLK Launcher (custom)

Een custom launcher voor World of Warcraft: Wrath of the Lich King (3.3.5a),
gebouwd met Electron. Je kiest zelf de `Wow.exe` via het tandwiel-paneel en
de launcher onthoudt dat pad voor de volgende keer.

## Bestanden

- `main.js` — Electron main process: venster, bestandsdialoog, spel starten,
  instellingen opslaan, GitHub-ophalen, auto-update.
- `preload.js` — veilige brug tussen UI en systeemfuncties.
- `index.html` / `styles.css` / `renderer.js` — de launcher-UI zelf.
- `source-config.json` — welke publieke GitHub-repo de bron is
  (Travattack/FrostLauncher) en welke logon-server voor de realm-status
  getest wordt. Staat al ingevuld; spelers hoeven niets in te stellen.
- `assets/` — ingebouwde illustratie, en de plek voor een meegeleverde
  `theme.jpg` / `music/theme.mp3` (zie "Achtergrond en muziek").
- `version.txt` — het huidige versienummer van de launcher (zie "Auto-update").

## Vereisten

- [Node.js](https://nodejs.org) (LTS versie, incl. npm) op je Windows-pc.

## Draaien tijdens ontwikkeling

```bash
npm install
npm start
```

## Omzetten naar een .exe (installer)

```bash
npm install
npm run dist
```

Dit gebruikt `electron-builder` en levert een installer op in de map `dist/`.
De installer opent een wizard (installatiemap kiezen, snelkoppelingen), en
maakt een Start-menu- en bureaublad-snelkoppeling aan.

Je kan een eigen icoon toevoegen op `assets/icon.ico` (256x256).

## Instellingen

Het gekozen exe-pad en de mute-instelling staan in:

```
%APPDATA%/wotlk-launcher/launcher-config.json
```

## Aanpassen van de stijl

Alle kleuren en het lettertype zitten in `styles.css` bovenaan bij de
`:root { ... }` variabelen.

## Taal van de launcher

Alle teksten die de speler ziet zijn Engels (sinds 3.0.1). De
code-comments, dit README en de LEES_MIJ-bestanden blijven Nederlands —
die zijn voor jou, niet voor de spelers. Wil je een tekst aanpassen: de
knoppen en tooltips staan in `index.html`, de meldingen in `renderer.js`,
en de foutmeldingen die van GitHub of Windows komen in `main.js`.

## Realm-status onderin

Naast het versienummer in de onderste balk staat een bolletje met
"Realm online" of "Realm offline":

- **groen** — de logon-server neemt verbindingen aan
- **rood** — geen verbinding mogelijk
- **goud, pulserend** — aan het controleren (ook bij het opstarten)

De launcher controleert dit bij de start en daarna elke 60 seconden. Klik
op het bolletje om meteen opnieuw te controleren. Met de muis erboven zie
je welke server getest is, de reactietijd in milliseconden en het tijdstip
van de laatste controle.

### Hoe de test werkt (en waarom geen ping)

De launcher zet een **TCP-verbinding** op naar `logon.warmane.com:3724` en
verbreekt die meteen weer. Er wordt niets verstuurd en er wordt niet
ingelogd. Dat is bewust geen ICMP-ping:

- een ping zegt alleen dat de *machine* antwoordt, niet dat de
  logon-dienst luistert — een server kan pingbaar zijn terwijl niemand kan
  inloggen, en veel servers blokkeren ICMP volledig terwijl ze prima
  werken;
- een ping vereist op Windows een apart proces of verhoogde rechten;
- poort 3724 is exact wat het spel zelf aanspreekt, dus dit meet wat de
  speler wil weten: "kan ik inloggen?"

### Een andere server testen

Pas `statusHost` en `statusPort` aan in `source-config.json` — bijvoorbeeld
naar je eigen logon-server. Met `statusIntervalSeconds` regel je hoe vaak
er gecontroleerd wordt (minimaal 15 seconden). Deze velden reizen mee met
een auto-update, dus je kan ze later nog wijzigen zonder dat spelers iets
moeten doen.

## Installatie repareren

In het tandwiel-paneel staat onderaan **"Repair installation"**. Die knop
haalt de **hoogste versie** uit `servercon/update/` opnieuw op, ongeacht
welke versie er lokaal staat — ook als dat exact dezelfde versie is.

Bedoeld voor een installatie die stuk of half bijgewerkt is: een update die
halverwege afgebroken werd, een bestand dat een virusscanner weggehaald
heeft, of een launcher die niet meer opstart zoals het hoort.

Wat er gebeurt:

1. De speler krijgt eerst een Windows-bevestigingsvenster te zien — de
   launcher sluit hierbij namelijk af en herstart.
2. De thema-cache wordt leeggemaakt, zodat achtergrond en muziek ook
   opnieuw gedownload worden.
3. Alle bestanden van die versie worden gedownload en over de installatie
   gekopieerd, via exact hetzelfde mechanisme als een gewone update
   (inclusief de UAC-stap als de launcher in `C:\Program Files` staat).
4. De launcher herstart.

**Wat blijft staan:** het pad naar `Wow.exe` en de mute-stand. Die zitten
in `%APPDATA%/wotlk-launcher/launcher-config.json` en worden niet
aangeraakt — de speler hoeft dus niets opnieuw in te stellen.

Staat er geen enkele geldige versiemap op GitHub, dan zegt de launcher dat
in plaats van stil te blijven.

## Achtergrond en muziek

Er zijn twee manieren om die te zetten. Kies de eerste als je ze achteraf
nog wil kunnen wisselen, en de tweede voor wat er standaard in de installer
moet zitten.

### 1. Via GitHub (aanbevolen, achteraf te wijzigen)

Zet in je repo een map `servercon/theme/` met:

```
servercon/theme/
  background.jpg    <- de achtergrond (.jpg .jpeg .png .webp .gif .bmp .svg)
  music.mp3         <- de muziek (.mp3 .ogg .oga .m4a .wav .flac)
```

De naam vóór de punt moet exact `background` of `music` zijn; de extensie
mag varieren. Bij elke start vergelijkt de launcher deze bestanden met wat
de speler al gedownload heeft en haalt alleen op wat gewijzigd is. Je kan
dus de sfeer van de launcher aanpassen zonder een nieuwe versie uit te
brengen: bestand vervangen op github.com, spelers herstarten, klaar.

De bestanden worden per speler gecached in
`%APPDATA%/wotlk-launcher/theme-cache/`, dus bij een onbereikbare GitHub
blijft de laatst gedownloade versie gewoon werken. Haal je een bestand weg
uit `servercon/theme/`, dan valt de launcher bij de volgende start terug op
optie 2 hieronder.

Zie `servercon/theme/LEES_MIJ.txt` voor de details en de aanbevolen
afmetingen.

### 2. Meegeleverd in de installer

Zet een `theme.jpg` in de map `assets` en/of een `theme.mp3` in
`assets/music/`. Die worden gebruikt zolang er niets in `servercon/theme/`
staat. Ontbreken ze allebei, dan blijft de ingebouwde
ijslandschap-illustratie zichtbaar en is er simpelweg geen muziek.

Tip voor de achtergrond: liggende afbeelding, minstens 1200x700px.
Voor de muziek: zie `assets/music/LEES_MIJ.txt` voor rechtenvrije bronnen.
Muziek speelt in een loop, stopt zodra je op **PLAY** drukt, en dempen kan
via het luidspreker-icoontje naast het tandwiel.

---

## Patchnotes-paneel (los te openen, onder PLAY)

Klik op de knop **"Patch notes"** onder PLAY om het paneel te openen. De
inhoud komt van een tekstbestand in een **publieke GitHub-repository** —
geen login, geen wachtwoord, volledig gratis. Het ververs-icoontje
bovenin het paneel haalt de nieuwste inhoud opnieuw op.

### 1. Maak een gratis publieke GitHub-repository aan

1. Ga naar [github.com](https://github.com) en maak (indien nodig) een
   gratis account aan.
2. Klik rechtsboven op **+ → New repository**.
3. Geef de naam `FrostLauncher`, zet 'm op **Public**, en maak hem aan.
4. Upload de inhoud van de map `servercon/` uit deze download naar die
   repository — dat kan gewoon via de GitHub-website: open de repo,
   klik **Add file → Upload files**, en sleep de hele `servercon`-map
   (met `patchnotes.txt`, `images/`, `theme/`, `update/`) erin.

Zo krijg je op GitHub de volgende structuur, publiek en gratis gehost:

```
servercon/
  patchnotes.txt
  images/
    voorbeeld.svg
  theme/
    background.svg   <- achtergrond, achteraf te wisselen
    music.mp3        <- muziek (zet je zelf toe)
  update/
    3.1.0/           <- vorige versie (mag later weg)
    3.2.0/           <- alle launcher-bestanden van die versie
```

### 2. Vul je repo-gegevens in — eenmalig, in `source-config.json`

De bron-instellingen zitten **in de app zelf**, in het bestand
`source-config.json` naast `main.js`:

```json
{
  "owner": "Travattack",
  "repo": "FrostLauncher",
  "branch": "main",
  "infoFilePath": "servercon/patchnotes.txt",
  "updateFolderPath": "servercon/update",
  "themeFolderPath": "servercon/theme",

  "statusHost": "logon.warmane.com",
  "statusPort": 3724,
  "statusIntervalSeconds": 60
}
```

`owner` en `repo` staan al ingevuld op **Travattack / FrostLauncher**.
Verhuis je ooit naar een andere repo, pas ze dan hier aan **voordat je met
`npm run dist` een installer bouwt**. De `...Path`-velden passen al bij de mapstructuur van
`servercon/`, en de `status...`-velden bij de realm-indicator (zie
"Realm-status onderin").

Omdat dit bestand meegeleverd wordt met de installer, hoeven spelers
**niets** in te stellen: ze installeren de launcher en die weet al waar
de patchnotes en updates staan. Er is geen wachtwoord of token nodig —
een publieke repo is voor iedereen leesbaar via directe links, zonder
in te loggen.

Het bestand wordt ook meegekopieerd bij een auto-update, dus je kan de
repo later desnoods verhuizen zonder dat spelers iets moeten doen: zet
de nieuwe `owner`/`repo` in de volgende versiemap en de update regelt
het.

Staat `owner` of `repo` leeg, dan meldt de launcher dat expliciet
("The source repository is not configured...") in plaats van met vage
netwerkfouten te komen.

De raw-links van deze repo zien er dus zo uit:

```
https://raw.githubusercontent.com/Travattack/FrostLauncher/main/servercon/patchnotes.txt
https://api.github.com/repos/Travattack/FrostLauncher/git/trees/main?recursive=1
```

### 3. Patchnotes bijwerken

Werk `patchnotes.txt` bij via de GitHub-website: open het bestand in je
repo, klik op het potlood-icoontje, pas de tekst aan, en klik
**Commit changes**. Klik daarna op het ververs-icoontje in de launcher
om de nieuwste versie te zien.

### 4. Afbeeldingen in de patchnotes

Zet op een eigen regel in `patchnotes.txt`:

```
![Korte omschrijving](images/jouw-afbeelding.jpg)
```

en upload de afbeelding zelf naar de map `images` in je repo (dus
`servercon/images/jouw-afbeelding.jpg`, via **Add file → Upload files**,
slepen-en-neerzetten werkt prima). De launcher herkent deze regel
automatisch en toont de afbeelding op die plek in het patchnotes-paneel
— de rest van het bestand blijft gewoon platte tekst. Ondersteunde
formaten: `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`, `.svg`.

In deze download zit al een werkend voorbeeld: `servercon/patchnotes.txt`
verwijst naar `servercon/images/voorbeeld.svg` (een zelfgemaakte
illustratie, geen spel-artwork). Upload beide mee naar je repo om het
meteen te zien werken.

Ontbreekt een afbeelding (verkeerd pad, bestand verwijderd), dan toont de
launcher gewoon een korte melding op die plek in plaats van de hele
patchnotes te laten mislukken.

### 5. Tekstopmaak in de patchnotes

Naast platte tekst herkent de launcher een paar simpele opmaaktekens:

| Wat je typt | Wat je krijgt |
|---|---|
| `**vet**` | **vet** |
| `*cursief*` of `_cursief_` | _cursief_ |
| `# Grote titel` | groot kopje (bv. "Patchnotes") |
| `## Middelgrote titel` | middelgroot kopje (bv. per versie) |
| `### Klein kopje` | klein kopje in hoofdletters |

Zet het `#`-teken (met een spatie erna) altijd vooraan op een eigen regel.
De rest van het bestand — inclusief gewone `- opsommingen` — blijft
gewoon platte tekst zoals voorheen. Het meegeleverde voorbeeld in
`servercon/patchnotes.txt` demonstreert alle opties.

### 6. "Nieuw"-indicatie op de "Patch notes"-knop

Zodra de inhoud van `patchnotes.txt` op GitHub verandert, verschijnt er
een klein oranje bolletje op de "Patch notes"-knop. Dat blijft staan tot je
op de knop klikt en de patchnotes daadwerkelijk opent — daarna verdwijnt
het bolletje, tot de volgende keer dat het bestand weer wijzigt.

Dit werkt op basis van een hash van de tekstinhoud (lokaal onthouden per
gebruiker), niet op basis van een bestandsdatum — dus het maakt niet uit
hoe je het bestand bewerkt of opslaat.

---

## Auto-update van de launcher zelf

De launcher controleert bij elke start de map `servercon/update/` in je
GitHub-repository (via GitHub's publieke, niet-ingelogde API). Daarin
zet jij per uitgebrachte versie een aparte map, met de versienummer als
mapnaam, bijvoorbeeld:

```
servercon/
  patchnotes.txt
  update/
    3.1.0/   <- alle launcher-bestanden van versie 3.1.0
    3.2.0/   <- alle launcher-bestanden van versie 3.2.0
```

Is het hoogste versienummer dat daar staat hoger dan de versie die
lokaal geïnstalleerd is (zie `version.txt`, en zichtbaar onderin de
launcher als "v3.2.0"), dan gebeurt het volgende:

1. De launcher toont een "Bijwerken naar versie X..."-overlay met
   laadanimatie, en downloadt de nieuwe bestanden één voor één van
   GitHub naar een tijdelijke map (dit raakt nog niets van de actief
   draaiende launcher).
2. De launcher sluit zichzelf volledig af. Dit is nodig omdat Windows de
   bestanden die een lopend programma gebruikt (zoals de eigen
   `index.html`, `styles.css`, afbeeldingen, ...) vergrendelt — die kun je
   dus nooit overschrijven terwijl het programma nog open staat.
3. Een klein, apart script (los van de launcher zelf) wacht tot de
   launcher volledig gestopt is, kopieert dan de gedownloade bestanden
   over de geïnstalleerde versie heen, en start de launcher opnieuw op.
4. Is de launcher geïnstalleerd op een plek die beheerdersrechten vereist
   (bv. `C:\Program Files\...`), dan verschijnt hierbij een Windows
   UAC-venster dat bevestigd moet worden.

Dit betekent dat je bij een update de launcher heel even ziet
verdwijnen en meteen weer opnieuw zien opstarten — dat is normaal
gedrag, geen fout.

Gaat er iets mis (GitHub niet bereikbaar, UAC geweigerd, ...), dan blijft
de launcher gewoon open met de huidige versie — er komt een korte
foutmelding onderin te staan.

### Zo breng je een nieuwe versie uit

1. Kopieer je volledige, bijgewerkte `wotlk-launcher`-map naar één map
   (dit is dus "1 map" met alle bestanden erin — `main.js`, `preload.js`,
   `index.html`, `styles.css`, `renderer.js`, `package.json`, `version.txt`,
   `assets/`, ...).
2. Open in die kopie het bestand `version.txt` en verhoog het versienummer,
   bijvoorbeeld van `3.2.0` naar `3.2.1`.
3. Hernoem de map zelf ook naar dat versienummer: `3.2.1`. Houd ook
   `package.json` op hetzelfde nummer (alleen voor nette installer-
   metadata; `version.txt` blijft de bron van waarheid).
4. Upload die volledige map naar `servercon/update/` in je GitHub-repo
   (via **Add file → Upload files** — sleep de hele map erin, GitHub
   behoudt de mapstructuur).

Klaar — bij de volgende start (van iedereen die de launcher gebruikt)
wordt de update automatisch opgepikt.

**Let op — GitHub's gratis limiet:** voor niet-ingelogde toegang tot
GitHub's API (nodig om de updatemappen te bekijken) geldt een limiet van
60 aanvragen per uur, per IP-adres. Voor normaal gebruik (één check per
opstart van de launcher) is dat ruim voldoende; bij heel veel gelijktijdige
gebruikers op hetzelfde netwerk zou dit in theorie kunnen knellen.

**Belangrijk:** dit werkt alleen betrouwbaar als de launcher **niet** als
asar-archief gebundeld is (`"asar": false` staat al in `package.json`),
omdat de update-bestanden anders niet los overschreven kunnen worden.

---

## Let op: auteursrecht

Deze launcher gebruikt geen originele Blizzard-assets (logo's,
lettertypes, achtergrondafbeeldingen) — alles is met CSS opnieuw
opgebouwd in een vergelijkbare sfeer. Wil je zelf artwork toevoegen
(achtergrond, muziek), zorg dan dat je daar de rechten voor hebt en
gebruik het alleen voor persoonlijk gebruik.
