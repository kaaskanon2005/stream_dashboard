// Stream Dashboard — logica. De streamers staan in streamers.ini (ingelezen door loader.js).

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);

// ===== Config inlezen =====
// Twitch-link of -naam -> login ("https://www.twitch.tv/Naam" -> "naam")
function twitchLogin(s) {
  s = String(s || '').trim();
  const m = s.match(/twitch\.tv\/(?:popout\/)?(\w+)/i);
  const login = (m ? m[1] : s.replace(/^@/, '')).toLowerCase();
  return /^\w+$/.test(login) ? login : null;
}
// YouTube-link, @handle of kanaal-ID -> kanaalpad ("channel/UC…", "@naam", "c/naam" of "user/naam")
function youtubePath(s) {
  s = String(s || '').trim();
  if (!s) return null;
  let m = s.match(/(UC[\w-]{22})(?![\w-])/);
  if (m) return 'channel/' + m[1];
  m = s.match(/youtube\.com\/(@[\w.-]+|c\/[\w.-]+|user\/[\w.-]+)/i);
  if (m) return m[1];
  m = s.match(/^@?([\w.-]+)$/);
  return m ? '@' + m[1] : null;
}
const GROUPS = CONFIG.groups || {};
const C = [];
for (const s of CONFIG.streamers || []) {
  const tw = twitchLogin(s.twitch), yt = youtubePath(s.youtube);
  if (!tw && !yt) { console.warn('streamers.ini: streamer overgeslagen (geen geldige Twitch- of YouTube-link):', s); continue; }
  let id = tw || yt.replace(/\W/g, '').toLowerCase();
  while (C.some(c => c.id === id)) id += '_';
  const ch = yt?.startsWith('channel/') ? yt.slice(8) : null;
  // Zonder eigen naam: de naam uit de link (Twitch zet hem later om naar de officiële schrijfwijze)
  const name = s.name || tw || (ch ? 'YouTube ' + ch.slice(0, 8) + '…' : yt.replace(/^(@|c\/|user\/)/, ''));
  C.push({ name, auto: !s.name, id, tw, yt, ch, group: GROUPS[s.group] ? s.group : null });
}

const hasTwitch = c => !!c.tw;

// ===== Opslag (localStorage) =====
// Met de titel als voorvoegsel, zodat twee dashboards op dezelfde localhost-poort elkaar niet overschrijven
const PREFIX = (CONFIG.title || 'dashboard') + ':';
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(PREFIX + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} }
};

// ===== Staat =====
let selected = new Set(store.get('sel', []));                     // geselecteerde streamers; de volgorde is de volgorde op de wall
let focus = new Set([].concat(store.get('focus', []) ?? []));     // grote streams (meerdere mogelijk)
let filter = 'all';
let audio = new Set();     // streams met geluid aan (niet bewaard: browsers blokkeren geluid bij autoplay)
const tiles = {};          // id -> { el, player, ... }
const plat = store.get('plat', {});      // id -> 'twitch' | 'youtube' (door jou gekozen platform)
const ytsrc = store.get('ytsrc', {});    // id -> { v: videoId } of { ch: kanaalId } (door jou ingevuld)
const twLive = {};         // id -> aantal kijkers op Twitch (alleen als live)
const ytLive = {};         // id -> { v: videoId, n: kijkers } op YouTube (alleen als live)
let ytKnown = false;       // true als de YouTube-status via server.py opgehaald kon worden

const save = () => { store.set('sel', [...selected]); store.set('focus', [...focus]); };
const isLive = c => twLive[c.id] != null || !!ytLive[c.id];
const viewers = c => (twLive[c.id] ?? 0) + (ytLive[c.id]?.n ?? 0);
// Platform: jouw keuze gaat voor. Anders Twitch, behalve als de streamer alleen op YouTube live is.
function platOf(c) {
  if (!hasTwitch(c)) return 'youtube';
  if (!c.yt) return 'twitch';
  if (plat[c.id]) return plat[c.id];
  return ytLive[c.id] && twLive[c.id] == null ? 'youtube' : 'twitch';
}
// Welke YouTube-bron: de stream die nu live is, anders jouw link, anders de live-stream van het kanaal
// (dat laatste alleen als de live-status onbekend is en we het kanaal-ID kennen)
const ytSrcOf = c => ytLive[c.id] ? { v: ytLive[c.id].v } : ytsrc[c.id] || (!ytKnown && c.ch ? { ch: c.ch } : null);
// Verandert dit, dan moet de speler opnieuw laden
const srcKey = c => platOf(c) === 'twitch' ? 'tw' : 'yt:' + JSON.stringify(ytSrcOf(c));
const ytUrl = c => `https://www.youtube.com/${c.yt}`;
// Kleur: die van de groep, anders die van het platform
const colorOf = c => GROUPS[c.group] || (platOf(c) === 'twitch' ? 'var(--twitch)' : 'var(--youtube)');
const fmtViewers = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : String(n);

// ===== YouTube =====
// YouTube-link, video-ID of kanaal-ID (UC…) -> { v } of { ch }
function parseYt(s) {
  s = (s || '').trim();
  let m = s.match(/(?:[?&]v=|youtu\.be\/|\/live\/|\/embed\/)([\w-]{11})(?![\w-])/);
  if (m) return { v: m[1] };
  m = s.match(/(UC[\w-]{22})(?![\w-])/);
  if (m) return { ch: m[1] };
  return /^[\w-]{11}$/.test(s) ? { v: s } : null;
}
function ytEmbed(src) {
  const q = `autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  return src.v ? `https://www.youtube.com/embed/${src.v}?${q}`
               : `https://www.youtube.com/embed/live_stream?channel=${src.ch}&${q}`;
}

// ===== Live-status =====
// Twitch: alle streamers in één verzoek via de publieke webclient van Twitch (geen eigen API-sleutel nodig).
async function refreshTwitch() {
  const list = C.filter(hasTwitch);
  if (!list.length) return;
  const r = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' },
    body: JSON.stringify({ query: `query{users(logins:${JSON.stringify(list.map(c => c.tw))}){login displayName stream{viewersCount}}}` })
  });
  const users = (await r.json()).data.users;
  for (const k of Object.keys(twLive)) delete twLive[k];
  list.forEach((c, i) => {
    if (users[i]?.stream) twLive[c.id] = users[i].stream.viewersCount;
    if (c.auto && users[i]?.displayName) c.name = users[i].displayName;
  });
}
// YouTube: via server.py (de browser mag YouTube niet zelf uitlezen). Zonder server.py geen YouTube-status.
async function refreshYoutube() {
  const list = C.filter(c => c.yt);
  if (!list.length) return;
  const r = await fetch('/api/yt-live?ch=' + list.map(c => encodeURIComponent(c.yt)).join(','));
  if (!r.ok) throw new Error();
  const data = await r.json();
  for (const k of Object.keys(ytLive)) delete ytLive[k];
  for (const c of list) if (data[c.yt]) ytLive[c.id] = data[c.yt];
  ytKnown = true;
}
async function refreshLive() {
  const [tw, yt] = await Promise.allSettled([refreshTwitch(), refreshYoutube()]);
  const n = C.filter(isLive).length;
  const missing = [tw.status === 'rejected' && 'Twitch', yt.status === 'rejected' && 'YouTube'].filter(Boolean);
  $('#livecount').textContent = `${n} live` + (missing.length ? ` (${missing.join(' en ')}-status niet beschikbaar)` : '');
  renderList();
  // Streams die van platform of video wisselen (bijv. streamer gaat live op YouTube) opnieuw laden
  for (const t of Object.values(tiles)) if (t.key !== srcKey(t.c)) t.restart();
  renderWall();
}

// ===== Streamer-lijst =====
function renderList() {
  if (!C.length) {
    $('#list').innerHTML = '<div class="empty">Nog geen streamers.<br>Zet de links in <b>streamers.ini</b> en ververs de pagina.</div>';
    return;
  }
  const q = $('#q').value.trim().toLowerCase();
  const matches = c =>
    filter === 'all' ? true :
    filter === 'sel' ? selected.has(c.id) :
    filter === 'live' ? isLive(c) :
    c.group === filter;
  const rows = C.filter(c => (!q || c.name.toLowerCase().includes(q) || c.id.includes(q)) && matches(c));

  $('#list').innerHTML = rows.map(c => {
    const where = [twLive[c.id] != null && 'Twitch', ytLive[c.id] && 'YouTube'].filter(Boolean).join(' + ');
    return `
    <div class="row" data-l="${c.id}">
      <input type="checkbox" ${selected.has(c.id) ? 'checked' : ''} tabindex="-1">
      <span class="livedot ${isLive(c) ? 'on' : ''}" title="${isLive(c) ? `Live op ${where} · ${viewers(c)} kijkers` : 'Offline'}"></span>
      <span class="dot" style="background:${colorOf(c)}" title="${c.group ? esc(c.group) + ' · ' : ''}via ${platOf(c) === 'twitch' ? 'Twitch' : 'YouTube'}"></span>
      <span class="nm">${esc(c.name)}</span>
      <span class="vw">${isLive(c) ? fmtViewers(viewers(c)) : ''}</span>
      ${ytLive[c.id] ? '<span class="tag yt">YouTube</span>' : ''}
      ${twLive[c.id] != null ? '<span class="tag tw">Twitch</span>' : ''}
      <a href="${platOf(c) === 'twitch' ? `https://www.twitch.tv/${c.tw}` : ytUrl(c)}" target="_blank" rel="noopener" title="Open kanaal">↗</a>
    </div>`;
  }).join('') || '<div class="empty">Geen resultaten</div>';
  $('#list')._rows = rows;
}

// ===== Wall =====
function renderWall() {
  const wall = $('#wall');
  const byId = Object.fromEntries(C.map(c => [c.id, c]));
  const chosen = [...selected].map(l => byId[l]).filter(Boolean);   // volgorde = jouw volgorde (sleepbaar)
  for (const l of [...focus]) if (!selected.has(l)) focus.delete(l);
  for (const l of [...audio]) if (!selected.has(l)) audio.delete(l);
  $('#count').textContent = chosen.length > 9 ? `⚠ ${chosen.length} streams tegelijk is zwaar voor je pc` : (chosen.length ? `${chosen.length} streams` : '');

  // tegels van gedeselecteerde streamers weghalen
  for (const l of Object.keys(tiles)) if (!selected.has(l)) { tiles[l].el.remove(); delete tiles[l]; }
  // nieuwe tegels toevoegen (bestaande blijven staan, zodat ze niet herladen)
  for (const c of chosen) {
    if (!tiles[c.id]) { tiles[c.id] = makeTile(c); wall.appendChild(tiles[c.id].el); }
  }
  applyOrder();

  const empty = $('#empty');
  if (!chosen.length) {
    if (!empty) wall.insertAdjacentHTML('beforeend', '<div class="empty" id="empty"><b>Nog geen streams gekozen.</b><br>' + (C.length ? 'Vink streamers aan in de lijst links om ze hier te bekijken.' : 'Zet eerst links in <b>streamers.ini</b>.') + '</div>');
  } else empty?.remove();

  const showChat = $('#chat').checked;
  for (const c of chosen) {
    const t = tiles[c.id], isF = focus.has(c.id), on = audio.has(c.id);
    const yt = platOf(c) === 'youtube';
    t.el.classList.toggle('focus', isF);
    t.el.classList.toggle('audio', on);
    t.el.style.setProperty('--c', colorOf(c));
    t.el.querySelector('.tn').textContent = c.name;
    // Chat: Twitch-chat, of YouTube-chat als we weten welke video live is
    const chatSrc = !yt ? `https://www.twitch.tv/embed/${c.tw}/chat?parent=${location.hostname}&darkpopout`
      : ytLive[c.id] ? `https://www.youtube.com/live_chat?v=${ytLive[c.id].v}&embed_domain=${location.hostname}&dark_theme=1` : '';
    const withChat = isF && showChat && !!chatSrc;
    t.el.classList.toggle('withchat', withChat);
    if (withChat && t.chat.dataset.src !== chatSrc) {
      t.chat.innerHTML = `<iframe src="${chatSrc}"></iframe>`;
      t.chat.dataset.src = chatSrc;
    } else if (!withChat && t.chat.firstChild) { t.chat.innerHTML = ''; t.chat.dataset.src = ''; }   // verborgen chat niet op de achtergrond laten draaien
    t.btnPlat.textContent = yt ? 'Twitch' : 'YouTube';
    t.btnYt.hidden = !yt;
    t.btnSnd.textContent = on ? '🔊' : '🔇';
    t.btnSnd.classList.toggle('act', on);
    t.btnZoom.textContent = isF ? '⤡ Terug' : '⤢ Groot';
    // Alleen aanroepen als de stand echt verandert: een overbodige setMuted kan Twitch laten pauzeren
    if (t.ready && t.muted === on) {
      t.muted = !on;
      t.player.setMuted(!on);
      if (on && !t.hold) setTimeout(() => t.player.play(), 200);   // geluid aanzetten mag een stream niet stoppen
    }
  }
}

// Volgorde via CSS "order": een iframe verplaatsen in de DOM laadt de stream opnieuw, dit niet
function applyOrder() {
  [...selected].forEach((l, i) => { if (tiles[l]) tiles[l].el.style.order = i; });
}

let nextStart = 0;   // tijdstip waarop de volgende nieuwe stream mag starten
function makeTile(c) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.dataset.l = c.id;
  el.innerHTML = `
    <div class="top" draggable="true" title="Sleep om te verplaatsen">
      <span class="tn">${esc(c.name)}</span>
      <button data-a="solo" title="Alleen deze stream met geluid (rest gedempt)">🎧 Alleen deze</button>
      <button data-a="zoom" title="Groot maken (je kunt er meerdere tegelijk groot maken)">⤢ Groot</button>
    </div>
    <div class="body">
      <div class="bar"><span class="t"></span><!-- lege ruimte: duwt de knoppen naar rechts -->
        <button data-a="snd" title="Geluid aan/uit voor deze stream">🔇</button>
        <button data-a="plat" title="Wissel tussen Twitch en YouTube" ${hasTwitch(c) && c.yt ? '' : 'hidden'}>YouTube</button>
        <button data-a="ytset" title="YouTube-link aanpassen" hidden>🔗</button>
        <button data-a="pp" title="Afspelen / pauzeren">⏸</button>
        <button data-a="fs" title="Volledig scherm">⛶</button>
        <button data-a="rm" title="Verwijderen">✕</button>
      </div>
      <div class="pl"></div><div class="ch"></div>
    </div>`;
  const pl = el.querySelector('.pl');
  const id = 'p_' + c.id;
  pl.id = id;
  const t = {
    c, el, pl, chat: el.querySelector('.ch'), ready: false, muted: true,
    btnSnd: el.querySelector('[data-a=snd]'), btnZoom: el.querySelector('[data-a=zoom]'),
    btnPlat: el.querySelector('[data-a=plat]'), btnYt: el.querySelector('[data-a=ytset]')
  };
  const applyState = () => { t.ready = true; t.muted = !audio.has(c.id); t.player.setMuted(t.muted); if (t.hold) t.player.pause(); };

  function startYt() {
    const src = ytSrcOf(c);
    if (!src) {
      pl.innerHTML = `<div class="ytempty"><b>${esc(c.name)} is nu niet live op YouTube</b>
        <span>${ytKnown ? `Zodra ${esc(c.name)} live gaat, verschijnt de stream hier vanzelf. ` : 'De YouTube-live-status werkt alleen met server.py. '}Je kunt ook zelf een link plakken.</span>
        <button data-a="ytset">YouTube-link invullen</button>
        <a href="${ytUrl(c)}" target="_blank" rel="noopener">Open het YouTube-kanaal ↗</a></div>`;
      return;
    }
    pl.innerHTML = `<iframe allow="autoplay; encrypted-media; fullscreen" allowfullscreen src="${ytEmbed(src)}"></iframe>`;
    const f = pl.querySelector('iframe');
    const cmd = func => f.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args: [] }), '*');
    // Zelfde bediening als de Twitch-speler, zodat de rest van het dashboard er niets van merkt
    t.player = { setMuted: m => cmd(m ? 'mute' : 'unMute'), play: () => cmd('playVideo'), pause: () => cmd('pauseVideo'), isPaused: () => false };
    f.addEventListener('load', () => {
      f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
      setTimeout(applyState, 800);
    });
  }

  t.start = () => {
    if (t.player) return;
    t.ready = false; t.muted = true;
    t.key = srcKey(c);
    if (platOf(c) === 'youtube') return startYt();
    // Zonder allow="autoplay" blokkeert de browser play() vanuit onze knoppen
    // (die komen niet "van een klik" bij Twitch aan), dus zetten we dat tijdelijk op elke nieuwe iframe.
    const mk = document.createElement;
    document.createElement = function (n, ...a) {
      const e = mk.call(this, n, ...a);
      if (String(n).toLowerCase() === 'iframe') e.allow = 'autoplay; fullscreen';
      return e;
    };
    try { t.player = new Twitch.Player(id, { channel: c.tw, parent: [location.hostname], muted: true, autoplay: true, width: '100%', height: '100%' }); }
    finally { document.createElement = mk; }
    t.player.addEventListener(Twitch.Player.READY, applyState);
  };
  t.restart = () => { t.player = null; t.ready = false; t.muted = true; pl.innerHTML = ''; t.chat.innerHTML = ''; t.chat.dataset.src = ''; t.start(); };

  // Streams kort na elkaar starten (niet allemaal tegelijk, dat is zwaar)
  const at = Math.max(Date.now(), nextStart);
  nextStart = at + 250;
  t.key = srcKey(c);
  setTimeout(() => { if (tiles[c.id] === t) t.start(); }, at - Date.now());
  return t;
}

// hold = door jou gepauzeerd; de auto-hervatting slaat die streams over
function setHold(t, hold) {
  t.hold = hold;
  t.el.querySelector('[data-a=pp]').textContent = hold ? '▶' : '⏸';
  t.el.classList.toggle('held', hold);
  if (t.ready) hold ? t.player.pause() : t.player.play();
}

function apply() { save(); renderList(); renderWall(); }

// ===== Events: lijst =====
$('#list').addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const row = e.target.closest('.row'); if (!row) return;
  const l = row.dataset.l;
  selected.has(l) ? selected.delete(l) : selected.add(l);
  apply();
});
$('#q').addEventListener('input', renderList);
$('#chips').addEventListener('click', e => {
  const c = e.target.closest('.chip'); if (!c) return;
  filter = c.dataset.d;
  document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
  renderList();
});
$('#selVisible').onclick = () => { ($('#list')._rows || []).forEach(c => selected.add(c.id)); apply(); };
$('#unselVisible').onclick = () => { ($('#list')._rows || []).forEach(c => selected.delete(c.id)); apply(); };

// ===== Events: tegels =====
$('#wall').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const l = b.closest('.tile').dataset.l, a = b.dataset.a;
  const t = tiles[l];
  if (a === 'rm') { selected.delete(l); focus.delete(l); }
  else if (a === 'zoom') focus.has(l) ? focus.delete(l) : focus.add(l);
  else if (a === 'snd') audio.has(l) ? audio.delete(l) : audio.add(l);
  else if (a === 'solo') audio = new Set([l]);
  else if (a === 'pp') setHold(t, !t.hold);
  else if (a === 'fs') { t.el.requestFullscreen?.(); return; }
  else if (a === 'plat') {
    plat[l] = platOf(t.c) === 'youtube' ? 'twitch' : 'youtube';
    store.set('plat', plat);
    t.restart();
  }
  else if (a === 'ytset') {
    const v = prompt(`Plak de link van de YouTube-livestream van ${t.c.name} (of het kanaal-ID dat met UC begint).\nTip: open "${t.c.name}" op YouTube tijdens de stream en kopieer de link uit de adresbalk.`);
    if (v === null) return;
    const p = parseYt(v);
    if (!p) { alert('Die link of dat ID herken ik niet.'); return; }
    ytsrc[l] = p; store.set('ytsrc', ytsrc);
    t.restart();
  }
  apply();
});

// Streams slepen aan de balk bovenaan: de tegel waar je overheen sleept neemt jouw plek in
let dragL = null;
let lastOver = null;   // tegel waarmee we het laatst gewisseld hebben: pas opnieuw wisselen als je een andere tegel raakt
$('#wall').addEventListener('dragstart', e => {
  const top = e.target.closest?.('.top'); if (!top) return;
  const tile = top.closest('.tile');
  dragL = tile.dataset.l;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragL);
  e.dataTransfer.setDragImage(tile, 20, 10);
  $('#wall').classList.add('dragging');
  setTimeout(() => tile.classList.add('dragged'), 0);
});
$('#wall').addEventListener('dragover', e => {
  if (!dragL) return;
  e.preventDefault();
  const over = e.target.closest?.('.tile');
  if (!over || over.dataset.l === dragL || over.dataset.l === lastOver) return;
  // Zonder deze check wisselen een grote en een kleine tegel eindeloos heen en weer onder de muis
  lastOver = over.dataset.l;
  const order = [...selected];
  const from = order.indexOf(dragL), to = order.indexOf(over.dataset.l);
  order.splice(from, 1);
  order.splice(to, 0, dragL);
  selected = new Set(order);
  applyOrder();
});
$('#wall').addEventListener('drop', e => { if (dragL) e.preventDefault(); });
$('#wall').addEventListener('dragend', () => {
  if (!dragL) return;
  tiles[dragL]?.el.classList.remove('dragged');
  $('#wall').classList.remove('dragging');
  dragL = null; lastOver = null; save(); renderList();
});

// Twitch pauzeert streams op een tabblad op de achtergrond: bij terugkomen weer afspelen
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;   // het event komt ook bij weggaan
  for (const t of Object.values(tiles)) if (t.ready && !t.hold) t.player.play();
});

// ===== Events: header =====
// Twitch laat zich alleen via zijn eigen API aansturen (een echte klik in de speler kan een pagina niet nabootsen).
// "Alles afspelen" geeft daarom elke stream het afspeel-commando en blijft ~10 sec proberen
// voor streams die nog laden of terugvallen op pauze.
$('#playAll').onclick = () => {
  const all = Object.values(tiles);
  all.forEach(t => { t.hold = false; t.el.classList.remove('held'); t.el.querySelector('[data-a=pp]').textContent = '⏸'; });
  let n = 0;
  const tick = () => {
    // Tegels zonder speler (YouTube die niet live is) tellen niet mee, anders wacht de knop 10 sec voor niets
    const waiting = all.filter(t => tiles[t.c.id] === t && !t.hold && t.player && (!t.ready || t.player.isPaused()));
    all.forEach(t => { if (t.ready && !t.hold) t.player.play(); });
    const still = all.filter(t => tiles[t.c.id] === t && !t.hold && t.ready && t.player.isPaused()).length;
    $('#playAll').textContent = waiting.length && n < 14 ? `▶ Bezig… (${waiting.length})` : '▶ Alles afspelen';
    if (waiting.length && ++n <= 14) setTimeout(tick, 700);
    else if (still) $('#count').textContent = `${still} stream(s) wachten op een klik op Twitch's eigen ▶`;
  };
  tick();
};
$('#pauseAll').onclick = () => Object.values(tiles).forEach(t => setHold(t, true));
$('#muteAll').onclick = () => { audio.clear(); renderWall(); };

$('#selLive').onclick = () => {
  const live = C.filter(isLive);
  if (!live.length) { $('#count').textContent = 'Er is nu niemand live'; return; }
  if (live.length > 12 && !confirm(`Alle ${live.length} live streams openen? Dat is zwaar voor je pc.`)) return;
  selected = new Set(live.map(c => c.id));
  focus.clear(); apply();
};
$('#clear').onclick = () => { selected.clear(); focus.clear(); apply(); };
$('#saveFav').onclick = () => {
  store.set('fav', [...selected]);
  $('#saveFav').textContent = '★ Opgeslagen!';
  setTimeout(() => $('#saveFav').textContent = '★ Opslaan als favorieten', 1200);
};
$('#preset').onclick = () => { selected = new Set(store.get('fav', [])); apply(); };

// Een grote stream is 2 kolommen breed, maar nooit breder dan de wall (bij 1 kolom zou er anders een extra kolom ontstaan)
function setCols(n) {
  $('#cols').value = n;
  $('#wall').style.setProperty('--cols', n);
  $('#wall').style.setProperty('--fspan', Math.min(2, n));
  store.set('cols', n);
}
setCols(+store.get('cols', 3));
$('#cols').onchange = () => setCols(+$('#cols').value);
$('#chat').onchange = renderWall;
// Streamer-lijst in- en uitklappen: op desktop klapt de lijst weg (en blijft onthouden), op mobiel schuift hij over de wall
const isMobile = () => matchMedia('(max-width: 800px)').matches;
function setSideCollapsed(collapsed) {
  $('#side').classList.toggle('collapsed', collapsed);
  $('#sideHandle').textContent = collapsed ? '»' : '«';
  store.set('sideCollapsed', collapsed);
}
setSideCollapsed(store.get('sideCollapsed', false));
$('#toggleSide').onclick = () => {
  if (isMobile()) return $('#side').classList.toggle('open');
  setSideCollapsed(!$('#side').classList.contains('collapsed'));
};
$('#sideHandle').onclick = () => setSideCollapsed(!$('#side').classList.contains('collapsed'));

// ===== Titel, legenda en filters uit streamers.ini =====
document.title = CONFIG.title || 'Stream Dashboard';
$('h1').textContent = document.title;
const groupNames = Object.keys(GROUPS);
$('#legend').insertAdjacentHTML('afterbegin', groupNames.length
  ? groupNames.map(g => `<span><i class="dot" style="background:${GROUPS[g]}"></i>${esc(g)}</span>`).join('')
  : '<span><i class="dot" style="background:var(--twitch)"></i>Twitch</span><span><i class="dot" style="background:var(--youtube)"></i>YouTube</span>');
$('#chips [data-d=live]').insertAdjacentHTML('afterend',
  groupNames.map(g => `<span class="chip" data-d="${esc(g)}" style="border-color:${GROUPS[g]}">${esc(g)}</span>`).join(''));

// ===== Start =====
// Eerst de live-status ophalen, zodat bewaarde streams meteen op het juiste platform starten
// (met een maximale wachttijd, zodat een trage YouTube-check de wall niet ophoudt)
renderList();
Promise.race([refreshLive(), new Promise(r => setTimeout(r, 4000))]).then(() => renderWall());
setInterval(refreshLive, 60000);
