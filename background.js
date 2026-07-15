importScripts('shared.js');

const AUTO_LOG_INTERVAL_MS = 3 * 60 * 1000; // auto-journal every 3 min while monitoring
const CHECKIN_INTERVAL_MS = 20 * 60 * 1000; // ask for a mood check-in every 20 min
const LOUD_DB = 85;
const LOUD_WINDOW_MS = 60 * 1000;        // loudness must average this high over the last minute...
const LOUD_COOLDOWN_MS = 20 * 60 * 1000; // ...and won't repeat for 20 min after firing
const SWING_WINDOW_MS = 3 * 60 * 1000;   // energy trend is averaged over the last 3 min...
const SWING_COOLDOWN_MS = 25 * 60 * 1000; // ...and won't repeat for 25 min after firing
const HISTORY_RETENTION_MS = 10 * 60 * 1000;

let state = {
  monitoring: false,
  tabId: null,
  tabTitle: null,
  readoutBuffer: [], // readouts since last auto-log
  readoutHistory: [], // recent readouts w/ timestamps, for rolling averages
  lastAutoLog: 0,
  lastCheckin: 0,
  lastLoudNotif: 0,
  lastSwingNotif: 0,
  lastSwingBucket: null,
  currentTrack: null,
  latestReadout: null,
  notifEnabled: true,
  checkinEnabled: true,
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['sessions'], (r) => {
    if (!r.sessions) chrome.storage.local.set({ sessions: [] });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_MONITORING') {
    startMonitoring().then(() => sendResponse({ ok: true })).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg.type === 'STOP_MONITORING') {
    stopMonitoring();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'GET_STATE') {
    sendResponse({
      monitoring: state.monitoring,
      tabTitle: state.tabTitle,
      latestReadout: state.latestReadout,
      currentTrack: state.currentTrack,
    });
    return true;
  }
  if (msg.type === 'UPDATE_READOUT') {
    handleReadout(msg.payload);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'TRACK_RECOGNIZED') {
    handleTrackRecognized(msg.payload);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'LOG_MOOD') {
    logEntry({ source: 'manual', mood: msg.mood, note: msg.note || '' });
    sendResponse({ ok: true });
    return true;
  }
});

async function startMonitoring() {
  if (state.monitoring) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found.');
  state.tabId = tab.id;
  state.tabTitle = tab.title;

  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
      if (chrome.runtime.lastError || !id) reject(chrome.runtime.lastError?.message || 'Could not get stream id');
      else resolve(id);
    });
  });

  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!existing || existing.length === 0) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Analyze tab audio in real time for sound/mood monitoring.',
    });
  }

  const settings = await chrome.storage.local.get(['auddApiKey', 'recognitionEnabled', 'notifEnabled', 'checkinEnabled']);

  chrome.runtime.sendMessage({
    type: 'START_CAPTURE',
    streamId,
    tabTitle: tab.title,
    auddApiKey: settings.auddApiKey || null,
    recognitionEnabled: !!settings.recognitionEnabled,
  });

  state.monitoring = true;
  state.notifEnabled = settings.notifEnabled !== false;
  state.checkinEnabled = settings.checkinEnabled !== false;
  state.readoutHistory = [];
  state.lastAutoLog = Date.now();
  state.lastCheckin = Date.now();
  chrome.action.setBadgeText({ text: 'ON' });
  chrome.action.setBadgeBackgroundColor({ color: '#C9962C' });
}

function stopMonitoring() {
  if (!state.monitoring) return;
  chrome.runtime.sendMessage({ type: 'STOP_CAPTURE' });
  chrome.offscreen.hasDocument?.().then((has) => {
    if (has) chrome.offscreen.closeDocument();
  });
  flushAutoLog();
  state.monitoring = false;
  state.tabId = null;
  state.readoutBuffer = [];
  state.readoutHistory = [];
  chrome.action.setBadgeText({ text: '' });
}

function handleReadout(readout) {
  state.latestReadout = readout;
  state.readoutBuffer.push(readout);

  const now = Date.now();
  state.readoutHistory.push({ ...readout, t: now });
  state.readoutHistory = state.readoutHistory.filter((r) => now - r.t < HISTORY_RETENTION_MS);

  chrome.runtime.sendMessage({ type: 'READOUT_BROADCAST', payload: readout }).catch(() => {});

  if (state.notifEnabled) {
    checkSustainedLoudness(now);
    checkSustainedSwing(now);
  }

  if (now - state.lastAutoLog > AUTO_LOG_INTERVAL_MS) {
    flushAutoLog();
  }
  if (state.checkinEnabled && now - state.lastCheckin > CHECKIN_INTERVAL_MS) {
    state.lastCheckin = now;
    notifyCheckin();
  }
}

function avgOf(arr, key) {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b[key], 0) / arr.length;
}

// Only fires when loudness has AVERAGED at/above the threshold for a sustained
// window (not a single loud instant), and won't repeat for LOUD_COOLDOWN_MS after.
function checkSustainedLoudness(now) {
  if (now - state.lastLoudNotif < LOUD_COOLDOWN_MS) return;
  const window = state.readoutHistory.filter((r) => now - r.t < LOUD_WINDOW_MS);
  if (window.length < 8) return; // not enough samples yet to trust the average
  const avgLoud = avgOf(window, 'loudnessDb');
  if (avgLoud >= LOUD_DB) {
    state.lastLoudNotif = now;
    notify(
      'loud-' + now,
      "That's been a loud stretch",
      `Averaging ~${Math.round(avgLoud)} dB for the last minute. Sustained exposure at this level is linked to long-term hearing risk — might be worth turning it down.`
    );
  }
}

// Only fires when the average energy over the last few minutes has genuinely
// shifted into a new zone (not just one loud/quiet moment), and won't repeat
// for SWING_COOLDOWN_MS after.
function checkSustainedSwing(now) {
  const window = state.readoutHistory.filter((r) => now - r.t < SWING_WINDOW_MS);
  if (window.length < 20) return; // need a few minutes of data before trusting the trend
  const avgEnergy = avgOf(window, 'energyScore');
  const bucket = avgEnergy >= 65 ? 'high' : avgEnergy <= 35 ? 'low' : 'mid';

  if (bucket === 'mid') {
    state.lastSwingBucket = 'mid'; // reset baseline so a later swing counts as new
    return;
  }
  if (bucket === state.lastSwingBucket) return; // already notified for this state
  if (now - state.lastSwingNotif < SWING_COOLDOWN_MS) return;

  state.lastSwingNotif = now;
  state.lastSwingBucket = bucket;
  const msg = bucket === 'high'
    ? "The sound's been consistently brighter/louder for a while now."
    : "The sound's settled into something quieter and lower for a while now.";
  notify('swing-' + now, 'Sound trend shifted', msg);
}

function handleTrackRecognized(track) {
  if (!track || !track.title) return;
  const key = `${track.title}::${track.artist || ''}`;
  if (state.currentTrack === key) return;
  state.currentTrack = key;
  if (state.notifEnabled) {
    notify(
      'track-' + Date.now(),
      'Now playing, identified',
      `${track.title}${track.artist ? ' — ' + track.artist : ''}`
    );
  }
  logEntry({
    source: 'auto-track',
    trackTitle: track.title,
    trackArtist: track.artist || null,
    energyScore: state.latestReadout?.energyScore ?? null,
    calmScore: state.latestReadout?.calmScore ?? null,
    loudnessDb: state.latestReadout?.loudnessDb ?? null,
  });
}

function flushAutoLog() {
  if (state.readoutBuffer.length === 0) return;
  const avg = (key) => state.readoutBuffer.reduce((a, b) => a + (b[key] || 0), 0) / state.readoutBuffer.length;
  logEntry({
    source: 'auto',
    tabTitle: state.tabTitle,
    energyScore: Math.round(avg('energyScore')),
    calmScore: Math.round(avg('calmScore')),
    loudnessDb: Math.round(avg('loudnessDb')),
    domFreq: Math.round(avg('domFreq')),
    trackTitle: state.currentTrack ? state.currentTrack.split('::')[0] : null,
  });
  state.readoutBuffer = [];
  state.lastAutoLog = Date.now();
}

function logEntry(partial) {
  chrome.storage.local.get(['sessions'], (r) => {
    const sessions = r.sessions || [];
    sessions.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      ...partial,
    });
    chrome.storage.local.set({ sessions: sessions.slice(0, 500) });
  });
}

function notify(id, title, message, requireCheckin) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 1,
  });
}

function notifyCheckin() {
  chrome.notifications.create('checkin-' + Date.now(), {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Quick check-in',
    message: "How are you feeling right now? Tap to log it.",
    buttons: [{ title: '🙂 Good' }, { title: '😬 Not great' }],
    priority: 1,
  });
}

chrome.notifications.onButtonClicked.addListener((notifId, btnIdx) => {
  if (notifId.startsWith('checkin-')) {
    logEntry({ source: 'checkin', mood: btnIdx === 0 ? 'good' : 'notgreat' });
  }
});
