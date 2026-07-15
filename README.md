# Wavelength — Sound & Mood Monitor (Chrome extension)

## Install (unpacked, for testing/dev)
1. Unzip this folder somewhere permanent (don't delete it after installing — Chrome loads live from disk).
2. Go to `chrome://extensions`, turn on **Developer mode** (top right).
3. Click **Load unpacked**, select the `wavelength-extension` folder.
4. Pin the Wavelength icon (puzzle-piece icon in the toolbar → pin).

## Using it
1. Open a tab that's playing audio (Spotify Web Player, YouTube, etc.).
2. Click the Wavelength icon → **Start listening**.
3. Chrome will ask for tab-capture permission the first time — allow it.
4. The dial needle, Hz/dB readouts, and short-term read update live. Audio keeps playing normally — Wavelength just listens alongside it.
5. **Journal** opens a full page with your history, a trend chart, and pattern insights.
6. **Song ID & settings** is where you add an AudD API key if you want track recognition (see below).

## What's real vs. what needs setup
- **Live frequency/loudness analysis** — fully real, computed from actual captured tab audio via the Web Audio API. No mocking.
- **Notifications** (loud stretches, sound shifts, mood check-ins) — fully real, fires via `chrome.notifications`.
- **Auto-journaling** — fully real. Every ~3 minutes while listening, it logs an averaged entry to `chrome.storage.local`. No manual "add a song" step needed.
- **Song identification** — uses [AudD](https://audd.io), a third-party recognition API, *not* built or run by Anthropic. You need your own free API key (sign up at audd.io, it has a no-cost tier for light use) and to paste it into Settings. Without a key, everything else still works — you just won't get track names.
- **Loudness (dB) is relative, not calibrated SPL.** A laptop/browser mic-equivalent capture can't give you a real dB(A) meter reading — treat it as "louder/quieter than a moment ago," not a medical or occupational-safety instrument.

## Known limitations
- Tab-capture requires the tab to stay open and audible; switching away from the captured tab doesn't stop capture, but capturing a *different* tab requires stopping and restarting on that tab.
- Chrome's offscreen-document + tabCapture pattern (used here to keep this MV3-compliant) sometimes needs the extension reloaded after Chrome updates — if capture stops working, try toggling it off/on from `chrome://extensions`.
- Song ID sends a short (~6s) audio clip to AudD's servers for matching — that's inherent to how audio fingerprinting works, worth knowing before enabling it.
