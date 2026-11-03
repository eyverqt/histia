/* Histia — interfaz. Sin servidor: cada byte se queda en esta pestaña. */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const E = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BASE = new URL(document.baseURI).pathname.replace(/\/$/, '');
const PAGINAS = ['ocultar', 'nota', 'boveda', 'por-que'];
const TIT = { ocultar: 'Ocultar', nota: 'Nota', boveda: 'Bóveda', 'por-que': 'Por qué' };
const est = { port: null, archivo: null, accion: 'ocultar', secreto: 'texto', dias: 0, bov: null, bovOrig: null, inf: 'duplicados', filtradas: [], largo: 20 };

function toast(t, malo) {
  const n = $('#toast');
  n.textContent = t;
  n.classList.toggle('err', !!malo);
  n.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { n.hidden = true; }, malo ? 5600 : 2600);
}
const peso = (b) => { const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return `${b.toFixed(i && b < 100 ? 1 : 0)} ${u[i]}`; };
function seg(el, v, fn) {
  const pinta = (x) => $$('button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(x))));
  pinta(v);
  el.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { pinta(b.dataset.v); fn(b.dataset.v); } });
}
function bajar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 150);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function copiar(t) { await navigator.clipboard.writeText(t).catch(() => {}); toast('Copiado'); }
function ocupado(btn, si, txt) {
  btn.disabled = si;
  if (si) { btn.dataset.t = btn.textContent; btn.textContent = txt; } else if (btn.dataset.t) btn.textContent = btn.dataset.t;
  $('#barTop').classList.toggle('activa', si);
}
const dejarRespirar = () => new Promise((r) => setTimeout(r, 30));

/* ---- rutas ---- */
function rutaActual() { const p = location.pathname.slice(BASE.length).replace(/^\/+|\/+$/g, ''); return PAGINAS.includes(p) ? p : 'ocultar'; }
function ir(p, empujar = true) {
  $$('.pagina').forEach((s) => { s.hidden = s.dataset.p !== p; });
  $$('#tabs a').forEach((a) => a.classList.toggle('is-active', a.dataset.ir === p));
  $('#logoSub').textContent = TIT[p];
  if (empujar && rutaActual() !== p) history.pushState(null, '', `${BASE}/${p}`);
  window.scrollTo(0, 0);
}

/* ---- ocultar ---- */
function medidas() {
  const cap = est.port ? Oculto.capacidad(est.port.portador.n) : 0;
  const sec = est.secreto === 'texto' ? new TextEncoder().encode($('#secTexto').value).length : (est.archivo ? est.archivo.size : 0);
  $('#stCap').textContent = est.port ? peso(cap) : '—';
  $('#stSec').textContent = sec ? peso(sec) : '—';
  $('#stUso').textContent = est.port && sec ? `${Math.min(999, Math.round(sec / Math.max(1, cap) * 100))}%` : '—';
}
function fuerza() {
  const b = Cripto.bits($('#clave').value);
  $('#fuerza').textContent = b ? `${b} bits · ${b < 50 ? 'débil' : b < 80 ? 'aceptable' : 'fuerte'}` : '';
}
async function cargarPortador(f) {
  $('#dropT').textContent = 'Leyendo';
  try {
    est.port = await Oculto.cargar(f);
    est.port.nombre = f.name;
    $('#dropT').textContent = f.name.length > 28 ? `${f.name.slice(0, 26)}…` : f.name;
    $('#dropS').textContent = `${est.port.desc} · ${peso(f.size)}${est.port.convertido ? ' · sale como WAV' : ''}`;
    medidas();
  } catch (e) {
    est.port = null;
    $('#dropT').textContent = 'Suelta una imagen o audio';
    toast(`No se pudo leer: ${e.message}`, true);
  }
}
function mostrar(html) { $('#resultado').innerHTML = html; }
async function ejecutar() {
  const btn = $('#btnOcultar'), clave = $('#clave').value;
  if (!est.port) { toast('Primero elige una imagen o un audio', true); return; }
  if (!clave) { $('#clave').focus(); toast('Falta la contraseña', true); return; }
  ocupado(btn, true, est.accion === 'ocultar' ? 'Ocultando…' : 'Revelando…');
  await dejarRespirar();
  try {
    if (est.accion === 'ocultar') await hacerOcultar(clave); else await hacerRevelar(clave);
  } catch (e) { toast(e.message, true); } finally { ocupado(btn, false); }
}
async function hacerOcultar(clave) {
  let meta, datos;
  if (est.secreto === 'texto') {
    const t = $('#secTexto').value;
    if (!t) { toast('Escribe el mensaje', true); return; }
    meta = { t: 1 };
    datos = new TextEncoder().encode(t);
  } else {
    if (!est.archivo) { toast('Elige el archivo a esconder', true); return; }
    meta = { n: est.archivo.name, m: est.archivo.type };
    datos = new Uint8Array(await est.archivo.arrayBuffer());
  }
  const t0 = performance.now();
  const ocupa = await Oculto.ocultar(est.port.portador, clave, meta, datos);
  const blob = await Oculto.guardar(est.port);
  const ext = est.port.tipo === 'audio' ? 'wav' : 'png';
  const nombre = `${est.port.nombre.replace(/\.[^.]+$/, '')}-histia.${ext}`;
  bajar(blob, nombre);
  $('#resInfo').textContent = `${((performance.now() - t0) / 1000).toFixed(1)} s`;
  const url = URL.createObjectURL(blob);
  mostrar(`${ext === 'png' ? `<img class="prev" src="${url}" alt="Imagen con el secreto dentro">` : `<audio controls src="${url}"></audio>`}
    <div class="opt"><span>Descargado</span><b>${E(nombre)} · ${peso(blob.size)}</b></div>
    <div class="opt"><span>Dentro</span><b>${peso(ocupa)} cifrados</b></div>
    <p class="nota muted up">Envíalo como archivo o documento. WhatsApp e Instagram recomprimen las imágenes y el secreto se pierde.</p>`);
  // el portador ya lleva el secreto: hay que volver a cargarlo para otro
  est.port = null;
  $('#dropT').textContent = 'Suelta otra imagen o audio';
  $('#dropS').textContent = 'Listo: ya lo tienes en tus descargas';
  medidas();
}
async function hacerRevelar(clave) {
  const { meta, bytes } = await Oculto.revelar(est.port.portador, clave);
  if (meta.t) {
    const texto = new TextDecoder().decode(bytes);
    mostrar(`<pre class="secreto" id="revTexto">${E(texto)}</pre><div class="acts"><button class="btn" type="button" id="btnRevCop">Copiar</button></div>`);
    $('#btnRevCop').addEventListener('click', () => copiar(texto));
  } else {
    bajar(new Blob([bytes], { type: meta.m || 'application/octet-stream' }), meta.n || 'secreto');
    mostrar(`<div class="opt"><span>Archivo recuperado</span><b>${E(meta.n)} · ${peso(bytes.length)}</b></div>`);
  }
  $('#resInfo').textContent = 'Revelado ✓';
}

/* ---- nota ---- */
async function crearNota() {
  const t = $('#notaTexto').value, btn = $('#btnNota');
  if (!t) { $('#notaTexto').focus(); return; }
  ocupado(btn, true, 'Cifrando…');
  await dejarRespirar();
  try {
    const frag = await Cripto.crearNota(t, $('#notaClave').value, Number(est.dias));
    const url = `${location.origin}${BASE}/nota#${frag}`;
    $('#notaTam').textContent = `${url.length} caracteres`;
    $('#notaTitulo').textContent = 'Enlace';
    $('#notaRes').innerHTML = `<pre class="secreto enlace">${E(url)}</pre><div class="acts"><button class="btn" type="button" id="btnNotaCop">Copiar enlace</button></div>${url.length > 8000 ? '<p class="nota red up">Enlace muy largo: algunos chats lo cortan. Usa mejor Ocultar con un archivo.</p>' : ''}`;
    $('#btnNotaCop').addEventListener('click', () => copiar(url));
  } catch (e) { toast(e.message, true); } finally { ocupado(btn, false); }
}
async function abrirNota(frag) {
  ir('nota', false);
  $('#notaCrear').hidden = true;
  $('#notaTitulo').textContent = 'Nota recibida';
  const pide = Cripto.pidePass(frag);
  $('#notaRes').innerHTML = `${pide ? '<label class="field"><input id="notaAbrirClave" type="password" autocomplete="off" placeholder="Contraseña de la nota"></label>' : ''}<div class="acts"><button class="btn" type="button" id="btnAbrirNota">Leer la nota</button><a class="btn ghost-btn" href="nota" data-ir="nota" id="otraNota">Crear otra</a></div>`;
  $('#otraNota').addEventListener('click', () => { $('#notaCrear').hidden = false; $('#notaRes').innerHTML = ''; history.replaceState(null, '', `${BASE}/nota`); });
  $('#btnAbrirNota').addEventListener('click', async (ev) => {
    const b = ev.target;
    ocupado(b, true, 'Abriendo…');
    await dejarRespirar();
    try {
      const n = await Cripto.leerNota(frag, pide ? $('#notaAbrirClave').value : '');
      if (n.exp && Date.now() > n.exp) { toast('Esta nota ya caducó', true); $('#notaRes').innerHTML = '<div class="ghost vacio-g">Caducó<small>Quien la creó le puso fecha de caducidad</small></div>'; return; }
      history.replaceState(null, '', `${BASE}/nota`);    // fuera del historial del navegador
      $('#notaRes').innerHTML = `<pre class="secreto">${E(n.texto)}</pre><div class="acts"><button class="btn" type="button" id="btnNotaCopTxt">Copiar</button></div>`;
      $('#btnNotaCopTxt').addEventListener('click', () => copiar(n.texto));
    } catch (e) { toast(pide ? 'Contraseña incorrecta o enlace dañado' : 'El enlace está dañado o incompleto', true); ocupado(b, false); }
  });
}

/* ---- boveda ---- */
function pintarBoveda() {
  if (!est.bov) return;
  const r = Boveda.informe(est.bov.items);
  est.r = r;
  $('#bsN').textContent = r.total;
  $('#bsD').textContent = r.sobran;
  $('#bsR').textContent = r.repetidas.length;
  $('#btnExactos').disabled = !r.sobran;
  $('#btnRecientes').disabled = !r.conflictos.length;
  $('#btnFiltradas').disabled = $('#btnExportar').disabled = false;
  $('#btnDeshacer').disabled = est.bov === est.bovOrig;
  pintarInforme();
}
const filaLogin = (i) => `${E(i.name || Boveda.sitio(i))} <span class="muted">· ${E(Boveda.usuario(i) || 'sin usuario')}</span>`;
function pintarInforme() {
  const r = est.r;
  if (!r) return;
  const v = est.inf;
  let filas = [];
  if (v === 'duplicados' || v === 'conflictos') filas = r[v].map((g) => `<li><b>${E(Boveda.sitio(g[0]))}</b><small>${E(Boveda.usuario(g[0]) || 'sin usuario')} · ${g.length} entradas${v === 'conflictos' ? ` · ${new Set(g.map(Boveda.clave)).size} contraseñas distintas` : ''}</small></li>`);
  if (v === 'repetidas') filas = r.repetidas.map((g) => `<li><b>${g.length} sitios con la misma contraseña</b><small>${E([...new Set(g.map(Boveda.sitio))].slice(0, 6).join(' · '))}</small></li>`);
  if (v === 'debiles') filas = r.debiles.map((i) => `<li><b>${filaLogin(i)}</b><small>${Cripto.bits(Boveda.clave(i))} bits aprox.</small></li>`);
  if (v === 'http') filas = r.http.map((i) => `<li><b>${filaLogin(i)}</b><small>Guardada con http://</small></li>`);
  if (v === 'filtradas') filas = est.filtradas.map((f) => `<li><b>${filaLogin(f.i)}</b><small>Vista ${f.n.toLocaleString('es')} veces en filtraciones</small></li>`);
  $('#informe').innerHTML = filas.slice(0, 300).join('');
  $('#infHint').textContent = `${filas.length} ${filas.length === 1 ? 'caso' : 'casos'}`;
  $('#infVacio').hidden = filas.length > 0;
  $('#infVacio').innerHTML = `${filas.length ? '' : 'Limpio'}<small>${v === 'filtradas' && !est.filtradas.length ? 'Pulsa Buscar filtraciones' : 'Nada que revisar aquí'}</small>`;
}
async function cargarBoveda(lista) {
  const files = [...lista];         // el input se vacia al momento
  try {
    const leidos = await Promise.all([...files].map(async (f) => JSON.parse(await f.text())));
    est.bov = est.bovOrig = Boveda.unir(leidos);
    est.filtradas = [];
    $('#bovArch').textContent = [...files].map((f) => f.name).join(' · ');
    pintarBoveda();
  } catch (e) { toast(e instanceof SyntaxError ? 'Ese archivo no es un JSON válido' : e.message, true); }
}
function aplicar(gruposQuitar) {
  est.bov = { folders: est.bov.folders, items: Boveda.resolver(est.bov.items, gruposQuitar) };
  pintarBoveda();
}
async function buscarFiltradas() {
  const b = $('#btnFiltradas'), porClave = new Map();
  for (const i of est.bov.items) if (i.type === 1 && Boveda.clave(i)) { const k = Boveda.clave(i); if (!porClave.has(k)) porClave.set(k, []); porClave.get(k).push(i); }
  const claves = [...porClave.keys()];
  est.filtradas = [];
  b.disabled = true;
  try {
    let hechas = 0;
    const lote = async () => {
      while (claves.length) {
        const k = claves.pop();
        const n = await Cripto.filtrada(k);
        if (n) porClave.get(k).forEach((i) => est.filtradas.push({ i, n }));
        b.textContent = `${++hechas} de ${porClave.size}`;
      }
    };
    await Promise.all([lote(), lote(), lote(), lote()]);
    est.filtradas.sort((x, y) => y.n - x.n);
    toast(`${est.filtradas.length} entradas aparecen en filtraciones`, est.filtradas.length > 0);
  } catch (e) { toast(`No se pudo consultar: ${e.message}`, true); }
  b.textContent = 'Buscar filtraciones';
  b.disabled = false;
  est.inf = 'filtradas';
  $$('#segInf button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === 'filtradas')));
  pintarInforme();
}
function generar() {
  const p = Cripto.generar(est.largo);
  $('#genOut').value = p;
  $('#genBits').textContent = `${Cripto.bits(p)} bits`;
}

/* ---- textos ---- */
const VS = [
  ['Histia', 'Tres herramientas en una. <em>Sin servidor, sin cuenta, sin rastreadores</em> y funciona sin conexión una vez abierta. Gratis y de código abierto.', true],
  ['PrivateBin / 0bin', 'Notas cifradas, pero <em>alguien tiene que mantener un servidor</em>. Histia mete la nota cifrada en el propio enlace, a cambio de no poder borrarla a distancia.'],
  ['Bitwarden Send', 'Cómodo y con autodestrucción, pero <em>necesita cuenta y pasa por sus servidores</em>.'],
  ['Bitwarden', 'Tras años de peticiones, <em>no tiene limpieza automática de duplicados</em>. Histia los detecta, une sus URLs y notas y te devuelve un JSON para importar.'],
  ['Scripts de limpieza', 'Hay varios en GitHub, pero <em>hay que instalar Python y confiarles tus contraseñas</em>. Aquí está el código a la vista y la CSP bloquea cualquier envío.'],
  ['Webs de esteganografía', 'Muchas solo guardan texto y escriben los bits en orden, <em>fáciles de detectar</em>. Histia esconde archivos y reparte los bits al azar.'],
];
const COMO = [
  ['Cifrado', 'AES-256-GCM con la WebCrypto del navegador. <em>PBKDF2-SHA256 con 600.000 iteraciones</em>, lo que recomienda OWASP.'],
  ['Sin marca', 'Lo oculto no lleva firma reconocible: <em>el orden de los bits sale de tu contraseña</em> y la longitud va enmascarada.'],
  ['Sin salida', 'Una Content-Security-Policy impide a la página conectarse a nada <em>salvo Have I Been Pwned</em>, y eso solo si pulsas el botón.'],
  ['Sus límites', '<em>Esto no es invisible para un análisis forense serio</em>: la estadística de una imagen cambia si la llenas. Usa menos del 25 % de la capacidad. Y nadie ha auditado este código.'],
];
const pintarLista = (el, f) => { el.innerHTML = f.map(([n, t, yo]) => `<li${yo ? ' class="yo"' : ''}><b>${n}</b><span>${t}</span></li>`).join(''); };

/* ---- arranque ---- */
function soltar(zona, fn) {
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('over'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('over'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('over'); if (e.dataTransfer.files.length) fn(e.dataTransfer.files); });
}
function enganchar() {
  document.addEventListener('click', (e) => { const a = e.target.closest('[data-ir]'); if (a && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ir(a.dataset.ir); } });
  window.addEventListener('popstate', () => ir(rutaActual(), false));
  seg($('#segAccion'), 'ocultar', (v) => {
    est.accion = v;
    $('#pasoSecreto').hidden = v === 'revelar';
    $('#btnOcultar').textContent = v === 'ocultar' ? 'Ocultar' : 'Revelar';
    $('#pasoClave').textContent = v === 'ocultar' ? '03 · Contraseña' : '02 · Contraseña';
    $('#clave').placeholder = v === 'ocultar' ? 'Sin ella nadie podrá leerlo. No se puede recuperar' : 'La contraseña con la que se ocultó';
  });
  seg($('#segSecreto'), 'texto', (v) => { est.secreto = v; $('#secTexto').hidden = v !== 'texto'; $('#secArchivo').hidden = v === 'texto'; medidas(); });
  seg($('#segCad'), '0', (v) => { est.dias = v; });
  seg($('#segInf'), 'duplicados', (v) => { est.inf = v; pintarInforme(); });
  seg($('#segLargo'), '20', (v) => { est.largo = Number(v); generar(); });
  $('#dropPort').addEventListener('click', () => $('#filePort').click());
  $('#filePort').addEventListener('change', (e) => { if (e.target.files[0]) cargarPortador(e.target.files[0]); e.target.value = ''; });
  soltar($('#dropPort'), (f) => cargarPortador(f[0]));
  $('#btnSec').addEventListener('click', () => $('#fileSec').click());
  $('#fileSec').addEventListener('change', (e) => { est.archivo = e.target.files[0] || null; if (est.archivo) { $('#btnSec').textContent = est.archivo.name.slice(0, 40); $('#secInfo').textContent = peso(est.archivo.size); } medidas(); });
  $('#secTexto').addEventListener('input', medidas);
  $('#clave').addEventListener('input', fuerza);
  $('#btnOcultar').addEventListener('click', ejecutar);
  $('#btnNota').addEventListener('click', crearNota);
  $('#dropBov').addEventListener('click', () => $('#fileBov').click());
  $('#fileBov').addEventListener('change', (e) => { if (e.target.files.length) cargarBoveda(e.target.files); e.target.value = ''; });
  soltar($('#dropBov'), cargarBoveda);
  $('#btnExactos').addEventListener('click', () => aplicar(est.r.duplicados));
  $('#btnRecientes').addEventListener('click', () => aplicar(est.r.conflictos));
  $('#btnDeshacer').addEventListener('click', () => { est.bov = est.bovOrig; pintarBoveda(); });
  $('#btnExportar').addEventListener('click', () => bajar(new Blob([Boveda.exportar(est.bov)], { type: 'application/json' }), 'bitwarden-limpia.json'));
  $('#btnFiltradas').addEventListener('click', buscarFiltradas);
  $('#btnGen').addEventListener('click', generar);
  $('#btnGenCop').addEventListener('click', () => copiar($('#genOut').value));
}
pintarLista($('#vs'), VS);
pintarLista($('#comoP'), COMO);
enganchar();
generar();
ir(rutaActual(), false);
if (location.hash.length > 3 && rutaActual() === 'nota') abrirNota(location.hash.slice(1));
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
