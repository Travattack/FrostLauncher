FrostLauncher

A fan-made game launcher for private World of Warcraft: Wrath of the Lich King (3.3.5a) realms.

It gives a private realm the thing it usually lacks: a proper front door. One big PLAY button, patch notes the realm owner can edit from a browser, a live realm-status light, and a launcher that keeps itself up to date — without players ever having to download a zip or replace a file by hand.

This is a hobby project by a fan, for fans. It is not affiliated with, endorsed by, sponsored by, or connected to Blizzard Entertainment in any way. It ships no game files and no Blizzard content — no artwork, logos, fonts, music, or client data. 

What it does
One-time setup for the player. Click the gear, browse to your Wow.exe, done. The path is remembered.
Patch notes from this repository. The realm owner edits a plain text file on github.com; every player sees it on next refresh. Supports headings, bold, italics and images.
A "new patch notes" dot on the button, so players notice when something changed. It works on a content hash, not a file date, so it does not matter how the file was edited.
Realm status light next to the version number: green when the logon server accepts connections, red when it does not. Checked at startup and every 60 seconds; click it to check again.
Background and music you can swap any time. Drop a new background.jpg or music.mp3 in this repo and every launcher picks it up on the next start. No new build, no new installer.
Self-updating. On startup the launcher compares its own version with the version folders in this repo and installs a newer one by itself, then restarts.
Manual repair. If an update was interrupted or a file went missing, the player clicks Repair installation and every file is downloaded again — even if the version number already matches.

Everything above runs over plain, unauthenticated HTTPS against a public GitHub repository. Players need no account, no token, and no login, and there is no server to host or pay for.

What is in this repository

This repo is the launcher's content and delivery side. The launcher reads it directly; nothing here is compiled or published anywhere else.

servercon/
├─ patchnotes.txt        the patch notes players see, edited here on github.com
├─ images/               images referenced from patchnotes.txt
├─ theme/
│  ├─ background.<ext>   launcher background  (.jpg .jpeg .png .webp .gif .bmp .svg)
│  └─ music.<ext>        launcher music       (.mp3 .ogg .oga .m4a .wav .flac)
└─ update/
   ├─ 3.1.0/             one folder per released version, holding the full source
   └─ 3.2.0/

The launcher's own source code lives inside those update/<version>/ folders — each one is a complete, self-contained copy of the app. That is deliberate: it is exactly what the auto-updater downloads and copies over an installation, so "what's released" and "what's in the repo" can never drift apart.

Built with Electron. Only the Node standard library is used at runtime — no runtime dependencies to audit.
