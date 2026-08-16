(function () {
  if (window.__OGxISAI_LOADED__) return;
  window.__OGxISAI_LOADED__ = true;

  /* ── License storage bridge ─────────────────────────────────────
     Runs in the content-script (isolated) world but is reachable from
     the page script, so injector.js can persist activation via
     chrome.storage.local (survives across sites/tabs). The api()
     helper also lets us call the license server even on pages whose
     Content-Security-Policy would block a page-context fetch. */
  try {
    window.__OGX_LIC_BRIDGE__ = {
      get() {
        return new Promise((res) => {
          try { chrome.storage.local.get('ogx_lic', (d) => res(d ? d.ogx_lic : null)); }
          catch (_) { res(null); }
        });
      },
      set(v) {
        return new Promise((res) => {
          try { chrome.storage.local.set({ ogx_lic: v }, () => res(true)); }
          catch (_) { res(false); }
        });
      },
      api(base, path, body) {
        return fetch(base + path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body || {}),
        })
          .then((r) => r.json())
          .catch(() => ({ network: true }));
      },
    };
  } catch (_) { /* fall back to per-site localStorage + page fetch inside injector */ }

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
