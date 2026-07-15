#  Wavelength — Sound & Mood Monitor

A Chrome extension that listens to whatever's playing in your browser tab, analyzes it in real time (frequency, loudness, energy), and journals how it tracks with your mood over time — with pattern insights pulled straight from your own listening data.

<!-- 🎥 DEMO: drop your screen recording / GIF here — this is the first thing anyone sees, make it count.
     Show: the dial moving live while music plays → a notification firing → the journal's heatmap/badges. -->
<!-- ![demo](./demo.gif) -->

## Why I built this

What you listen to — how loud, how often, at what hours — says more about your day than most mood trackers bother to ask. Wavelength doesn't ask you to log anything by hand; it listens (with permission), analyzes the actual audio, and figures the rest out from there.

## Features

-  **Live frequency & loudness analysis** — real Web Audio FFT on captured tab audio, not simulated
-  **Smart notifications** — only fires on *sustained* loud stretches or genuine energy shifts (rolling averages + cooldowns, not spam on every audio sample)
-  **Auto-journaling** — logs itself every few minutes while monitoring, no manual entry required
-  **Song identification** — optional, via the AudD API, so entries get a real track name instead of "Tab Session #4"
-  **Pattern insights** — a journal that actually computes things:
  - Frequency-band breakdown (real audio-engineering ranges: sub-bass → brilliance)
  - Day × time-of-day energy heatmap
  - Calm/energy balance over the last 7 days, with a flag if you're not getting enough quiet time
  - Auto-generated weekly narrative summary
  - Persona badges (Night Owl, Bass Head, Zen Mode, etc.) — all computed from logged data, not decorative

## Install (unpacked / dev mode)

1. Clone or download this repo.
2. Go to `chrome://extensions`, enable **Developer mode** (top right).
3. Click **Load unpacked**, select this folder.
4. Pin the extension from the puzzle-piece icon in your toolbar.

## Using it

1. Open a tab playing audio (Spotify Web Player, YouTube, etc.).
2. Click the icon → **Start listening**. Allow the tab-capture permission prompt.
3. Open **Journal** for the full history, trend chart, and pattern insights.
4. (Optional) Add a free [AudD](https://audd.io) API key under **Song ID & settings** for track recognition.

## Architecture

```
popup.js  ──▶  background.js (service worker)
                    │
                    ├─▶ chrome.tabCapture.getMediaStreamId()
                    ├─▶ chrome.offscreen.createDocument()
                    │        │
                    │        ▼
                    │   offscreen.js — Web Audio FFT/loudness analysis,
                    │                  MediaRecorder → AudD for song ID
                    │
                    ├─▶ chrome.notifications  (sustained-average triggers)
                    └─▶ chrome.storage.local  (journal entries)

journal.js reads chrome.storage.local and renders the trend chart,
heatmap, frequency profile, and badge engine — all client-side, no backend.
```

Manifest V3's `tabCapture` API requires audio processing to happen in an **offscreen document** rather than the service worker directly — that's the reason for the `offscreen.html`/`offscreen.js` split.

## Tech

Vanilla JS, Chrome Extension Manifest V3, Web Audio API, `chrome.tabCapture`, `chrome.offscreen`, `chrome.notifications`, `chrome.storage.local`. No frameworks, no build step — load it straight from the folder.

## Known limitations

- Loudness (dB) is **relative, not calibrated SPL** — a browser mic-equivalent capture can't give a true dB(A) reading. Treat it as "louder/quieter than before," not a hearing-safety instrument.
- Song ID sends a short audio clip to AudD's servers for fingerprinting — inherent to how audio recognition works, worth knowing before enabling it.
- Switching to a *different* tab requires stopping and restarting capture on that tab.

## License

MIT — see [LICENSE](./LICENSE).
