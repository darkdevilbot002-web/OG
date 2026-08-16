(function () {
  if (window.__OGxISAI_LOADED__) return;
  window.__OGxISAI_LOADED__ = true;

  const API_BASE = 'https://ogxisai-license.onrender.com';

  /* ─── postMessage Bridge (Content Script <-> Page Script) ─── */
  window.addEventListener('message', (event) => {
    if (!event.data || typeof event.data !== 'object') return;
    const { type, id, path, body, value } = event.data;

    if (type === 'OGX_API_REQ') {
      fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
        .then((r) => r.json().catch(() => ({ network: true })))
        .catch(() => ({ network: true }))
        .then((res) => {
          window.postMessage({ type: 'OGX_API_RES', id, res }, '*');
        });
    } else if (type === 'OGX_STORE_GET') {
      try {
        chrome.storage.local.get('ogx_lic', (d) => {
          window.postMessage({ type: 'OGX_STORE_GET_RES', id, data: d ? d.ogx_lic : null }, '*');
        });
      } catch (_) {
        window.postMessage({ type: 'OGX_STORE_GET_RES', id, data: null }, '*');
      }
    } else if (type === 'OGX_STORE_SET') {
      try {
        chrome.storage.local.set({ ogx_lic: value }, () => {
          window.postMessage({ type: 'OGX_STORE_SET_RES', id, ok: true }, '*');
        });
      } catch (_) {
        window.postMessage({ type: 'OGX_STORE_SET_RES', id, ok: false }, '*');
      }
    }
  });

  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('injector.js');
  s.dataset.loadingGif = chrome.runtime.getURL('loading.gif');
  s.dataset.headerGif  = chrome.runtime.getURL('header.gif');
  s.dataset.apiBase    = API_BASE;

  (document.head || document.documentElement).appendChild(s);
})();
