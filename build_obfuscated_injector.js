const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'injector.js');
const rawCode = fs.readFileSync(srcPath, 'utf8');

function obfuscateJS(code) {
  const key = 0x5a;
  const buf = Buffer.from(code, 'utf8');
  const xorBuf = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    xorBuf[i] = buf[i] ^ key;
  }
  const hex = xorBuf.toString('hex');
  
  // Chunk hex to prevent string length limit issues
  const chunkSize = 4000;
  const chunks = [];
  for (let i = 0; i < hex.length; i += chunkSize) {
    chunks.push(hex.slice(i, i + chunkSize));
  }

  const chunksArr = JSON.stringify(chunks);

  return `/**
 * OGxISAI Protected Engine Core
 * (C) OGxISAI — All rights reserved. Encrypted & Obfuscated build.
 */
(function() {
  'use strict';
  if (window.__OGxISAI_EXEC__) return;
  window.__OGxISAI_EXEC__ = true;
  try {
    var _k = 0x5a;
    var _c = ${chunksArr};
    var _h = _c.join('');
    var _b = new Uint8Array(_h.length / 2);
    for (var i = 0; i < _h.length; i += 2) {
      _b[i / 2] = parseInt(_h.substr(i, 2), 16) ^ _k;
    }
    var _dec = new TextDecoder('utf-8');
    var _src = _dec.decode(_b);
    var _fn = new Function(_src);
    _fn();
  } catch (e) {
    console.error('[OGxISAI] Execution error', e);
  }
})();`;
}

const obfuscated = obfuscateJS(rawCode);
const outPath = path.join(__dirname, 'OGxISAI-Mic-Extension', 'injector.js');
fs.writeFileSync(outPath, obfuscated, 'utf8');
console.log('Successfully wrote encrypted & obfuscated injector.js to extension folder!');
console.log('Input size:', rawCode.length, 'bytes');
console.log('Output size:', obfuscated.length, 'bytes');
