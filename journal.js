const MOOD_LABELS = {
  good: '🙂 Good', notgreat: '😬 Not great', happy: '😄 Happy', calm: '😌 Calm',
  focused: '🎯 Focused', tired: '😴 Tired', anxious: '😬 Anxious', irritated: '😤 Irritated',
};
const NEGATIVE_MOODS = new Set(['notgreat', 'tired', 'anxious', 'irritated']);
const POSITIVE_MOODS = new Set(['good', 'happy', 'calm', 'focused']);

chrome.storage.local.get(['sessions'], (r) => {
  const sessions = (r.sessions || []).slice().sort((a, b) => b.timestamp - a.timestamp);
  renderBadges(sessions);
  renderStats(sessions);
  renderDigest(sessions);
  renderChart(sessions);
  renderBands(sessions);
  renderHeatmap(sessions);
  renderBalance(sessions);
  renderInsights(sessions);
  renderLog(sessions);
});

function renderStats(sessions) {
  const withLoud = sessions.filter((s) => s.loudnessDb != null);
  const avgLoud = withLoud.length ? Math.round(withLoud.reduce((a, b) => a + b.loudnessDb, 0) / withLoud.length) : null;
  const loudCount = withLoud.filter((s) => s.loudnessDb >= 85).length;
  const withMood = sessions.filter((s) => s.mood);
  const moodCounts = {};
  withMood.forEach((s) => (moodCounts[s.mood] = (moodCounts[s.mood] || 0) + 1));
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];

  const cards = [
    { label: 'Entries logged', value: sessions.length },
    { label: 'Avg. loudness', value: avgLoud != null ? `${avgLoud} dB` : '—' },
    { label: 'Most common mood', value: topMood ? MOOD_LABELS[topMood[0]] || topMood[0] : '—' },
    { label: 'Loud sessions (≥85dB)', value: loudCount, warn: loudCount > 5 },
  ];
  document.getElementById('stats').innerHTML = cards
    .map((c) => `<div class="stat-card ${c.warn ? 'warn' : ''}"><div class="stat-value">${c.value}</div><div class="stat-label">${c.label}</div></div>`)
    .join('');
}

function renderChart(sessions) {
  const data = sessions
    .filter((s) => s.energyScore != null)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, padL = 34, padB = 24, padT = 12, padR = 12;
  ctx.clearRect(0, 0, W, H);

  if (data.length < 2) {
    ctx.fillStyle = '#837791';
    ctx.font = '13px Work Sans';
    ctx.fillText('Not enough logged data yet for a trend line.', padL, H / 2);
    return;
  }

  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xStep = plotW / (data.length - 1);

  // gridlines
  ctx.strokeStyle = '#EFE6D3';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = padT + (plotH * g) / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    ctx.fillStyle = '#837791'; ctx.font = '10px JetBrains Mono';
    ctx.fillText(`${100 - g * 25}`, 4, y + 3);
  }

  const drawLine = (key, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath();
    data.forEach((s, i) => {
      const x = padL + i * xStep;
      const y = padT + plotH * (1 - (s[key] ?? 0) / 100);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  };
  drawLine('calmScore', '#3FAE9E');
  drawLine('energyScore', '#FF7A59');

  // legend
  ctx.font = '11px Space Grotesk';
  ctx.fillStyle = '#FF7A59'; ctx.fillRect(padL, H - 12, 10, 3); ctx.fillText('Energy', padL + 16, H - 6);
  ctx.fillStyle = '#3FAE9E'; ctx.fillRect(padL + 80, H - 12, 10, 3); ctx.fillText('Calm', padL + 96, H - 6);
}

function renderInsights(sessions) {
  const el = document.getElementById('insights');
  const insights = computeInsights(sessions);
  if (insights.length === 0) {
    el.innerHTML = `<p class="empty">Keep logging — patterns will show up here once there's more to go on.</p>`;
    return;
  }
  el.innerHTML = insights.map((i) => `<p>${i}</p>`).join('');
}

function computeInsights(sessions) {
  const out = [];
  const withMood = sessions.filter((s) => s.mood && s.loudnessDb != null);
  if (withMood.length >= 4) {
    const neg = withMood.filter((s) => NEGATIVE_MOODS.has(s.mood));
    const pos = withMood.filter((s) => POSITIVE_MOODS.has(s.mood));
    if (neg.length >= 2 && pos.length >= 2) {
      const avgNeg = neg.reduce((a, b) => a + b.loudnessDb, 0) / neg.length;
      const avgPos = pos.reduce((a, b) => a + b.loudnessDb, 0) / pos.length;
      if (avgNeg - avgPos >= 8) {
        out.push(`Your lower-mood check-ins average <b>${Math.round(avgNeg)} dB</b>, vs <b>${Math.round(avgPos)} dB</b> for your better ones — louder stretches may be tracking with how you're feeling.`);
      } else if (avgPos - avgNeg >= 8) {
        out.push(`Your better-mood check-ins skew louder on average (<b>${Math.round(avgPos)} dB</b> vs <b>${Math.round(avgNeg)} dB</b>) — quiet doesn't necessarily mean better for you.`);
      }
    }
  }

  const withHour = sessions.filter((s) => s.energyScore != null);
  if (withHour.length >= 8) {
    const byHourBucket = {};
    withHour.forEach((s) => {
      const h = new Date(s.timestamp).getHours();
      const bucket = h < 6 ? 'late night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
      byHourBucket[bucket] = byHourBucket[bucket] || [];
      byHourBucket[bucket].push(s.energyScore);
    });
    const bucketAvgs = Object.entries(byHourBucket)
      .filter(([, arr]) => arr.length >= 2)
      .map(([b, arr]) => [b, arr.reduce((a, c) => a + c, 0) / arr.length]);
    if (bucketAvgs.length >= 2) {
      bucketAvgs.sort((a, b) => b[1] - a[1]);
      out.push(`Your <b>${bucketAvgs[0][0]}</b> sessions run louder/brighter on average (energy ${Math.round(bucketAvgs[0][1])}) than your <b>${bucketAvgs[bucketAvgs.length - 1][0]}</b> ones (energy ${Math.round(bucketAvgs[bucketAvgs.length - 1][1])}).`);
    }
  }

  const tracks = sessions.filter((s) => s.trackTitle);
  if (tracks.length >= 3) {
    const counts = {};
    tracks.forEach((s) => (counts[s.trackTitle] = (counts[s.trackTitle] || 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (top[1] >= 2) out.push(`"<b>${top[0]}</b>" has come up <b>${top[1]}×</b> in what's been identified so far.`);
  }

  const loudRecent = sessions.filter((s) => s.loudnessDb >= 85 && Date.now() - s.timestamp < 7 * 24 * 3600 * 1000).length;
  if (loudRecent >= 5) {
    out.push(`<b>${loudRecent}</b> sessions this week crossed 85dB — that's the WHO/NIOSH threshold where sustained daily exposure is linked to long-term hearing risk.`);
  }

  return out;
}

/* ---------------------------------------------------------------
   Vibe card — persona badges, all derived from actual logged data.
------------------------------------------------------------------*/
function renderBadges(sessions) {
  const el = document.getElementById('badges');
  const badges = computeBadges(sessions);
  if (badges.length === 0) {
    el.innerHTML = `<span class="badge-empty">log a few more sessions and your badges unlock here 🔒</span>`;
    return;
  }
  el.innerHTML = badges.map((b) => `<div class="badge ${b.color}"><span class="emoji">${b.emoji}</span>${b.label}</div>`).join('');
}

function computeBadges(sessions) {
  const badges = [];
  const withFreq = sessions.filter((s) => s.domFreq != null && s.domFreq > 0);
  const withEnergy = sessions.filter((s) => s.energyScore != null);

  // Frequency persona
  if (withFreq.length >= 5) {
    const counts = {};
    withFreq.forEach((s) => { const b = classifyBand(s.domFreq); counts[b.key] = (counts[b.key] || 0) + 1; });
    const top = BANDS.map((b) => ({ ...b, n: counts[b.key] || 0 })).sort((a, b) => b.n - a.n)[0];
    const map = {
      sub: { emoji: '🔊', label: 'Sub-bass Feeler', color: 'violet' },
      bass: { emoji: '🎧', label: 'Bass Head', color: 'violet' },
      lowmid: { emoji: '🎸', label: 'Warm Tones Only', color: 'violet' },
      mid: { emoji: '🎤', label: 'Midrange Main Character', color: 'violet' },
      uppermid: { emoji: '⚡', label: 'Crisp & Alert', color: 'violet' },
      presence: { emoji: '✨', label: 'Treble Chaser', color: 'violet' },
      brilliance: { emoji: '🌟', label: 'Sparkle Seeker', color: 'violet' },
    };
    if (top.n > 0 && map[top.key]) badges.push(map[top.key]);
  }

  // Chronotype persona
  const chrono = findChronotype(sessions);
  if (chrono) {
    const h = chrono.hottest.block;
    if (h.includes('12–4a') || h.includes('8p–12a')) badges.push({ emoji: '🌙', label: 'Night Owl', color: 'cyan' });
    else if (h.includes('4–8a') || h.includes('8a–12p')) badges.push({ emoji: '🌅', label: 'Early Bird', color: 'cyan' });
    else badges.push({ emoji: '🌇', label: 'Golden Hour Listener', color: 'cyan' });
  }

  // Balance persona (last 7 days)
  const recent = withEnergy.filter((s) => Date.now() - s.timestamp < 7 * 24 * 3600 * 1000);
  if (recent.length >= 4) {
    const energyPct = recent.filter((s) => s.energyScore >= 60).length / recent.length;
    const calmPct = recent.filter((s) => s.energyScore <= 40).length / recent.length;
    if (energyPct >= 0.6) badges.push({ emoji: '🔥', label: 'Chaos Energy', color: 'pink' });
    else if (calmPct >= 0.6) badges.push({ emoji: '🧘', label: 'Zen Mode', color: 'pink' });
    else badges.push({ emoji: '⚖️', label: 'Balanced Bestie', color: 'pink' });
  }

  // Streak
  const streaks = computeStreaks(sessions);
  if (streaks.loggingStreak >= 3) badges.push({ emoji: '🔥', label: `${streaks.loggingStreak}-day streak`, color: 'pink' });

  // Health nudge disguised as a badge — still an honest flag, not just for fun
  const loudRecent = sessions.filter((s) => s.loudnessDb >= 85 && Date.now() - s.timestamp < 7 * 24 * 3600 * 1000).length;
  if (loudRecent >= 5) badges.push({ emoji: '🚨', label: 'Turn It Down Bestie', color: 'pink' });

  // Track ID engagement
  const tracks = sessions.filter((s) => s.trackTitle);
  if (tracks.length >= 10) badges.push({ emoji: '🎶', label: 'Certified Music Head', color: 'cyan' });

  return badges;
}

/* ---------------------------------------------------------------
   Frequency bands — standard audio-engineering ranges, not invented.
------------------------------------------------------------------*/
const BANDS = [
  { key: 'sub', name: 'Sub-bass', lo: 20, hi: 60, desc: 'felt more than heard — rumble, deep bass drops' },
  { key: 'bass', name: 'Bass', lo: 60, hi: 250, desc: 'warmth and weight — kick drums, bass lines' },
  { key: 'lowmid', name: 'Low-mid', lo: 250, hi: 500, desc: 'body of most instruments and voices' },
  { key: 'mid', name: 'Midrange', lo: 500, hi: 2000, desc: 'where speech intelligibility and melody sit' },
  { key: 'uppermid', name: 'Upper-mid', lo: 2000, hi: 4000, desc: 'presence, clarity — can read as sharp or alert' },
  { key: 'presence', name: 'Presence', lo: 4000, hi: 6000, desc: 'edge, sibilance — high alertness territory' },
  { key: 'brilliance', name: 'Brilliance', lo: 6000, hi: 20000, desc: 'air, shimmer — cymbals, sparkle' },
];
function classifyBand(hz) {
  return BANDS.find((b) => hz >= b.lo && hz < b.hi) || BANDS[BANDS.length - 1];
}

function renderBands(sessions) {
  const el = document.getElementById('bands');
  const withFreq = sessions.filter((s) => s.domFreq != null && s.domFreq > 0);
  if (withFreq.length < 5) {
    el.innerHTML = `<p style="color:#837791;font-size:12.5px;">Needs a bit more listening data (live monitoring, not just track IDs) to map your frequency profile.</p>`;
    return;
  }
  const counts = {};
  withFreq.forEach((s) => {
    const b = classifyBand(s.domFreq);
    counts[b.key] = (counts[b.key] || 0) + 1;
  });
  const total = withFreq.length;
  const rows = BANDS.map((b) => ({ ...b, pct: Math.round(((counts[b.key] || 0) / total) * 100) }))
    .sort((a, b) => b.pct - a.pct);
  const dominant = rows[0];

  el.innerHTML =
    rows.map((b) => `
      <div class="band-row">
        <span class="band-name">${b.name}</span>
        <div class="band-track"><div class="band-fill" style="width:${b.pct}%; background:${bandColor(b.pct)}"></div></div>
        <span class="band-pct">${b.pct}%</span>
      </div>`).join('') +
    `<p class="band-dominant"><b>${dominant.name}</b> dominates your listening (${dominant.pct}% of sessions) — ${dominant.desc}.</p>`;
}
function bandColor(pct) {
  return mixHex('#FFD874', '#FF7A59', Math.min(1, pct / 60));
}

/* ---------------------------------------------------------------
   Heatmap — avg energy by day-of-week × time block
------------------------------------------------------------------*/
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const BLOCKS = [
  { label: '12–4a', from: 0, to: 4 }, { label: '4–8a', from: 4, to: 8 },
  { label: '8a–12p', from: 8, to: 12 }, { label: '12–4p', from: 12, to: 16 },
  { label: '4–8p', from: 16, to: 20 }, { label: '8p–12a', from: 20, to: 24 },
];

function buildHeatmapGrid(sessions) {
  const withEnergy = sessions.filter((s) => s.energyScore != null);
  const grid = BLOCKS.map(() => Array(7).fill(null).map(() => ({ sum: 0, count: 0 })));
  withEnergy.forEach((s) => {
    const d = new Date(s.timestamp);
    const day = d.getDay();
    const hour = d.getHours();
    const blockIdx = BLOCKS.findIndex((b) => hour >= b.from && hour < b.to);
    if (blockIdx === -1) return;
    grid[blockIdx][day].sum += s.energyScore;
    grid[blockIdx][day].count += 1;
  });
  return grid;
}

function renderHeatmap(sessions) {
  const el = document.getElementById('heatmap');
  const withEnergy = sessions.filter((s) => s.energyScore != null);
  if (withEnergy.length < 8) {
    el.innerHTML = `<p style="color:#837791;font-size:12.5px;">A few more logged sessions across different times of day will fill this in.</p>`;
    return;
  }
  const grid = buildHeatmapGrid(sessions);

  let html = `<div class="heatmap-grid"><div></div>`;
  DAY_NAMES.forEach((d) => (html += `<div class="hm-daylabel">${d}</div>`));
  BLOCKS.forEach((block, bi) => {
    html += `<div class="hm-label">${block.label}</div>`;
    for (let day = 0; day < 7; day++) {
      const cell = grid[bi][day];
      if (cell.count === 0) {
        html += `<div class="hm-cell" style="background:#F3ECDD"></div>`;
      } else {
        const avg = cell.sum / cell.count;
        const color = mixHex('#3FAE9E', '#FF7A59', avg / 100);
        const opacity = Math.min(1, 0.4 + cell.count / 8);
        html += `<div class="hm-cell" title="${DAY_NAMES[day]} ${block.label}: energy ${Math.round(avg)} (${cell.count} logged)" style="background:${color}; opacity:${opacity.toFixed(2)}"></div>`;
      }
    }
  });
  html += `</div>`;
  el.innerHTML = html;
}

function findChronotype(sessions) {
  const withEnergy = sessions.filter((s) => s.energyScore != null);
  if (withEnergy.length < 8) return null;
  const grid = buildHeatmapGrid(sessions);
  let hottest = null, coolest = null;
  grid.forEach((row, bi) => {
    row.forEach((cell, day) => {
      if (cell.count < 2) return;
      const avg = cell.sum / cell.count;
      if (!hottest || avg > hottest.avg) hottest = { avg, block: BLOCKS[bi].label, day: DAY_NAMES[day] };
      if (!coolest || avg < coolest.avg) coolest = { avg, block: BLOCKS[bi].label, day: DAY_NAMES[day] };
    });
  });
  return { hottest, coolest };
}

/* ---------------------------------------------------------------
   Balance — calm vs energized time split, last 7 days
------------------------------------------------------------------*/
function renderBalance(sessions) {
  const el = document.getElementById('balance');
  const recent = sessions.filter((s) => s.energyScore != null && Date.now() - s.timestamp < 7 * 24 * 3600 * 1000);
  if (recent.length < 4) {
    el.innerHTML = `<p style="color:#837791;font-size:12.5px;">Not enough sessions logged in the last 7 days yet.</p>`;
    return;
  }
  const calmN = recent.filter((s) => s.energyScore <= 40).length;
  const energyN = recent.filter((s) => s.energyScore >= 60).length;
  const calmPct = Math.round((calmN / recent.length) * 100);
  const energyPct = Math.round((energyN / recent.length) * 100);
  const midPct = 100 - calmPct - energyPct;

  let flag = '';
  if (calmPct <= 15) {
    flag = `<div class="balance-flag">Only ${calmPct}% of this week's logged sound has been in a calm range — mostly mid-to-high energy. Worth building in some quiet stretches.</div>`;
  } else if (energyPct >= 70) {
    flag = `<div class="balance-flag">${energyPct}% of this week has run energized/loud — that's a lot of stimulation with little downtime.</div>`;
  }

  const streaks = computeStreaks(sessions);

  el.innerHTML = `
    <div class="balance-bar">
      <div class="balance-seg-calm" style="width:${calmPct}%"></div>
      <div style="width:${midPct}%; background:#E4D8C0"></div>
      <div class="balance-seg-energy" style="width:${energyPct}%"></div>
    </div>
    <div class="balance-caption"><b style="color:var(--calmc)">${calmPct}% calm</b> · ${midPct}% mixed · <b style="color:var(--energyc)">${energyPct}% energized</b> (last 7 days, ${recent.length} sessions)</div>
    ${flag}
    <div class="streak-row">
      <div class="streak-chip">Logging streak: <b>${streaks.loggingStreak}d</b></div>
      <div class="streak-chip">Calm-leaning days: <b>${streaks.calmDaysThisWeek}/7</b></div>
    </div>
  `;
}

function computeStreaks(sessions) {
  const dayKey = (t) => new Date(t).toDateString();
  const loggedDays = new Set(sessions.map((s) => dayKey(s.timestamp)));
  let loggingStreak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    if (loggedDays.has(d.toDateString())) loggingStreak++;
    else break;
  }
  const byDay = {};
  sessions.forEach((s) => {
    if (s.energyScore == null) return;
    if (Date.now() - s.timestamp > 7 * 24 * 3600 * 1000) return;
    const k = dayKey(s.timestamp);
    byDay[k] = byDay[k] || [];
    byDay[k].push(s.energyScore);
  });
  const calmDaysThisWeek = Object.values(byDay).filter((arr) => arr.reduce((a, b) => a + b, 0) / arr.length <= 45).length;
  return { loggingStreak, calmDaysThisWeek };
}

/* ---------------------------------------------------------------
   Digest — one narrative stitching the signals together
------------------------------------------------------------------*/
function renderDigest(sessions) {
  const el = document.getElementById('digest');
  const withEnergy = sessions.filter((s) => s.energyScore != null);
  if (withEnergy.length < 6) {
    el.innerHTML = `<p class="empty">Log a bit more and this'll turn into an actual read on your patterns instead of a guess.</p>`;
    return;
  }
  const parts = [];
  const chrono = findChronotype(sessions);
  if (chrono) {
    parts.push(`Your loudest/brightest listening tends to land <b>${chrono.hottest.day} ${chrono.hottest.block}</b> (avg energy ${Math.round(chrono.hottest.avg)}), while <b>${chrono.coolest.day} ${chrono.coolest.block}</b> is where things go quietest (avg energy ${Math.round(chrono.coolest.avg)}).`);
  }
  const withFreq = sessions.filter((s) => s.domFreq != null && s.domFreq > 0);
  if (withFreq.length >= 5) {
    const counts = {};
    withFreq.forEach((s) => { const b = classifyBand(s.domFreq); counts[b.key] = (counts[b.key] || 0) + 1; });
    const top = BANDS.map((b) => ({ ...b, n: counts[b.key] || 0 })).sort((a, b) => b.n - a.n)[0];
    parts.push(`Most of what you listen to sits in the <b>${top.name.toLowerCase()}</b> range — ${top.desc}.`);
  }
  const recent7 = sessions.filter((s) => s.energyScore != null && Date.now() - s.timestamp < 7 * 24 * 3600 * 1000);
  if (recent7.length >= 4) {
    const energyPct = Math.round((recent7.filter((s) => s.energyScore >= 60).length / recent7.length) * 100);
    if (energyPct >= 55) parts.push(`This past week leaned energized — <b>${energyPct}%</b> of sessions ran hot.`);
    else if (energyPct <= 20) parts.push(`This past week has been quiet — only <b>${energyPct}%</b> of sessions ran energized.`);
  }
  const moodCorr = moodLoudnessGap(sessions);
  if (moodCorr) parts.push(moodCorr);

  el.innerHTML = parts.length
    ? parts.map((p) => `<p>${p}</p>`).join('')
    : `<p class="empty">Not enough of a spread yet to draw a real pattern — keep it running.</p>`;
}

function moodLoudnessGap(sessions) {
  const withMood = sessions.filter((s) => s.mood && s.loudnessDb != null);
  const neg = withMood.filter((s) => NEGATIVE_MOODS.has(s.mood));
  const pos = withMood.filter((s) => POSITIVE_MOODS.has(s.mood));
  if (neg.length < 2 || pos.length < 2) return null;
  const avgNeg = neg.reduce((a, b) => a + b.loudnessDb, 0) / neg.length;
  const avgPos = pos.reduce((a, b) => a + b.loudnessDb, 0) / pos.length;
  const gap = avgNeg - avgPos;
  if (Math.abs(gap) < 6) return null;
  return gap > 0
    ? `Based on ${withMood.length} mood check-ins, your lower-mood ones average <b>${Math.round(gap)}dB louder</b> than your better ones.`
    : `Based on ${withMood.length} mood check-ins, your better-mood ones actually run <b>${Math.round(-gap)}dB louder</b> — quiet isn't automatically better for you.`;
}

function mixHex(hexA, hexB, t) {
  t = Math.max(0, Math.min(1, t));
  const a = hexToRgbLocal(hexA), b = hexToRgbLocal(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t), g = Math.round(a.g + (b.g - a.g) * t), bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}
function hexToRgbLocal(hex) {
  const h = hex.replace('#', '');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function renderLog(sessions) {
  const el = document.getElementById('log');
  if (sessions.length === 0) {
    el.innerHTML = `<p style="color:#837791;font-size:13px;">Nothing logged yet.</p>`;
    return;
  }
  el.innerHTML = sessions
    .map((s) => {
      const title = s.trackTitle
        ? `${s.trackTitle}${s.trackArtist ? ' — ' + s.trackArtist : ''}`
        : s.tabTitle || (s.mood ? 'Mood check-in' : 'Session');
      const tag = s.source === 'auto' ? 'auto' : s.source === 'auto-track' ? 'track ID' : s.source === 'checkin' ? 'check-in' : 'manual';
      const metaParts = [];
      if (s.energyScore != null) metaParts.push(`energy ${s.energyScore}`);
      if (s.calmScore != null) metaParts.push(`calm ${s.calmScore}`);
      if (s.loudnessDb != null) metaParts.push(`${Math.round(s.loudnessDb)} dB`);
      if (s.mood) metaParts.push(MOOD_LABELS[s.mood] || s.mood);
      return `
        <div class="log-row" data-id="${s.id}">
          <span class="log-tag">${tag}</span>
          <div style="flex:1">
            <div class="log-title">${escapeHtml(title)}</div>
            <div class="log-meta">${new Date(s.timestamp).toLocaleString()} · ${metaParts.join(' · ')}</div>
            ${s.note ? `<div class="log-meta" style="font-style:italic">"${escapeHtml(s.note)}"</div>` : ''}
          </div>
          <button class="log-del" data-id="${s.id}">✕</button>
        </div>`;
    })
    .join('');

  el.querySelectorAll('.log-del').forEach((btn) => {
    btn.addEventListener('click', () => deleteEntry(btn.dataset.id));
  });
}

function deleteEntry(id) {
  chrome.storage.local.get(['sessions'], (r) => {
    const next = (r.sessions || []).filter((s) => s.id !== id);
    chrome.storage.local.set({ sessions: next }, () => {
      const sorted = next.slice().sort((a, b) => b.timestamp - a.timestamp);
      renderBadges(sorted);
      renderStats(sorted);
      renderDigest(sorted);
      renderChart(sorted);
      renderBands(sorted);
      renderHeatmap(sorted);
      renderBalance(sorted);
      renderInsights(sorted);
      renderLog(sorted);
    });
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
