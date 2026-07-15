const needle = document.getElementById('needle');
const ticksGroup = document.getElementById('ticks');
const roFreq = document.getElementById('ro-freq');
const roDb = document.getElementById('ro-db');
const roTrack = document.getElementById('ro-track');
const interpretEl = document.getElementById('interpret');
const safetyEl = document.getElementById('safety');
const toggleBtn = document.getElementById('toggleBtn');

drawTicks();
init();

function drawTicks() {
  const cx = 110, cy = 120, rOut = 88, rIn = 78;
  for (let i = 0; i <= 8; i++) {
    const angleDeg = -180 + (i * (180 / 8));
    const rad = (angleDeg * Math.PI) / 180;
    const x1 = cx + rIn * Math.cos(rad), y1 = cy + rIn * Math.sin(rad);
    const x2 = cx + rOut * Math.cos(rad), y2 = cy + rOut * Math.sin(rad);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('class', 'tick');
    ticksGroup.appendChild(line);
  }
}

function setNeedle(energyScore) {
  const angle = (energyScore / 100) * 160 - 80;
  needle.style.transform = `rotate(${angle}deg)`;
}

function renderReadout(r) {
  if (!r) return;
  roFreq.textContent = `${r.domFreq}`;
  roDb.textContent = `${Math.round(r.loudnessDb)}`;
  setNeedle(r.energyScore);
  const { text, safety } = Wavelength.interpretation(r.energyScore, r.loudnessDb);
  interpretEl.textContent = text;
  if (safety) {
    safetyEl.textContent = '⚠ ' + safety;
    safetyEl.classList.remove('hidden');
  } else {
    safetyEl.classList.add('hidden');
  }
}

function init() {
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
    if (!state) return;
    setMonitoring(state.monitoring);
    if (state.latestReadout) renderReadout(state.latestReadout);
    if (state.currentTrack) roTrack.textContent = state.currentTrack.split('::')[0];
  });
}

function setMonitoring(on) {
  toggleBtn.textContent = on ? 'stop listening' : 'start listening';
  toggleBtn.dataset.on = on ? '1' : '0';
  if (!on) interpretEl.textContent = "hit start and i'll tell u what's going on 👀";
}

toggleBtn.addEventListener('click', () => {
  const isOn = toggleBtn.dataset.on === '1';
  if (isOn) {
    chrome.runtime.sendMessage({ type: 'STOP_MONITORING' }, () => setMonitoring(false));
  } else {
    toggleBtn.textContent = 'starting…';
    chrome.runtime.sendMessage({ type: 'START_MONITORING' }, (res) => {
      if (res?.ok) setMonitoring(true);
      else {
        interpretEl.textContent = "couldn't start — make sure this tab's actually playing something and try again 🫠";
        setMonitoring(false);
      }
    });
  }
});

document.getElementById('journalBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('journal.html') });
});
document.getElementById('optionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'READOUT_BROADCAST') renderReadout(msg.payload);
});
