/* Histia — limpieza de exportaciones de Bitwarden. Nada se guarda ni se envia:
   las contraseñas solo viven en esta variable hasta cerrar la pestaña. */
'use strict';

const Boveda = (() => {
  const CC = /\.(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/;

  function dominio(uri) {
    if (!uri) return '';
    if (/^androidapp:/.test(uri)) return uri;
    try {
      const h = new URL(/:\/\//.test(uri) ? uri : `https://${uri}`).hostname.toLowerCase();
      if (/^[\d.]+$/.test(h) || !h.includes('.')) return h;
      return h.split('.').slice(CC.test(h) ? -3 : -2).join('.');
    } catch (e) { return uri.toLowerCase(); }
  }

  const uris = (it) => (it.login && it.login.uris || []).map((u) => u.uri).filter(Boolean);
  const clave = (it) => (it.login && it.login.password) || '';
  const usuario = (it) => ((it.login && it.login.username) || '').trim().toLowerCase();
  const fecha = (it) => Date.parse(it.revisionDate || 0) || 0;
  const sitio = (it) => dominio(uris(it)[0]) || (it.name || '').trim().toLowerCase();

  /* Une exportaciones: las carpetas se conservan por nombre. */
  function unir(archivos) {
    const carpetas = new Map(), items = [];
    for (const a of archivos) {
      if (a.encrypted) throw new Error('Esa exportación está cifrada. En Bitwarden elige el formato JSON sin cifrar');
      if (!Array.isArray(a.items)) throw new Error('No parece una exportación de Bitwarden');
      const mapa = new Map();
      for (const c of a.folders || []) {
        const k = (c.name || '').trim();
        if (!carpetas.has(k)) carpetas.set(k, c);
        mapa.set(c.id, carpetas.get(k).id);
      }
      for (const it of a.items) items.push({ ...it, folderId: it.folderId ? mapa.get(it.folderId) || it.folderId : it.folderId });
    }
    return { folders: [...carpetas.values()], items };
  }

  const logins = (items) => items.filter((i) => i.type === 1 && i.login);

  function grupos(items, fn) {
    const m = new Map();
    for (const it of items) {
      const k = fn(it);
      if (!k) continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(it);
    }
    return [...m.values()].filter((g) => g.length > 1);
  }

  /* Exacto: mismo sitio, usuario y contraseña. Conflicto: mismo sitio y usuario, otra contraseña. */
  function informe(items) {
    const ls = logins(items);
    const mismos = grupos(ls, (i) => (sitio(i) && usuario(i) ? `${sitio(i)}\n${usuario(i)}` : ''));
    const duplicados = [], conflictos = [];
    for (const g of mismos) {
      const porClave = grupos(g, clave);
      duplicados.push(...porClave);
      if (new Set(g.map(clave)).size > 1) conflictos.push(g);
    }
    const repetidas = grupos(ls, clave).filter((g) => new Set(g.map(sitio)).size > 1);
    return {
      total: items.length, duplicados, conflictos, repetidas,
      debiles: ls.filter((i) => clave(i) && Cripto.bits(clave(i)) < 50),
      http: ls.filter((i) => uris(i).some((u) => /^http:\/\//i.test(u) && !/localhost|127\.0\.0\.1|192\.168\./.test(u))),
      sobran: duplicados.reduce((n, g) => n + g.length - 1, 0),
    };
  }

  /* Conserva la mas reciente de cada grupo; une sus URLs y notas para no perder nada. */
  function resolver(items, gruposQuitar) {
    const fuera = new Set();
    const nuevos = new Map();
    for (const g of gruposQuitar) {
      const orden = [...g].sort((a, b) => fecha(b) - fecha(a));
      const vivo = { ...orden[0], login: { ...orden[0].login } };
      const vistas = new Set(uris(vivo));
      const lista = [...(vivo.login.uris || [])];
      const notas = vivo.notes ? [vivo.notes] : [];
      for (const o of orden.slice(1)) {
        for (const u of o.login.uris || []) if (u.uri && !vistas.has(u.uri)) { vistas.add(u.uri); lista.push(u); }
        if (o.notes && !notas.includes(o.notes)) notas.push(o.notes);
        fuera.add(o);
      }
      vivo.login.uris = lista;
      if (notas.length) vivo.notes = notas.join('\n\n');
      nuevos.set(orden[0], vivo);
    }
    return items.filter((i) => !fuera.has(i)).map((i) => nuevos.get(i) || i);
  }

  const exportar = (b) => JSON.stringify({ encrypted: false, folders: b.folders, items: b.items }, null, 2);

  return { unir, informe, resolver, exportar, sitio, usuario, clave };
})();
