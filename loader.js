// Leest streamers.ini in en start daarna het dashboard (app.js).
// Uitleg over het formaat staat in streamers.ini zelf.

const GROUP_COLORS = ['#4aa8ff', '#ff9a3c', '#5fd068', '#ff5c8a', '#b98bff', '#ffd23c', '#3cdcd0', '#ff6b4a'];

function parseIni(text) {
  const config = { title: 'Stream Dashboard', groups: {}, streamers: [] };
  let section = 'streamers';
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;

    // [sectie]: [dashboard], [streamers] of een groep
    let m = line.match(/^\[\s*(.+?)\s*\]$/);
    if (m) {
      section = m[1];
      const key = section.toLowerCase();
      if (key !== 'dashboard' && key !== 'streamers')
        config.groups[section] ??= GROUP_COLORS[Object.keys(config.groups).length % GROUP_COLORS.length];
      continue;
    }

    // naam = waarde (een losse link zonder naam mag ook)
    let name = null, value = line;
    m = line.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (m && !/^https?:/i.test(m[1])) { name = m[1]; value = m[2].trim(); }
    const key = (name || '').toLowerCase();
    const sec = section.toLowerCase();

    if (sec === 'dashboard') {
      if (key === 'titel' || key === 'title') config.title = value;
      continue;
    }
    if (sec !== 'streamers' && (key === 'kleur' || key === 'color')) { config.groups[section] = value; continue; }
    if (!value) continue;

    const s = { name, group: sec === 'streamers' ? null : section };
    for (const part of value.split(/[\s,]+/).filter(Boolean)) {
      if (/twitch\.tv/i.test(part)) s.twitch ??= part;
      else if (/youtube\.com|^@|^UC[\w-]{22}$/i.test(part)) s.youtube ??= part;
      else if (/^\w+$/.test(part)) s.twitch ??= part;   // losse naam = Twitch-naam
      else console.warn('streamers.ini: niet herkend:', part);
    }
    if (s.twitch || s.youtube) config.streamers.push(s);
  }
  return config;
}

fetch('streamers.ini', { cache: 'no-store' })
  .then(r => r.ok ? r.text() : '')
  .catch(() => '')
  .then(text => {
    window.CONFIG = parseIni(text);
    const s = document.createElement('script');
    s.src = 'app.js';
    document.body.appendChild(s);
  });
