/* Histia — criptografia: todo con la WebCrypto del navegador, sin librerias. */
'use strict';

const Cripto = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITERACIONES = 600000;              // PBKDF2-SHA256, lo que recomienda OWASP
  const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

  /* De la contraseña salen dos cosas: la clave AES y la semilla que reparte los bits. */
  async function derivar(clave, sal) {
    const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: ITERACIONES }, base, 512));
    return { aes: await importarAes(bits.slice(0, 32)), semilla: bits.slice(32) };
  }
  const importarAes = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

  async function pasar(bytes, flujo) {
    const r = new Blob([bytes]).stream().pipeThrough(flujo);
    return new Uint8Array(await new Response(r).arrayBuffer());
  }
  const comprimir = (b) => pasar(b, new CompressionStream('deflate-raw'));
  const descomprimir = (b) => pasar(b, new DecompressionStream('deflate-raw'));

  /* {meta} + bytes -> comprimido -> iv + AES-GCM */
  async function sellar(aes, meta, bytes) {
    const m = enc.encode(JSON.stringify(meta));
    const plano = new Uint8Array(4 + m.length + bytes.length);
    new DataView(plano.buffer).setUint32(0, m.length);
    plano.set(m, 4);
    plano.set(bytes, 4 + m.length);
    const iv = aleatorio(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, await comprimir(plano)));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv);
    out.set(ct, 12);
    return out;
  }

  async function abrir(aes, datos) {
    const plano = await descomprimir(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: datos.slice(0, 12) }, aes, datos.slice(12))));
    const n = new DataView(plano.buffer).getUint32(0);
    return { meta: JSON.parse(dec.decode(plano.subarray(4, 4 + n))), bytes: plano.slice(4 + n) };
  }

  const aB64 = (b) => {
    let s = '';
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const deB64 = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  /* ---- notas: todo va en el fragmento (#), que el navegador nunca envia a ningun servidor ---- */
  async function crearNota(texto, clave, dias) {
    const meta = dias ? { exp: Date.now() + dias * 864e5 } : {};
    const bytes = enc.encode(texto);
    if (clave) {
      const sal = aleatorio(16);
      const { aes } = await derivar(clave, sal);
      return `1.p.${aB64(sal)}.${aB64(await sellar(aes, meta, bytes))}`;
    }
    const raw = aleatorio(32);
    return `1.k.${aB64(raw)}.${aB64(await sellar(await importarAes(raw), meta, bytes))}`;
  }

  async function leerNota(frag, clave) {
    const [v, modo, k, datos] = frag.split('.');
    if (v !== '1' || !datos) throw new Error('Enlace no válido');
    const aes = modo === 'p' ? (await derivar(clave || '', deB64(k))).aes : await importarAes(deB64(k));
    const { meta, bytes } = await abrir(aes, deB64(datos));
    return { texto: dec.decode(bytes), exp: meta.exp || 0 };
  }

  const pidePass = (frag) => frag.split('.')[1] === 'p';

  /* Fuerza aproximada: bits segun el alfabeto, con castigo a patrones obvios. */
  function bits(p) {
    if (!p) return 0;
    let pool = 0;
    if (/[a-z]/.test(p)) pool += 26;
    if (/[A-Z]/.test(p)) pool += 26;
    if (/[0-9]/.test(p)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(p)) pool += 33;
    let b = p.length * Math.log2(pool || 1);
    if (/^(.)\1+$/.test(p) || /^(123|abc|qwerty|password|contrase|admin|111)/i.test(p)) b = Math.min(b, 20);
    if (new Set(p).size < p.length / 2) b *= 0.6;
    return Math.round(b);
  }

  function generar(largo) {
    const a = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*-_=+?';
    const lim = 256 - (256 % a.length);
    let s = '';
    while (s.length < largo) for (const x of aleatorio(largo * 2)) if (x < lim && s.length < largo) s += a[x % a.length];
    return s;
  }

  /* k-anonimato: solo salen los 5 primeros caracteres del SHA-1. */
  async function filtrada(p) {
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-1', enc.encode(p)))].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    const r = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } });
    if (!r.ok) throw new Error(`HIBP ${r.status}`);
    const linea = (await r.text()).split('\n').find((l) => l.startsWith(h.slice(5)));
    return linea ? parseInt(linea.split(':')[1], 10) : 0;
  }

  return { derivar, sellar, abrir, aleatorio, crearNota, leerNota, pidePass, bits, generar, filtrada };
})();
