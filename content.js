(function () {
  if (window.__OGxISAI_LOADED__) return;
  window.__OGxISAI_LOADED__ = true;

  /* ── Content-Script ↔ Page-Script Bridge ────────────────────────
     Content script runs in isolated world with extension permissions.
     Page script (gate.js / injector.js) runs in page world (subject to CSP).
     We use window postMessage to bridge storage and backend API calls securely. */
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.target !== 'OGX_CONTENT_SCRIPT') return;

    const { id, action, payload } = event.data;

    if (action === 'GET_STORAGE') {
      try {
        chrome.storage.local.get('ogx_lic', (d) => {
          window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: true, result: d ? d.ogx_lic : null }, '*');
        });
      } catch (err) {
        window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: false, error: err ? err.message : 'Storage error' }, '*');
      }
    } else if (action === 'SET_STORAGE') {
      try {
        chrome.storage.local.set({ ogx_lic: payload }, () => {
          window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: true, result: true }, '*');
        });
      } catch (err) {
        window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: false, error: err ? err.message : 'Storage error' }, '*');
      }
    } else if (action === 'API_CALL') {
      const { base, path, body } = payload || {};
      try {
        const url = (base || '').replace(/\/+$/, '') + path;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 60000) : null;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
          signal: controller ? controller.signal : undefined,
        });
        if (timer) clearTimeout(timer);

        const txt = await res.text();
        let json = null;
        try { json = JSON.parse(txt); } catch (_) {}

        if (json && typeof json === 'object') {
          json.http = res.status;
          window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: true, result: json }, '*');
        } else {
          window.postMessage({
            target: 'OGX_PAGE_SCRIPT', id, ok: true,
            result: { network: true, http: res.status, body: txt.slice(0, 200) }
          }, '*');
        }
      } catch (err) {
        window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: true, result: { network: true, error: err ? err.message : 'Fetch failed' } }, '*');
      }
    } else if (action === 'INJECT_CODE') {
      try {
        const code = payload ? payload.code : '';
        if (code) {
          const blob = new Blob([code], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          const s = document.createElement('script');
          s.src = url;
          s.setAttribute('data-engine', 'ogx-blob');
          s.onload = () => {
            URL.revokeObjectURL(url);
            s.remove();
          };
          (document.head || document.documentElement).appendChild(s);
          window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: true, result: true }, '*');
        } else {
          window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: false, error: 'Empty code' }, '*');
        }
      } catch (err) {
        window.postMessage({ target: 'OGX_PAGE_SCRIPT', id, ok: false, error: err ? err.message : 'Injection error' }, '*');
      }
    }
  });



  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('gate.js'); // tiny launcher — powers load from the server after key success
  s.dataset.loadingGif = chrome.runtime.getURL('loading.gif');
  s.dataset.headerGif  = chrome.runtime.getURL('header.gif');

  /* ──────────────────────────────────────────────────────────────
     ★ YOUR RENDER URL — replace the placeholder with your live URL,
       e.g.  https://ogxisai-license.onrender.com
     ────────────────────────────────────────────────────────────── */
  s.dataset.apiBase = 'https://ogxisai-license.onrender.com'; // ⬅ live Render license/engine server

  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
})();

