const fields = ['apiKey', 'recognitionEnabled', 'notifEnabled', 'checkinEnabled'];

chrome.storage.local.get(['auddApiKey', 'recognitionEnabled', 'notifEnabled', 'checkinEnabled'], (r) => {
  document.getElementById('apiKey').value = r.auddApiKey || '';
  document.getElementById('recognitionEnabled').checked = !!r.recognitionEnabled;
  document.getElementById('notifEnabled').checked = r.notifEnabled !== false;
  document.getElementById('checkinEnabled').checked = r.checkinEnabled !== false;
});

document.getElementById('save').addEventListener('click', () => {
  chrome.storage.local.set(
    {
      auddApiKey: document.getElementById('apiKey').value.trim(),
      recognitionEnabled: document.getElementById('recognitionEnabled').checked,
      notifEnabled: document.getElementById('notifEnabled').checked,
      checkinEnabled: document.getElementById('checkinEnabled').checked,
    },
    () => {
      const s = document.getElementById('status');
      s.textContent = 'Saved.';
      setTimeout(() => (s.textContent = ''), 1800);
    }
  );
});
