const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'injector.js');
const rawCode = fs.readFileSync(srcPath, 'utf8');

function encryptJS(code) {
  const key = 0x7e;
  const buf = Buffer.from(code, 'utf8');
  const xorBuf = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    xorBuf[i] = buf[i] ^ key;
  }
  const b64 = xorBuf.toString('base64');

  // Verify decryption in Node.js
  const decBuf = Buffer.from(b64, 'base64');
  const decXor = Buffer.alloc(decBuf.length);
  for (let i = 0; i < decBuf.length; i++) {
    decXor[i] = decBuf[i] ^ key;
  }
  const decStr = decXor.toString('utf8');
  if (decStr !== code) {
    throw new Error('Verification failed! Decoded string does not match source.');
  }

  return `/**
 * OGxISAI Protected Engine Core
 * (C) OGxISAI — All rights reserved. Encrypted & Obfuscated build.
 */
(function(_0x8a9b){
  if(window.__OGxISAI_LOADED_ENGINE__) return;
  window.__OGxISAI_LOADED_ENGINE__ = true;
  try {
    var _0x3f4a = ${key};
    var _0x1c2d = atob(_0x8a9b);
    var _0x5e6f = new Uint8Array(_0x1c2d.length);
    for(var _0x7b8c=0;_0x7b8c<_0x1c2d.length;_0x7b8c++){
      _0x5e6f[_0x7b8c] = _0x1c2d.charCodeAt(_0x7b8c) ^ _0x3f4a;
    }
    var _0x9d0e = (new TextDecoder('utf-8')).decode(_0x5e6f);
    (0, eval)(_0x9d0e);
  } catch(e) {
    console.error('[OGxISAI] Engine startup error', e);
  }
})(${JSON.stringify(b64)});`;
}

const encrypted = encryptJS(rawCode);
const outPathExt = path.join(__dirname, 'OGxISAI-Mic-Extension', 'injector.js');
const outPathServer = path.join(__dirname, 'server', 'sources', 'injector.js');
const outPathPayload = path.join(__dirname, 'server', 'payload.js');

fs.writeFileSync(outPathExt, encrypted, 'utf8');
fs.writeFileSync(outPathServer, encrypted, 'utf8');
fs.writeFileSync(outPathPayload, encrypted, 'utf8');

console.log('✔ Encrypted injector.js written successfully to:');
console.log('  1. OGxISAI-Mic-Extension/injector.js');
console.log('  2. server/sources/injector.js');
console.log('  3. server/payload.js');
console.log('Input size:', rawCode.length, 'bytes');
console.log('Encrypted output size:', encrypted.length, 'bytes');
