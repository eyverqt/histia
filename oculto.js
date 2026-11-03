/* Histia — esteganografia. Esconde datos cifrados en el bit menos significativo de
   una imagen (RGB) o de un WAV de 16 bits. Sin marca reconocible: los primeros 128
   bits son la sal y el resto se reparte en un orden que solo da la contraseña. */
'use strict';

const Oculto = (() => {
  const SAL = 16, CAB = 4;         // bytes: sal y longitud enmascarada
  const MAX_CELDAS = 150e6;

  /* Portador: bytes + como llegar al byte de la celda i */
  const enImagen = (d) => ({ bytes: d, n: (d.length / 4) * 3, pos: (i) => Math.floor(i / 3) * 4 + i % 3 });
  const enAudio = (d, ini, largo) => ({ bytes: d, n: Math.floor(largo / 2), pos: (i) => ini + i * 2 });

  const capacidad = (celdas) => Math.max(0, Math.floor((celdas - SAL * 8) / 8) - CAB - 12 - 16);

  /* xoshiro128**: determinista para la misma semilla */
  function prng(s) {
    const v = new DataView(s.buffer, s.byteOffset, 16);
    let a = v.getUint32(0), b = v.getUint32(4), c = v.getUint32(8), d = v.getUint32(12);
    const rotl = (x, k) => (x << k) | (x >>> (32 - k));
    return () => {
      const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
      const t = b << 9;
      c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11);
      return r;
    };
  }

  /* Fisher-Yates perezoso sobre las celdas que quedan tras la sal */
  function orden(total, semilla) {
    const azar = prng(semilla), m = total - SAL * 8;
    const t = new Uint32Array(m);
    let j = 0;
    return () => {
      if (j >= m) throw new Error('fuera de capacidad');
      const r = j + Math.floor(azar() / 4294967296 * (m - j));
      const x = t[r] || r, y = t[j] || j;
      t[r] = y; t[j] = x;
      j++;
      return x + SAL * 8;
    };
  }

  const poner = (p, i, bit) => { const o = p.pos(i); p.bytes[o] = (p.bytes[o] & 0xfe) | bit; };
  const sacar = (p, i) => p.bytes[p.pos(i)] & 1;

  async function ocultar(p, clave, meta, datos) {
    if (p.n > MAX_CELDAS) throw new Error('Portador demasiado grande para el navegador');
    const sal = Cripto.aleatorio(SAL);
    const { aes, semilla } = await Cripto.derivar(clave, sal);
    const sellado = await Cripto.sellar(aes, meta, datos);
    if (sellado.length > capacidad(p.n) + 28) {
      throw new Error(`No cabe: ocupa ${sellado.length} bytes y caben ${capacidad(p.n) + 28}`);
    }
    for (let i = 0; i < SAL * 8; i++) poner(p, i, (sal[i >> 3] >> (7 - (i & 7))) & 1);
    const sig = orden(p.n, semilla.subarray(0, 16));
    const mascara = new DataView(semilla.buffer, semilla.byteOffset + 16, 4).getUint32(0);
    const cab = new Uint8Array(CAB);
    new DataView(cab.buffer).setUint32(0, (sellado.length ^ mascara) >>> 0);
    for (const b of [cab, sellado]) {
      for (let i = 0; i < b.length; i++) for (let k = 7; k >= 0; k--) poner(p, sig(), (b[i] >> k) & 1);
    }
    return sellado.length;
  }

  async function revelar(p, clave) {
    if (p.n <= SAL * 8 + 32) throw new Error('Este archivo es demasiado pequeño');
    const sal = new Uint8Array(SAL);
    for (let i = 0; i < SAL * 8; i++) sal[i >> 3] |= sacar(p, i) << (7 - (i & 7));
    const { aes, semilla } = await Cripto.derivar(clave, sal);
    const sig = orden(p.n, semilla.subarray(0, 16));
    const leer = (n) => {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) { let v = 0; for (let k = 0; k < 8; k++) v = (v << 1) | sacar(p, sig()); out[i] = v; }
      return out;
    };
    const mascara = new DataView(semilla.buffer, semilla.byteOffset + 16, 4).getUint32(0);
    const largo = (new DataView(leer(CAB).buffer).getUint32(0) ^ mascara) >>> 0;
    const malo = 'Contraseña incorrecta o aquí no hay nada oculto';
    if (largo < 28 || largo > capacidad(p.n) + 28) throw new Error(malo);
    try {
      return await Cripto.abrir(aes, leer(largo));
    } catch (e) {
      throw new Error(malo);
    }
  }

  /* ---- imagen ---- */
  async function cargarImagen(file) {
    const bmp = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    g.drawImage(bmp, 0, 0);
    const img = g.getImageData(0, 0, c.width, c.height);
    // Opaca: con transparencia el navegador altera los bits al guardar
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    bmp.close();
    return { tipo: 'imagen', img, canvas: c, g, portador: enImagen(img.data), desc: `${c.width}×${c.height}` };
  }

  function guardarImagen(p) {
    p.g.putImageData(p.img, 0, 0);
    return new Promise((res) => p.canvas.toBlob(res, 'image/png'));
  }

  /* ---- audio ---- */
  function leerWav(buf) {
    const v = new DataView(buf);
    const txt = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
    if (buf.byteLength < 44 || txt(0, 4) !== 'RIFF' || txt(8, 4) !== 'WAVE') return null;
    let o = 12, fmt = null, ini = 0, largo = 0;
    while (o + 8 <= buf.byteLength) {
      const id = txt(o, 4), t = v.getUint32(o + 4, true);
      if (id === 'fmt ') fmt = { f: v.getUint16(o + 8, true), bits: v.getUint16(o + 22, true) };
      if (id === 'data') { ini = o + 8; largo = Math.min(t, buf.byteLength - ini); break; }
      o += 8 + t + (t & 1);
    }
    return fmt && ini && fmt.bits === 16 && (fmt.f === 1 || fmt.f === 0xfffe) ? { ini, largo } : null;
  }

  /* MP3, M4A... el navegador los decodifica y salen como WAV de 16 bits */
  async function aWav(buf) {
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 1, 44100);
    const a = await ctx.decodeAudioData(buf.slice(0));
    const n = a.length, canales = Math.min(2, a.numberOfChannels), datos = n * canales * 2;
    const out = new ArrayBuffer(44 + datos), v = new DataView(out);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + datos, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, canales, true); v.setUint32(24, a.sampleRate, true);
    v.setUint32(28, a.sampleRate * canales * 2, true); v.setUint16(32, canales * 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, datos, true);
    const cs = []; for (let c = 0; c < canales; c++) cs.push(a.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < canales; c++) {
      const s = Math.max(-1, Math.min(1, cs[c][i]));
      v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2;
    }
    return out;
  }

  async function cargarAudio(file) {
    let buf = await file.arrayBuffer();
    let w = leerWav(buf), convertido = false;
    if (!w) {
      buf = await aWav(buf);
      w = leerWav(buf);
      convertido = true;
    }
    const bytes = new Uint8Array(buf);
    return { tipo: 'audio', bytes, portador: enAudio(bytes, w.ini, w.largo), convertido, desc: 'WAV 16 bits' };
  }

  const guardarAudio = (p) => new Blob([p.bytes], { type: 'audio/wav' });
  const esAudio = (f) => /^audio\//.test(f.type) || /\.(wav|mp3|m4a|ogg|flac|opus)$/i.test(f.name);
  const cargar = (f) => (esAudio(f) ? cargarAudio(f) : cargarImagen(f));
  const guardar = async (p) => (p.tipo === 'audio' ? guardarAudio(p) : guardarImagen(p));

  return { cargar, guardar, ocultar, revelar, capacidad };
})();
