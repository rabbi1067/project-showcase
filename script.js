/* =========================================================
   FR Foundry — application logic
   1. Config + data layer (Supabase, with a local preview fallback)
   2. Generated isometric cover art
   3. State + rendering (grid, tags, pagination, hero)
   4. Add / delete flows
   ========================================================= */
(() => {
  "use strict";

  const PAGE_SIZE = 10;
  const MAX_TITLE = 50;
  const MAX_WORDS = 100;
  const MAX_TAGS = 12;

  /* ---------- Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
  const wordCount = (s) => (String(s).trim().match(/\S+/g) || []).length;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canTilt = window.matchMedia("(hover: hover) and (pointer: fine)").matches && !prefersReducedMotion;
  const dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

  function safeUrl(u) {
    try {
      const x = new URL(String(u || "").trim());
      return /^https?:$/.test(x.protocol) ? x.href : "";
    } catch (_) {
      return "";
    }
  }

  function normTags(t) {
    let list = [];
    if (Array.isArray(t)) list = t;
    else if (typeof t === "string") list = t.replace(/^[{[]|[}\]]$/g, "").split(",");
    return list.map((s) => String(s).replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  }

  function normalize(r) {
    return {
      id: r.id,
      title: String(r.title || "Untitled"),
      description: r.description || "",
      live_url: r.live_url || "",
      repo_url: r.repo_url || "",
      tags: normTags(r.tags),
      created_at: r.created_at || r.inserted_at || null,
    };
  }

  const time = (p) => Date.parse(p.created_at) || 0;
  const newestFirst = (a, b) => time(b) - time(a) || String(b.id).localeCompare(String(a.id));

  /* =========================================================
     1. Config + data layer
     ========================================================= */
  function readConfig() {
    const pick = (...vals) => vals.find((v) => typeof v === "string" && v.trim());
    const objs = [window.APP_CONFIG, window.CONFIG, window.config, window.SUPABASE_CONFIG, window.SHOWCASE_CONFIG]
      .filter((o) => o && typeof o === "object");
    const fromObjs = (...keys) => objs.flatMap((o) => keys.map((k) => o[k]));

    const url = pick(
      typeof SUPABASE_URL !== "undefined" ? SUPABASE_URL : undefined,
      window.SUPABASE_URL,
      ...fromObjs("SUPABASE_URL", "supabaseUrl", "url")
    );
    const key = pick(
      typeof SUPABASE_ANON_KEY !== "undefined" ? SUPABASE_ANON_KEY : undefined,
      typeof SUPABASE_KEY !== "undefined" ? SUPABASE_KEY : undefined,
      window.SUPABASE_ANON_KEY,
      window.SUPABASE_KEY,
      ...fromObjs("SUPABASE_ANON_KEY", "SUPABASE_KEY", "supabaseAnonKey", "supabaseKey", "anonKey", "key")
    );
    return url && key ? { url: url.trim(), key: key.trim() } : null;
  }

  function apiError(message, code) {
    const e = new Error(message);
    e.code = code;
    return e;
  }

  function createSupabaseApi(cfg) {
    const sb = window.supabase.createClient(cfg.url, cfg.key);
    const fail = (error) => {
      const msg = String(error.message || error);
      if (/INVALID_CODE/.test(msg)) return apiError("That security code is incorrect.", "INVALID_CODE");
      const known = msg.match(/INVALID_(TITLE|DESCRIPTION|REPO|LIVE)/);
      if (known) return apiError("Some details were not accepted. Check the form and try again.", known[0]);
      return apiError(msg, "ERROR");
    };
    return {
      mode: "live",
      async list() {
        const { data, error } = await sb
          .from("projects")
          .select("id,title,description,live_url,repo_url,tags,created_at")
          .order("created_at", { ascending: false });
        if (error) throw fail(error);
        return (data || []).map(normalize).sort(newestFirst);
      },
      async add(p, code) {
        const { error } = await sb.rpc("showcase_add_project", {
          p_code: code,
          p_title: p.title,
          p_description: p.description,
          p_live_url: p.live_url || null,
          p_repo_url: p.repo_url,
          p_tags: p.tags,
        });
        if (error) throw fail(error);
      },
      async remove(id, code) {
        const { error } = await sb.rpc("showcase_delete_project", { p_code: code, p_id: String(id) });
        if (error) throw fail(error);
      },
    };
  }

  /* Local preview: used when no database details are found, so the page is never empty/broken. */
  function createLocalApi() {
    const KEY = "frf.preview.projects";
    const day = 86400000;
    const seed = [
      ["Weather Now", "Clean forecast dashboard with hourly charts and saved cities.", ["html", "css", "api"]],
      ["Task Board", "Drag-and-drop kanban board that syncs across devices.", ["javascript", "supabase"]],
      ["Shop UI Kit", "Responsive storefront components with a working cart.", ["html", "css"]],
      ["Pocket Chat", "Realtime chat rooms with typing indicators.", ["javascript", "supabase"]],
      ["Budget Tracker", "Track income and expenses with monthly reports.", ["javascript", "css"]],
      ["Music Player", "Lightweight audio player with playlists and shortcuts.", ["javascript", "html"]],
      ["Movie Finder", "Search films and save a watchlist using a public API.", ["api", "javascript"]],
      ["Travel Map", "Plan trips and pin places on an interactive map.", ["javascript", "api"]],
      ["Notes API", "Small REST API for notes with token authentication.", ["node", "api"]],
      ["Quiz Arena", "Timed quiz game with a live leaderboard.", ["javascript", "css"]],
      ["Fit Log", "Workout journal with streaks and weekly summaries.", ["html", "css", "javascript"]],
      ["Learn Hub", "Course pages with progress tracking.", ["html", "css"]],
      ["Portfolio v2", "Personal site with a dark theme and animations.", ["html", "css"]],
    ].map(([title, description, tags], i) => ({
      id: "demo-" + i,
      title,
      description,
      live_url: "https://example.com",
      repo_url: "https://github.com/rabbi1067/" + title.toLowerCase().replace(/\s+/g, "-"),
      tags,
      created_at: new Date(Date.now() - i * 2.3 * day).toISOString(),
    }));

    const load = () => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) { /* ignore */ }
      return seed;
    };
    const save = (list) => {
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* ignore */ }
    };

    return {
      mode: "preview",
      async list() { return load().map(normalize).sort(newestFirst); },
      async add(p, code) {
        if (!code) throw apiError("That security code is incorrect.", "INVALID_CODE");
        const list = load();
        list.push({ ...p, id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()), created_at: new Date().toISOString() });
        save(list);
      },
      async remove(id, code) {
        if (!code) throw apiError("That security code is incorrect.", "INVALID_CODE");
        save(load().filter((p) => String(p.id) !== String(id)));
      },
    };
  }

  /* =========================================================
     2. Generated isometric cover art
     Each project gets its own colour family (picked from its
     name), on top of the shared layout, tower heights and
     centre icon that are also seeded from the name.
     ========================================================= */
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const ICONS = {
    cart: '<path d="M3 4h2l2.3 10.2a2 2 0 0 0 2 1.6h7.5a2 2 0 0 0 2-1.5L21 8H6.2"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12z"/>',
    weather: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    todo: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.3 1.3L7 5M3.5 12l1.3 1.3L7 11M3.5 18l1.3 1.3L7 17"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
    game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11.5" r=".8"/><circle cx="18" cy="13.5" r=".8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    calc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8.5 7h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M10 12h4"/>',
    db: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    heart: '<path d="M12 20s-8-4.9-8-11a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 20 9c0 6.1-8 11-8 11z"/>',
    cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  };
  const ICON_RULES = [
    [/shop|store|cart|commerce|market|buy|sale|order/, "cart"],
    [/chat|messag|talk|social|mail|inbox/, "chat"],
    [/weather|climate|forecast|sun|rain/, "weather"],
    [/todo|task|note|list|plan|kanban|check/, "todo"],
    [/blog|news|article|post|read|doc|write|book/, "doc"],
    [/game|play|quiz|puzzle|arena|chess|snake/, "game"],
    [/portfolio|resume|cv|profile|about|person|user|team/, "user"],
    [/calc|math|convert|counter|number/, "calc"],
    [/music|audio|song|player|podcast|radio|sound/, "music"],
    [/video|movie|film|stream|tv|cinema|youtube/, "video"],
    [/finance|bank|money|budget|expense|invest|stock|crypto|wallet|analytic|dashboard|report/, "chart"],
    [/\bai\b|bot|gpt|ml|neural|smart|robot|assistant/, "chip"],
    [/api|server|backend|database|\bdb\b|data|sql|cloud/, "db"],
    [/map|travel|trip|location|place|tour|hotel|flight/, "pin"],
    [/health|fit|gym|workout|medical|care|yoga|diet/, "heart"],
    [/learn|edu|school|course|study|class|lesson|tutor/, "cap"],
    [/web|site|landing|page|app|portal|browser|link/, "globe"],
  ];
  const iconFor = (name) => {
    const n = name.toLowerCase();
    const hit = ICON_RULES.find(([re]) => re.test(n));
    return hit ? ICONS[hit[1]] : null;
  };
  const initials = (name) => {
    const w = name.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
    if (!w.length) return "★";
    const a = Array.from(w[0])[0] || "";
    const b = w.length > 1 ? Array.from(w[1])[0] || "" : Array.from(w[0])[1] || "";
    return (a + b).toUpperCase();
  };

  let coverSeq = 0;
  function coverSVG(rawName) {
    const name = String(rawName || "").trim() || "Project";
    const rand = mulberry32(hashSeed(name.toLowerCase()));
    const uid = "cv" + ++coverSeq;

    // Each project name picks its own colour family (full hue wheel),
    // so different projects read as visually distinct at a glance —
    // not just different letters on the same blue/teal palette.
    const baseHue = rand() * 360;
    const satJitter = 0.9 + rand() * 0.2;

    const W = 32, H = 18.5, OX = 320, OY = 118, N = 6, SLAB = 12;
    const P = (x, y, z) => `${(OX + (x - y) * W).toFixed(1)} ${(OY + (x + y) * H - z).toFixed(1)}`;
    const edge = 'stroke="rgba(255,255,255,.38)" stroke-width=".8" stroke-linejoin="round"';
    const poly = (pts, attrs) => `<polygon points="${pts.join(", ")}" ${attrs}/>`;

    const faces = (i, j, w, d, z0, z1) => ({
      t: [P(i, j, z1), P(i + w, j, z1), P(i + w, j + d, z1), P(i, j + d, z1)],
      l: [P(i, j + d, z1), P(i + w, j + d, z1), P(i + w, j + d, z0), P(i, j + d, z0)],
      r: [P(i + w, j, z1), P(i + w, j + d, z1), P(i + w, j + d, z0), P(i + w, j, z0)],
    });
    const block = (i, j, w, d, z0, z1, hue, lift = 0) => {
      const f = faces(i, j, w, d, z0, z1);
      const sat = (84 * satJitter).toFixed(0);
      return (
        poly(f.l, `fill="hsl(${hue.toFixed(0)} ${sat}% ${50 + lift}%)" ${edge}`) +
        poly(f.r, `fill="hsl(${hue.toFixed(0)} ${(sat - 4).toFixed(0)}% ${37 + lift}%)" ${edge}`) +
        poly(f.t, `fill="hsl(${hue.toFixed(0)} ${(+sat + 6).toFixed(0)}% ${66 + lift}%)" ${edge}`)
      );
    };

    let out = "";

    // soft glow under the platform, tinted to this project's hue
    out += `<defs><radialGradient id="${uid}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="hsl(${baseHue.toFixed(0)} 90% 60%)" stop-opacity=".38"/><stop offset="1" stop-color="hsl(${baseHue.toFixed(0)} 90% 60%)" stop-opacity="0"/></radialGradient></defs>`;
    out += `<ellipse cx="320" cy="262" rx="250" ry="96" fill="url(#${uid}g)"/>`;

    // platform slab + grid lines
    const s = faces(0, 0, N, N, 0, SLAB);
    out += poly(s.l, 'class="cv-sl-l"') + poly(s.r, 'class="cv-sl-r"') + poly(s.t, 'class="cv-sl-t"');
    let lines = "";
    for (let k = 1; k < N; k++) {
      lines += `M${P(k, 0, SLAB)} L${P(k, N, SLAB)} M${P(0, k, SLAB)} L${P(N, k, SLAB)} `;
    }
    out += `<path class="cv-line" d="${lines}"/>`;

    // towers on free cells (centre 2x2 is reserved for the hero block)
    const cells = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (i >= 2 && i <= 3 && j >= 2 && j <= 3) continue;
        cells.push([i, j]);
      }
    }
    for (let k = cells.length - 1; k > 0; k--) {
      const r = Math.floor(rand() * (k + 1));
      [cells[k], cells[r]] = [cells[r], cells[k]];
    }
    const items = cells.slice(0, 6 + Math.floor(rand() * 3)).map(([i, j]) => {
      const h = 14 + rand() * 62;
      // hues spread out from this project's base hue, not a fixed blue/cyan band
      const hue = (baseHue - ((i + j) / 10) * 70 + (rand() - 0.5) * 16 + 360) % 360;
      return { i, j, w: 1, d: 1, h, hue, cap: rand() < 0.35, key: i + 1 + (j + 1) };
    });
    const heroH = 34 + rand() * 22;
    items.push({ hero: true, i: 2, j: 2, w: 2, d: 2, h: heroH, hue: baseHue, key: 8 });
    items.sort((a, b) => a.key - b.key || (b.hero ? 1 : 0) - (a.hero ? 1 : 0));

    items.forEach((it) => {
      if (!it.hero) {
        out += block(it.i, it.j, it.w, it.d, SLAB, SLAB + it.h, it.hue);
        if (it.cap) out += block(it.i + 0.25, it.j + 0.25, 0.5, 0.5, SLAB + it.h, SLAB + it.h + 10, it.hue, 6);
        return;
      }
      const zTop = SLAB + it.h;
      const cx = OX;
      const cy = OY + 6 * H - zTop;
      const sc = 1.5 / 24;
      const a = W * sc, b = H * sc;
      const m = `matrix(${a.toFixed(4)} ${b.toFixed(4)} ${(-a).toFixed(4)} ${b.toFixed(4)} ${cx} ${(cy - 24 * b).toFixed(2)})`;
      const glyph = iconFor(name)
        ? (attrs) => `<g transform="${m}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${iconFor(name)}</g>`
        : (attrs) => `<g transform="${m}" ${attrs}><text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="800" font-family="Bricolage Grotesque, system-ui, sans-serif" stroke="none">${esc(initials(name))}</text></g>`;
      const isIcon = !!iconFor(name);
      const shadowAttrs = isIcon ? 'stroke="rgba(6,22,80,.42)"' : 'fill="rgba(6,22,80,.42)"';
      const mainAttrs = isIcon ? 'stroke="#fff"' : 'fill="#fff"';
      out += '<g class="cv-lift">' + block(it.i, it.j, it.w, it.d, SLAB, zTop, it.hue, 6);
      [6, 4, 2].forEach((dy) => { out += `<g transform="translate(0 ${dy})">${glyph(shadowAttrs)}</g>`; });
      out += glyph(mainAttrs) + "</g>";
    });

    // floating chips, drifted to a complementary hue for a bit of contrast
    for (let k = 0; k < 4; k++) {
      const x = 90 + rand() * 460, y = 26 + rand() * 100, r = 5 + rand() * 5;
      const hue = (baseHue + 130 + rand() * 100) % 360;
      out += `<g class="cv-bob" style="animation-delay:${(-rand() * 4).toFixed(2)}s"><polygon points="${x.toFixed(1)},${(y - r).toFixed(1)} ${(x + r).toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${(y + r).toFixed(1)} ${(x - r).toFixed(1)},${y.toFixed(1)}" fill="hsl(${hue.toFixed(0)} 90% 62%)" opacity=".85"/></g>`;
    }

    return `<svg viewBox="0 0 640 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${out}</svg>`;
  }

  /* =========================================================
     3. State + rendering
     ========================================================= */
  const dom = {
    root: document.documentElement,
    grid: $("#grid"),
    toolbar: $("#toolbar"),
    search: $("#search"),
    tagFilters: $("#tagFilters"),
    pager: $("#pager"),
    countPill: $("#countPill"),
    rangeText: $("#rangeText"),
    noMatch: $("#noMatch"),
    noMatchText: $("#noMatchText"),
    empty: $("#empty"),
    errorState: $("#errorState"),
    errorText: $("#errorText"),
    notice: $("#setupNotice"),
    scene: $("#scene"),
    toast: $("#toast"),
  };

  const state = { projects: [], query: "", tag: null, page: 1, animate: true };
  let api;

  const isRecent = (p) => Date.now() - time(p) < 3 * 86400000 && time(p) > 0;

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.projects.filter((p) => {
      if (state.tag && !p.tags.some((t) => t.toLowerCase() === state.tag)) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }

  function cardHTML(p, i, isFirstOnFirstPage) {
    const repo = safeUrl(p.repo_url);
    const live = safeUrl(p.live_url);
    const tags = p.tags.slice(0, MAX_TAGS).map((t) => `<li>${esc(t)}</li>`).join("");
    const added = time(p) ? `Added ${dateFmt.format(new Date(time(p)))}` : "";
    // "Live demo" shows only when a live link was added.
    // "GitHub" shows whenever a GitHub link exists (it is required when adding).
    const links =
      (live ? `<a class="btn btn-primary btn-small" href="${esc(live)}" target="_blank" rel="noopener noreferrer">Live demo</a>` : "") +
      (repo ? `<a class="btn btn-small" href="${esc(repo)}" target="_blank" rel="noopener noreferrer">GitHub</a>` : "");
    const showBadge = isFirstOnFirstPage && isRecent(p);
    return `
      <article class="card${state.animate ? " enter" : ""}" style="--i:${i}" data-id="${esc(p.id)}">
        <div class="card-media">${coverSVG(p.title)}${showBadge ? '<span class="badge">New</span>' : ""}</div>
        <div class="card-body">
          <h3>${esc(p.title)}</h3>
          ${p.description ? `<p>${esc(p.description)}</p>` : ""}
          ${tags ? `<ul class="tags" aria-label="Tags">${tags}</ul>` : ""}
          ${links ? `<div class="card-links">${links}</div>` : ""}
        </div>
        <div class="card-foot">
          <span>${esc(added)}</span>
          <button class="link-delete" type="button" data-delete="${esc(p.id)}" aria-label="Delete ${esc(p.title)}">Delete</button>
        </div>
      </article>`;
  }

  function bindTilt(card) {
    card.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      card.style.setProperty("--ry", `${((x - 0.5) * 9).toFixed(2)}deg`);
      card.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
      card.style.setProperty("--px", (x - 0.5).toFixed(3));
      card.style.setProperty("--py", (y - 0.5).toFixed(3));
      card.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    });
    card.addEventListener("pointerleave", () => {
      ["--rx", "--ry", "--px", "--py"].forEach((v) => card.style.setProperty(v, v.startsWith("--p") ? "0" : "0deg"));
    });
  }

  function pageNumbers(cur, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const set = new Set([1, 2, total - 1, total, cur - 1, cur, cur + 1]);
    const arr = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    arr.forEach((n, i) => {
      if (i && n - arr[i - 1] > 1) out.push("…");
      out.push(n);
    });
    return out;
  }

  const chevL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  const chevR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

  function renderPager(total, cur) {
    if (total <= 1) { dom.pager.hidden = true; dom.pager.innerHTML = ""; return; }
    dom.pager.hidden = false;
    const nums = pageNumbers(cur, total)
      .map((n) =>
        n === "…"
          ? '<li class="gap" aria-hidden="true">…</li>'
          : `<li><button class="pg${n === cur ? " is-active" : ""}" type="button" data-page="${n}" ${n === cur ? 'aria-current="page"' : ""} aria-label="Page ${n}">${n}</button></li>`
      )
      .join("");
    dom.pager.innerHTML =
      `<button class="pg pg-nav" type="button" data-page="${cur - 1}" ${cur === 1 ? "disabled" : ""} aria-label="Previous page">${chevL}<span>Previous</span></button>` +
      `<ol>${nums}</ol>` +
      `<button class="pg pg-nav" type="button" data-page="${cur + 1}" ${cur === total ? "disabled" : ""} aria-label="Next page"><span>Next</span>${chevR}</button>`;
  }

  function renderTags() {
    const counts = new Map();
    state.projects.forEach((p) => {
      new Set(p.tags.map((t) => t.toLowerCase())).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1));
    });
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!top.length) { dom.tagFilters.innerHTML = ""; return; }
    const chip = (label, value, count) =>
      `<button class="chip" type="button" data-tag="${esc(value)}" aria-pressed="${state.tag === (value || null)}">${esc(label)}${count != null ? ` <span>${count}</span>` : ""}</button>`;
    dom.tagFilters.innerHTML = chip("All", "", state.projects.length) + top.map(([t, c]) => chip(t, t, c)).join("");
  }

  function render() {
    const all = state.projects;
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = list.slice(start, start + PAGE_SIZE);

    dom.errorState.hidden = true;
    dom.grid.setAttribute("aria-busy", "false");
    dom.countPill.textContent = all.length;
    dom.toolbar.hidden = all.length === 0;
    dom.empty.hidden = all.length !== 0;
    dom.noMatch.hidden = !(all.length > 0 && list.length === 0);

    if (all.length && !list.length) {
      const bits = [];
      if (state.query.trim()) bits.push(`“${state.query.trim()}”`);
      if (state.tag) bits.push(`the tag ${state.tag}`);
      dom.noMatchText.textContent = `Nothing matches ${bits.join(" with ")}. Try a different word, or clear the filters.`;
    }

    // Always show a clear, legible count under the heading — never a tiny
    // fading-into-the-background note. The wording steps up only as much
    // detail as the moment actually needs.
    const isFiltered = list.length !== all.length;
    const isPaged = pages > 1;
    if (!all.length) {
      dom.rangeText.hidden = true;
    } else if (!list.length) {
      dom.rangeText.hidden = false;
      dom.rangeText.textContent = "No matching projects";
    } else if (isFiltered) {
      dom.rangeText.hidden = false;
      dom.rangeText.textContent = `${list.length} of ${all.length} project${all.length === 1 ? "" : "s"} match`;
    } else if (isPaged) {
      dom.rangeText.hidden = false;
      dom.rangeText.textContent = `Showing ${start + 1}–${start + slice.length} of ${list.length} projects`;
    } else {
      dom.rangeText.hidden = false;
      dom.rangeText.textContent = `${list.length} project${list.length === 1 ? "" : "s"}`;
    }

    dom.grid.innerHTML = slice.map((p, i) => cardHTML(p, i, state.page === 1 && i === 0 && !state.tag && !state.query.trim())).join("");
    if (canTilt) $$(".card", dom.grid).forEach(bindTilt);
    state.animate = false;

    renderTags();
    renderPager(pages, state.page);
  }

  function renderSkeleton() {
    dom.grid.setAttribute("aria-busy", "true");
    dom.grid.innerHTML = Array.from({ length: 6 }, () => '<div class="card skeleton" aria-hidden="true"></div>').join("");
  }

  function renderHero() {
    const src = state.projects.length
      ? state.projects.slice(0, 4)
      : [{ title: "Your next project" }, { title: "Ship it" }, { title: "Open source" }];
    const c = (src.length - 1) / 2;
    dom.scene.innerHTML = src
      .map((p, i) => {
        const x = ((i - c) * 60).toFixed(0);
        const y = (-(i - c) * 46).toFixed(0);
        const z = -i * 110;
        return `
        <div class="hero-tile" style="--i:${i};--x:${x};--y:${y};--z:${z}">
          <div class="hero-tile-inner">
            <div class="hero-tile-media">${coverSVG(p.title)}</div>
            <div class="hero-tile-label"><strong>${esc(p.title)}</strong>${i === 0 && state.projects.length ? "<span>Latest</span>" : ""}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  function bindHeroPointer() {
    if (!canTilt) return;
    const hero = $("#hero");
    hero.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = hero.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      dom.scene.style.setProperty("--ry", `${(-20 + px * 24).toFixed(2)}deg`);
      dom.scene.style.setProperty("--rx", `${(9 - py * 14).toFixed(2)}deg`);
    });
    hero.addEventListener("pointerleave", () => {
      dom.scene.style.setProperty("--ry", "-20deg");
      dom.scene.style.setProperty("--rx", "9deg");
    });
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    dom.toast.textContent = msg;
    dom.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { dom.toast.hidden = true; }, 3200);
  }

  /* ---------- Data loading ---------- */
  async function load() {
    renderSkeleton();
    dom.empty.hidden = true;
    dom.noMatch.hidden = true;
    try {
      state.projects = await api.list();
      state.animate = true;
      render();
      renderHero();
    } catch (err) {
      dom.grid.innerHTML = "";
      dom.grid.setAttribute("aria-busy", "false");
      dom.pager.hidden = true;
      dom.toolbar.hidden = true;
      dom.errorText.textContent = err.message || "Something went wrong while loading.";
      dom.errorState.hidden = false;
      renderHero();
    }
  }

  /* ---------- Events: search, tags, pagination ---------- */
  let searchTimer;
  dom.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = dom.search.value;
      state.page = 1;
      state.animate = true;
      render();
    }, 120);
  });

  dom.tagFilters.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tag]");
    if (!btn) return;
    const value = btn.dataset.tag || null;
    state.tag = state.tag === value ? null : value;
    state.page = 1;
    state.animate = true;
    render();
  });

  dom.pager.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-page]");
    if (!btn || btn.disabled) return;
    state.page = Number(btn.dataset.page);
    state.animate = true;
    render();
    $("#projects").scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
  });

  $("#clearFilters").addEventListener("click", () => {
    state.query = ""; state.tag = null; state.page = 1; state.animate = true;
    dom.search.value = "";
    render();
  });
  $("#retryBtn").addEventListener("click", load);

  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(tag) && !document.querySelector("dialog[open]")) {
      e.preventDefault();
      dom.search.focus();
    }
  });

  /* ---------- Theme ---------- */
  const themeBtn = $("#themeToggle");
  const metaTheme = $("#metaTheme");
  function syncThemeUI() {
    const dark = dom.root.dataset.theme === "dark";
    themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    if (metaTheme) metaTheme.setAttribute("content", dark ? "#060A15" : "#F2F5FB");
  }
  themeBtn.addEventListener("click", () => {
    const next = dom.root.dataset.theme === "dark" ? "light" : "dark";
    dom.root.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (_) { /* ignore */ }
    syncThemeUI();
  });
  syncThemeUI();

  /* =========================================================
     4. Add / delete flows
     ========================================================= */
  const addDialog = $("#addDialog");
  const addForm = $("#addForm");
  const deleteDialog = $("#deleteDialog");
  const deleteForm = $("#deleteForm");
  const coverPreview = $("#coverPreview");
  let deleteId = null;

  function openDialog(d) {
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
  }
  $$("dialog").forEach((d) => {
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
    $$("[data-close]", d).forEach((b) => b.addEventListener("click", () => d.close()));
  });

  const previewTitle = () => addForm.elements.title.value.trim() || "New project";
  let previewTimer;
  function updatePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { coverPreview.innerHTML = coverSVG(previewTitle()); }, 120);
  }

  function updateCounters() {
    const t = addForm.elements.title.value.length;
    $("#titleCount").textContent = `${t}/${MAX_TITLE}`;
    const w = wordCount(addForm.elements.description.value);
    const dc = $("#descCount");
    dc.textContent = `${w}/${MAX_WORDS} words`;
    dc.classList.toggle("over", w > MAX_WORDS);
  }

  function clearErrors() {
    $$(".field-error", addForm).forEach((p) => { p.hidden = true; p.textContent = ""; });
    $$(".field.invalid", addForm).forEach((f) => f.classList.remove("invalid"));
    $("#addError").hidden = true;
  }
  function showErrors(errors) {
    let first = null;
    Object.entries(errors).forEach(([name, msg]) => {
      const p = $(`#err-${name}`);
      const input = addForm.elements[name];
      if (!p || !input) return;
      p.textContent = msg;
      p.hidden = false;
      input.closest(".field").classList.add("invalid");
      first = first || input;
    });
    if (first) first.focus();
  }

  function parseGithub(u) {
    try {
      const x = new URL(u.trim());
      if (!/^https?:$/.test(x.protocol) || !/^(www\.)?github\.com$/i.test(x.hostname)) return "";
      const seg = x.pathname.split("/").filter(Boolean);
      if (seg.length < 2) return "";
      return `https://github.com/${seg[0]}/${seg[1].replace(/\.git$/i, "")}`;
    } catch (_) {
      return "";
    }
  }

  function validate() {
    const errors = {};
    const title = addForm.elements.title.value.trim();
    const description = addForm.elements.description.value.trim();
    const live = addForm.elements.live_url.value.trim();
    const repoRaw = addForm.elements.repo_url.value.trim();
    const tags = [...new Set(addForm.elements.tags.value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

    if (title.length < 2) errors.title = `Enter a project name (2–${MAX_TITLE} characters).`;
    if (wordCount(description) > MAX_WORDS) errors.description = `Keep the description to ${MAX_WORDS} words or fewer.`;
    if (!repoRaw) errors.repo_url = "A GitHub link is required.";
    else if (!parseGithub(repoRaw)) errors.repo_url = "Enter a repository link like https://github.com/username/repo.";
    if (live && !safeUrl(live)) errors.live_url = "Enter a full link starting with https://.";
    if (tags.length > MAX_TAGS) errors.tags = `Use up to ${MAX_TAGS} tags.`;
    else if (tags.some((t) => t.length > 20)) errors.tags = "Each tag can be up to 20 characters.";
    if (!addForm.elements.code.value) errors.code = "Enter the security code.";

    return {
      errors,
      clean: { title, description, live_url: live ? safeUrl(live) : "", repo_url: parseGithub(repoRaw), tags },
    };
  }

  function openAdd() {
    addForm.reset();
    clearErrors();
    updateCounters();
    coverPreview.innerHTML = coverSVG("New project");
    openDialog(addDialog);
    setTimeout(() => addForm.elements.title.focus(), 30);
  }
  $("#openAdd").addEventListener("click", openAdd);
  $$("[data-open-add]").forEach((b) => b.addEventListener("click", openAdd));
  addForm.elements.title.addEventListener("input", () => { updateCounters(); updatePreview(); });
  addForm.elements.description.addEventListener("input", updateCounters);

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    const { errors, clean } = validate();
    if (Object.keys(errors).length) { showErrors(errors); return; }

    const btn = $("#addSubmit");
    btn.disabled = true;
    btn.textContent = "Adding…";
    try {
      await api.add(clean, addForm.elements.code.value);
      addDialog.close();
      state.query = ""; state.tag = null; state.page = 1;
      dom.search.value = "";
      await load();
      toast("Project added");
      $("#projects").scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    } catch (err) {
      if (err.code === "INVALID_CODE") showErrors({ code: err.message });
      else { const box = $("#addError"); box.textContent = err.message || "Couldn't add the project."; box.hidden = false; }
    } finally {
      btn.disabled = false;
      btn.textContent = "Add project";
    }
  });

  // delete
  dom.grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete]");
    if (!btn) return;
    deleteId = btn.dataset.delete;
    const p = state.projects.find((x) => String(x.id) === String(deleteId));
    $("#delName").textContent = p ? p.title : "";
    deleteForm.reset();
    $("#delError").hidden = true;
    openDialog(deleteDialog);
    setTimeout(() => $("#delCode").focus(), 30);
  });

  deleteForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = $("#delCode").value;
    const err = $("#delError");
    err.hidden = true;
    if (!code) { err.textContent = "Enter the security code."; err.hidden = false; return; }
    const btn = $("#delSubmit");
    btn.disabled = true;
    btn.textContent = "Deleting…";
    try {
      await api.remove(deleteId, code);
      deleteDialog.close();
      state.animate = true;
      await load();
      toast("Project deleted");
    } catch (ex) {
      err.textContent = ex.message || "Couldn't delete the project.";
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Delete project";
    }
  });

  /* ---------- Boot ---------- */
  function boot() {
    $("#year").textContent = new Date().getFullYear();
    const cfg = readConfig();
    const hasLib = !!(window.supabase && typeof window.supabase.createClient === "function");
    const notice = dom.notice;

    if (cfg && hasLib) {
      try {
        api = createSupabaseApi(cfg);
      } catch (_) {
        api = null;
      }
    }
    if (!api) {
      api = createLocalApi();
      notice.innerHTML = cfg && !hasLib
        ? "<strong>Preview mode.</strong> The database library couldn't load, so projects are stored only in this browser. Check your connection and reload."
        : "<strong>Preview mode.</strong> No database details were found in <code>config.js</code>, so projects are stored only in this browser. Add your Supabase URL and key to make them appear on every device.";
      notice.hidden = false;
    }
    bindHeroPointer();
    load();
  }

  boot();
})();
