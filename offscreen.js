let audioCtx, analyser, mediaStream, sourceNode, destPassthrough;
let analysisTimer, recognitionTimer;
let auddApiKey = null;
let recognitionEnabled = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'START_CAPTURE') {
    startCapture(msg.streamId, msg.auddApiKey, msg.recognitionEnabled);
  }
  if (msg.type === 'STOP_CAPTURE') {
    stopCapture();
  }
});

async function startCapture(streamId, apiKey, recEnabled) {
  auddApiKey = apiKey;
  recognitionEnabled = recEnabled;

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  audioCtx = new AudioContext();
  sourceNode = audioCtx.createMediaStreamSource(mediaStream);

  // Passthrough so the user still hears the tab audio while we capture it
  destPassthrough = audioCtx.createMediaStreamDestination();
  sourceNode.connect(destPassthrough);
  const passthroughAudio = new Audio();
  passthroughAudio.srcObject = destPassthrough.stream;
  passthroughAudio.play().catch(() => {});

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.75;
  sourceNode.connect(analyser);

  analysisTimer = setInterval(runAnalysis, 250);
  if (recognitionEnabled && auddApiKey) {
    recognitionTimer = setInterval(recognizeTrack, 20000);
    setTimeout(recognizeTrack, 4000); // first attempt shortly after start
  }
}

function stopCapture() {
  clearInterval(analysisTimer);
  clearInterval(recognitionTimer);
  mediaStream?.getTracks()?.forEach((t) => t.stop());
  audioCtx?.close?.();
  window.close();
}

function runAnalysis() {
  if (!analyser) return;
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);
  analyser.getByteFrequencyData(freqData);
  analyser.getByteTimeDomainData(timeData);

  let sumSq = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / timeData.length);
  const loudnessDb = Wavelength.clampInt(20 * Math.log10(rms + 1e-6) + 100, 0, 110);

  let maxBin = 0, maxVal = 0;
  for (let i = 0; i < freqData.length; i++) {
    if (freqData[i] > maxVal) { maxVal = freqData[i]; maxBin = i; }
  }
  const nyquist = audioCtx.sampleRate / 2;
  const domFreq = Math.round((maxBin / freqData.length) * nyquist);

  const { energyScore, calmScore } = Wavelength.scoreFromAcoustics({ domFreq, loudnessDb });

  chrome.runtime.sendMessage({
    type: 'UPDATE_READOUT',
    payload: { domFreq, loudnessDb, energyScore, calmScore, spectrum: Array.from(freqData.slice(0, 128)) },
  });
}

async function recognizeTrack() {
  if (!mediaStream || !auddApiKey) return;
  try {
    const recorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    const stopped = new Promise((resolve) => (recorder.onstop = resolve));
    recorder.start();
    setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 6000);
    await stopped;
    const blob = new Blob(chunks, { type: 'audio/webm' });

    const form = new FormData();
    form.append('file', blob, 'clip.webm');
    form.append('api_token', auddApiKey);
    form.append('return', 'spotify');

    const res = await fetch('https://api.audd.io/', { method: 'POST', body: form });
    const data = await res.json();
    if (data?.result?.title) {
      chrome.runtime.sendMessage({
        type: 'TRACK_RECOGNIZED',
        payload: { title: data.result.title, artist: data.result.artist },
      });
    }
  } catch (e) {
    // Recognition is best-effort; silently skip on failure (network hiccup, no match, etc.)
  }
}
