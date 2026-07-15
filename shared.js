// Shared acoustic-impact scoring — heuristic, wellness-framed, not clinical or calibrated SPL.

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function clampInt(n, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(n))); }

function scoreFromAcoustics({ domFreq, loudnessDb }) {
  const freqEnergy = clamp01((domFreq - 150) / 3500);
  const loudEnergy = clamp01((loudnessDb - 40) / 45);
  const energyScore = clampInt((freqEnergy * 0.55 + loudEnergy * 0.45) * 100, 0, 100);
  const calmScore = clampInt(100 - energyScore, 0, 100);
  return { energyScore, calmScore };
}

function interpretation(energyScore, loudnessDb) {
  let text;
  if (energyScore >= 65) {
    text = "loud/bright energy rn — short term that's usually more alert, more hyped. good for a boost, but it'll wear you down if it doesn't let up.";
  } else if (energyScore <= 35) {
    text = "low and steady, not loud — this pattern usually tracks with actually chilling, not just sitting there.";
  } else {
    text = "pretty balanced — not really pushing you either way, more background-noise energy.";
  }
  const safety = loudnessDb != null && loudnessDb >= 85
    ? "This has been sustained at a level where, per WHO/NIOSH guidance, prolonged daily exposure (8hrs+) is linked to real long-term hearing risk. Worth turning it down."
    : null;
  return { text, safety };
}

// Exposed for both classic script contexts (offscreen/background) — no ES module needed.
self.Wavelength = { scoreFromAcoustics, interpretation, clampInt, clamp01 };
