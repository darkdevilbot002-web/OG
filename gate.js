/**
 * OGxISAI — GATE (the launcher shipped in the extension zip)
 * ─────────────────────────────────────────────────────────────
 * This file contains NO audio/engine code. It only:
 *   1. Shows a lock screen asking for the activation key.
 *   2. On valid key -> fetches the engine code from Render backend
 *      (POST /api/injector) via content-script postMessage bridge.
 *   3. ONLY THEN runs the engine script in page memory.
 * Revoking the key on backend stops /api/injector -> engine never loads.
 */
(function () {
  'use strict';
  if (window.__OGX_GATE__) return;
  window.__OGX_GATE__ = true;

  const _script      = document.currentScript || document.querySelector('script[data-api-base]');
  const API_BASE     = _script ? (_script.dataset.apiBase || '').replace(/\/+$/, '') : 'https://ogxisai-license.onrender.com';
  const INJECTOR_URL = _script && _script.dataset ? _script.dataset.injectorUrl : '';
  const LOADING_GIF  = _script && _script.dataset ? _script.dataset.loadingGif : '';
  const HEADER_GIF   = _script && _script.dataset ? _script.dataset.headerGif : '';
  const STORE       = 'ogx_lic_v2';
  const LIC         = { key: null, deviceId: null };

  const pendingMsgs = new Map();

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.target !== 'OGX_PAGE_SCRIPT') return;
    const { id, ok, result, error } = event.data;
    if (pendingMsgs.has(id)) {
      const { resolve, reject } = pendingMsgs.get(id);
      pendingMsgs.delete(id);
      if (ok) resolve(result);
      else reject(new Error(error || 'Message error'));
    }
  });

  function sendBridge(action, payload) {
    return new Promise((resolve, reject) => {
      const id = 'ogx_' + Math.random().toString(36).slice(2) + Date.now();
      pendingMsgs.set(id, { resolve, reject });
      window.postMessage({ target: 'OGX_CONTENT_SCRIPT', id, action, payload }, '*');
      setTimeout(() => {
        if (pendingMsgs.has(id)) {
          pendingMsgs.delete(id);
          reject(new Error('Bridge timeout'));
        }
      }, 12000);
    });
  }

  function genId() {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function loadStored() {
    return sendBridge('GET_STORAGE', null)
      .then((d) => {
        if (d) { LIC.key = d.key || null; LIC.deviceId = d.deviceId || null; }
        return !!LIC.key;
      })
      .catch(() => {
        try {
          const raw = localStorage.getItem(STORE);
          const d = raw ? JSON.parse(raw) : null;
          if (d) { LIC.key = d.key || null; LIC.deviceId = d.deviceId || null; }
          return !!LIC.key;
        } catch (_) { return false; }
      });
  }

  function saveStored() {
    const v = { key: LIC.key, deviceId: LIC.deviceId };
    sendBridge('SET_STORAGE', v).catch(() => {
      try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (_) {}
    });
  }

  function pageHtml(path, body) {
    return new Promise((resolve) => {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 60000) : null;
      fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        signal: ctrl ? ctrl.signal : undefined,
      }).then((r) => Promise.all([r.status, r.json().catch(() => null)])).then(([status, data]) => {
        if (timer) clearTimeout(timer);
        resolve(data ? Object.assign({ _status: status }, data) : { network: true, _status: status });
      }).catch(() => {
        if (timer) clearTimeout(timer);
        resolve({ network: true });
      });
    });
  }

  function api(path, body) {
    if (!API_BASE) return Promise.resolve({ network: true });
    return sendBridge('API_CALL', { base: API_BASE, path, body })
      .then((res) => {
        if (res && res.network && !res.http && !res._status) return pageHtml(path, body);
        return res;
      })
      .catch(() => pageHtml(path, body));
  }

  function errText(res, fb) {
    if (!res) return fb || 'Unknown error.';
    if (res.network && res.http) return 'Server error HTTP ' + res.http + ' — check backend logs.';
    if (res.network) return 'No response from server: ' + (API_BASE || 'NO-URL') + '. If Render is starting, retry in a moment.';
    const pre = res.code ? '[' + res.code + '] ' : '';
    return pre + (res.message || res.error || fb || 'Key invalid, expired or revoked.');
  }

  const CSS = `
  #bm-root.locked{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;pointer-events:auto;font-family:'Inter','Segoe UI',system-ui,sans-serif;background:#05050a;}
  #bm-root.locked .bm-lic-bg{position:absolute;inset:0;overflow:hidden;opacity:.32;}
  #bm-root.locked .bm-lic-bg img{width:100%;height:100%;object-fit:cover;filter:grayscale(.4) brightness(.45);}
  .bm-lic-card{position:relative;z-index:2;width:min(360px,88vw);padding:38px 26px 30px;text-align:center;border-radius:18px;border:1px solid rgba(220,38,38,.45);background:linear-gradient(160deg,#0b0f1e,rgba(20,8,14,.95));box-shadow:0 0 60px rgba(220,38,38,.25),0 24px 60px rgba(0,0,0,.8);}
  .bm-lic-moon{font-size:56px;line-height:1;filter:drop-shadow(0 0 26px rgba(220,38,38,.8));}
  .bm-lic-title{font-weight:900;font-size:26px;letter-spacing:8px;color:#fff;margin-top:10px;text-shadow:0 0 18px rgba(220,38,38,.7);}
  .bm-lic-sub{font-size:11px;letter-spacing:4px;color:#f87171;text-transform:uppercase;margin:8px 0 22px;}
  .bm-lic-input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid rgba(248,113,113,.4);background:rgba(0,0,0,.5);color:#fff;font-size:15px;letter-spacing:1px;text-align:center;outline:none;box-sizing:border-box;}
  .bm-lic-input:focus{border-color:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.2);}
  .bm-lic-msg{margin:12px 4px;font-size:12px;color:#cbd5e1;min-height:16px;line-height:1.4;}
  .bm-lic-msg.err{color:#fca5a5;}
  .bm-lic-btn{width:100%;margin-top:6px;padding:13px;border:0;border-radius:10px;cursor:pointer;font-weight:800;letter-spacing:2px;font-size:13px;color:#fff;background:linear-gradient(135deg,#7f1d1d,#dc2626);box-shadow:0 8px 24px rgba(220,38,38,.4);}
  .bm-lic-btn:hover{filter:brightness(1.15);}
  .bm-lic-btn:disabled{opacity:.6;cursor:wait;}`;

  function showOverlay(inner) {
    let o = document.getElementById('ogx-connecting');
    if (!o) {
      o = document.createElement('div');
      o.id = 'ogx-connecting';
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(5,5,10,.97);color:#cbd5e1;font-family:Inter,Arial,sans-serif;text-align:center;pointer-events:auto;';
      document.body.appendChild(o);
    }
    o.innerHTML = '<div style="max-width:300px">' + inner + '</div>';
  }
  function hideOverlay() {
    const o = document.getElementById('ogx-connecting');
    if (o) o.remove();
  }

  function showRoot(html) {
    let old = document.getElementById('bm-root');
    if (old) old.remove();
    const root = document.createElement('div');
    root.id = 'bm-root';
    root.className = 'locked';
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  }

  function buildLock(message) {
    hideOverlay();
    const st = document.createElement('style');
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);

    const root = showRoot(`
      ${LOADING_GIF ? `<div class="bm-lic-bg"><img src="${LOADING_GIF}" alt=""></div>` : ''}
      <div class="bm-lic-card">
        <div class="bm-lic-moon">🌑</div>
        <div class="bm-lic-title">OGxISAI</div>
        <div class="bm-lic-sub">License Required</div>
        <input class="bm-lic-input" type="text" maxlength="32" placeholder="Enter your activation key" autocomplete="off" spellcheck="false">
        <div class="bm-lic-msg" id="bm-lic-msg">${message || 'Paste the key we gave you to unlock all powers.'}</div>
        <button class="bm-lic-btn" id="bm-lic-go">UNLOCK ALL POWERS</button>
      </div>`);

    const input = root.querySelector('.bm-lic-input');
    const msg = root.querySelector('#bm-lic-msg');
    const btn = root.querySelector('#bm-lic-go');

    function pending(on) { btn.disabled = on; btn.textContent = on ? 'VERIFYING…' : 'UNLOCK ALL POWERS'; }
    function attempt(key, deviceId, tries, maxTry) {
      pending(true); msg.classList.remove('err');
      msg.textContent = tries > 1 ? ('Server starting… retrying (' + tries + '/' + maxTry + ')') : 'Contacting license server…';
      api('/api/injector', { key, deviceId }).then((res) => {
        if (res && res.ok) {
          msg.classList.remove('err'); msg.textContent = '✔ License verified — loading engine…';
          setTimeout(() => { root.remove(); runEngine(res.code); }, 600);
        } else if (res && res.network && tries < maxTry) {
          setTimeout(() => attempt(key, LIC.deviceId, tries + 1, maxTry), 9000);
        } else {
          pending(false);
          msg.textContent = errText(res, 'Key invalid, expired or revoked.');
        }
      }).catch(() => {
        if (tries < maxTry) setTimeout(() => attempt(key, LIC.deviceId, tries + 1, maxTry), 9000);
        else { pending(false); msg.classList.add('err'); msg.textContent = errText({ network: true }, ''); }
      });
    }
    function run() {
      const key = (input.value || '').trim().toUpperCase();
      if (!key) { msg.classList.add('err'); msg.textContent = 'Enter your key first.'; input.focus(); return; }
      if (!API_BASE) { msg.classList.add('err'); msg.textContent = 'This build has no license server configured.'; return; }
      LIC.key = key; LIC.deviceId = LIC.deviceId || genId(); saveStored();
      attempt(key, LIC.deviceId, 1, 5);
    }
    btn.addEventListener('click', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    input.focus();
  }

  /* Execute the engine code returned from the server after verification. */
  function runEngine(code) {
    if (!code) return;
    delete window.__OGxISAI__;
    hideOverlay();

    // 1. Try Extension-level Blob injection via content script bridge
    sendBridge('INJECT_CODE', { code }).catch(() => {});

    // 2. DOM script tag text content insertion
    try {
      let el = document.querySelector('script[data-engine="ogx"]');
      if (el) el.remove();
      el = document.createElement('script');
      el.setAttribute('data-engine', 'ogx');
      if (LOADING_GIF) el.setAttribute('data-loading-gif', LOADING_GIF);
      if (HEADER_GIF)  el.setAttribute('data-header-gif', HEADER_GIF);
      if (API_BASE)    el.setAttribute('data-api-base', API_BASE);
      try { el.textContent = code; } catch (_) { el.appendChild(document.createTextNode(code)); }
      (document.head || document.documentElement).appendChild(el);
    } catch (err) {
      console.error('[OGxISAI] Engine launch failed', err);
    }
  }


  function bootRetry(attempt) {
    api('/api/injector', { key: LIC.key, deviceId: LIC.deviceId }).then((res) => {
      if (res && res.ok) {
        hideOverlay();
        runEngine(res.code);
      } else if (res && res.network && attempt < 4) {
        setTimeout(() => bootRetry(attempt + 1), 9000);
      } else {
        hideOverlay();
        buildLock(errText(res, 'License no longer valid.'));
      }
    }).catch(() => {
      if (attempt < 4) setTimeout(() => bootRetry(attempt + 1), 9000);
      else { hideOverlay(); buildLock('Could not reach the license server (network).'); }
    });
  }

  function boot() {
    if (!API_BASE) { buildLock('No license server configured in this build.'); return; }
    loadStored().then((has) => {
      if (has) {
        showOverlay('🌑<div style="font-size:13px;letter-spacing:.5px">Checking your license…<br><small style="color:#6b7280">First load on Render free can take ~1 min — hang on.</small></div>');
        bootRetry(1);
      } else {
        buildLock();
      }
    });
  }

  boot();
})();