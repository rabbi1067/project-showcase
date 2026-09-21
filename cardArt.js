/*!
 * card-art.js
 * Generates a unique piece of card artwork for each project, as an SVG string.
 * Same project name -> same artwork every time. Different names -> different
 * style (4 styles) and colour palette (8 palettes).
 *
 * Usage:
 *   CardArt.svg('cityfic')                       // returns "<svg ...>" string
 *   CardArt.svg(project.id, { label: 'CI' })     // seed by id, custom label
 *   CardArt.dataUri('cityfic')                   // for <img src="...">
 *   CardArt.mount(element, 'cityfic')            // sets element.innerHTML
 *
 * Tip: seed with a stable value (project id) so artwork never changes when the
 * project is renamed. Seed with the title if you want it to follow the name.
 */
(function (root) {
  'use strict';

  var W = 400, H = 250;

  // base hue, and how far the second colour of the gradient drifts from it
  var PALETTES = [
    { name: 'ocean',   h: 214, s:  32 },
    { name: 'lagoon',  h: 186, s: -28 },
    { name: 'emerald', h: 152, s:  34 },
    { name: 'lime',    h: 112, s: -40 },
    { name: 'amber',   h:  36, s:  20 },
    { name: 'rose',    h: 348, s:  26 },
    { name: 'orchid',  h: 300, s: -34 },
    { name: 'violet',  h: 262, s:  34 }
  ];

  var STYLE_NAMES = ['city', 'layers', 'orbit', 'ridges'];

  /* ---------- helpers ---------- */

  function hash(str) {
    var h = 2166136261 >>> 0;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hsl(h, s, l, a) {
    h = ((h % 360) + 360) % 360;
    return a == null
      ? 'hsl(' + h.toFixed(0) + ' ' + s + '% ' + l + '%)'
      : 'hsl(' + h.toFixed(0) + ' ' + s + '% ' + l + '% / ' + a + ')';
  }

  function n(v) { return Math.round(v * 10) / 10; }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function initials(title) {
    var words = String(title || '').trim().split(/[\s\-_.]+/).filter(Boolean);
    if (!words.length) return '\u2022';
    if (words.length > 1) return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    return words[0].slice(0, 2).toUpperCase();
  }

  function tones(p) {
    var h = p.h, h2 = p.h + p.s;
    return {
      h: h, h2: h2,
      top:   hsl(h2, 88, 70),
      left:  hsl(h, 80, 54),
      right: hsl(h2, 68, 40),
      edge:  hsl(h2, 95, 84),
      glow:  hsl(h2, 90, 60),
      bgA:   hsl(h, 58, 16),
      bgB:   hsl(h2, 52, 8),
      ink:   hsl(h, 65, 12),
      plate: hsl(h, 32, 20),
      plateSide: hsl(h, 32, 13),
      grid:  hsl(h, 40, 34)
    };
  }

  function sparkles(r, t, count, yMax) {
    var out = '';
    for (var i = 0; i < count; i++) {
      var x = 14 + r() * (W - 28);
      var y = 12 + r() * yMax;
      var s = 2 + r() * 2.6;
      var col = r() > 0.5 ? t.top : t.glow;
      out += '<path d="M' + n(x) + ' ' + n(y - s) + 'L' + n(x + s) + ' ' + n(y) +
             'L' + n(x) + ' ' + n(y + s) + 'L' + n(x - s) + ' ' + n(y) + 'Z" fill="' + col +
             '" opacity="' + n(0.45 + r() * 0.5) + '"/>';
    }
    return out;
  }

  function poly(pts, fill, stroke, sw) {
    var d = '';
    for (var i = 0; i < pts.length; i++) d += (i ? 'L' : 'M') + n(pts[i][0]) + ' ' + n(pts[i][1]);
    return '<path d="' + d + 'Z" fill="' + fill + '"' +
           (stroke ? ' stroke="' + stroke + '" stroke-width="' + (sw || 0.8) + '" stroke-linejoin="round"' : '') + '/>';
  }

  /* isometric projection: grid (x, y, z) -> screen [sx, sy] */
  function makeIso(ox, oy, u) {
    return function (x, y, z) {
      return [ox + (x - y) * u * 0.866, oy + (x + y) * u * 0.5 - z * u];
    };
  }

  function cuboid(P, x, y, z0, w, d, h, c) {
    var z1 = z0 + h;
    var left  = [P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x, y + d, z1)];
    var right = [P(x + w, y, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x + w, y, z1)];
    var top   = [P(x, y, z1), P(x + w, y, z1), P(x + w, y + d, z1), P(x, y + d, z1)];
    return poly(left, c.left) + poly(right, c.right) + poly(top, c.top, c.edge, 0.7);
  }

  /* text lying flat on an isometric top face */
  function isoLabel(P, cx, cy, z, label, size, color, u) {
    var p = P(cx, cy, z);
    return '<text transform="translate(' + n(p[0]) + ' ' + n(p[1]) + ') matrix(0.866 0.5 -0.866 0.5 0 0)" ' +
           'text-anchor="middle" dominant-baseline="central" font-family="Manrope, system-ui, sans-serif" ' +
           'font-weight="800" font-size="' + size + '" fill="' + color + '" letter-spacing="1">' + esc(label) + '</text>';
  }

  function shuffle(arr, r) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function open(id, t, extraDefs) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs>' +
        '<linearGradient id="' + id + 'bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + t.bgA + '"/><stop offset="1" stop-color="' + t.bgB + '"/></linearGradient>' +
        '<radialGradient id="' + id + 'gl" cx="50%" cy="74%" r="55%"><stop offset="0" stop-color="' + t.glow + '" stop-opacity=".32"/><stop offset="1" stop-color="' + t.glow + '" stop-opacity="0"/></radialGradient>' +
        (extraDefs || '') +
      '</defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'bg)"/>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'gl)"/>';
  }

  /* ---------- style 0: city (isometric blocks on a plate) ---------- */

  function styleCity(id, t, r, label) {
    var u = 27, P = makeIso(200, 66, u), s = open(id, t) + sparkles(r, t, 7, 70);
    var N = 5;

    // plate
    s += cuboid(P, 0, 0, -0.28, N, N, 0.28, { left: t.plateSide, right: t.plateSide, top: t.plate, edge: t.grid });
    for (var i = 1; i < N; i++) {
      s += '<path d="M' + n(P(i, 0, 0)[0]) + ' ' + n(P(i, 0, 0)[1]) + 'L' + n(P(i, N, 0)[0]) + ' ' + n(P(i, N, 0)[1]) +
           'M' + n(P(0, i, 0)[0]) + ' ' + n(P(0, i, 0)[1]) + 'L' + n(P(N, i, 0)[0]) + ' ' + n(P(N, i, 0)[1]) +
           '" stroke="' + t.grid + '" stroke-width=".6" opacity=".55"/>';
    }

    // blocks around the centre in the outer ring of cells
    var cells = [];
    for (var a = 0; a < N; a++) for (var b = 0; b < N; b++) {
      if (a >= 1 && a <= 3 && b >= 1 && b <= 3) continue;
      cells.push([a, b]);
    }
    shuffle(cells, r);
    var blocks = [];
    for (var k = 0; k < 9; k++) {
      var c = cells[k], front = (c[0] === 4 || c[1] === 4);
      var size = 0.62 + r() * 0.3;
      var hgt = front ? 0.35 + r() * 0.6 : 0.5 + r() * 1.7;
      blocks.push({ x: c[0] + (1 - size) / 2, y: c[1] + (1 - size) / 2, w: size, d: size, h: hgt, z: 0 });
    }
    // centre block carries the label
    var cb = { x: 1.6, y: 1.6, w: 1.8, d: 1.8, h: 1.15 + r() * 0.5, z: 0, main: true };
    blocks.push(cb);
    blocks.sort(function (p, q) { return (p.x + p.y + p.w / 2 + p.d / 2) - (q.x + q.y + q.w / 2 + q.d / 2); });

    var cols = { left: t.left, right: t.right, top: t.top, edge: t.edge };
    for (var m = 0; m < blocks.length; m++) {
      var bl = blocks[m];
      s += cuboid(P, bl.x, bl.y, bl.z, bl.w, bl.d, bl.h, cols);
      if (bl.main) s += isoLabel(P, bl.x + bl.w / 2, bl.y + bl.d / 2, bl.h, label, 22, t.ink, u);
    }
    return s + '</svg>';
  }

  /* ---------- style 1: layers (stacked slabs) ---------- */

  function styleLayers(id, t, r, label) {
    var u = 26, P = makeIso(200, 104, u), s = open(id, t) + sparkles(r, t, 8, 60);
    var sizes = [4.3, 3.7, 3.1, 2.5], gap = 0.85, thick = 0.34;
    var l0 = 26 + Math.floor(r() * 8);

    for (var k = 0; k < sizes.length; k++) {
      var sz = sizes[k], off = (sizes[0] - sz) / 2, z0 = k * gap;
      var cols = {
        top:   hsl(t.h2, 85, l0 + k * 11),
        left:  hsl(t.h, 78, l0 - 6 + k * 8),
        right: hsl(t.h2, 68, l0 - 12 + k * 6),
        edge:  hsl(t.h2, 95, 82)
      };
      s += cuboid(P, off, off, z0, sz, sz, thick, cols);
      if (k === sizes.length - 1) {
        s += isoLabel(P, off + sz / 2, off + sz / 2, z0 + thick, label, 20, t.ink, u);
      }
    }
    return s + '</svg>';
  }

  /* ---------- style 2: orbit (rings, planets, glowing core) ---------- */

  function styleOrbit(id, t, r, label) {
    var cx = 200, cy = 126;
    var defs =
      '<pattern id="' + id + 'dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="' + t.edge + '" opacity=".16"/></pattern>' +
      '<radialGradient id="' + id + 'core" cx="38%" cy="32%" r="80%"><stop offset="0" stop-color="' + t.edge + '"/><stop offset=".55" stop-color="' + t.top + '"/><stop offset="1" stop-color="' + t.left + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="' + t.glow + '" stop-opacity=".55"/><stop offset="1" stop-color="' + t.glow + '" stop-opacity="0"/></radialGradient>';
    var s = open(id, t, defs) + '<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'dots)"/>';
    s += sparkles(r, t, 6, 200);

    var tilt = -14 - Math.floor(r() * 12);
    var radii = [62, 104, 150];
    s += '<g transform="rotate(' + tilt + ' ' + cx + ' ' + cy + ')">';
    for (var i = 0; i < radii.length; i++) {
      var rx = radii[i], ry = rx * 0.4;
      s += '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + n(ry) + '" fill="none" stroke="' + t.edge +
           '" stroke-width="1" opacity="' + (i === 1 ? 0.45 : 0.22) + '"' + (i === 2 ? ' stroke-dasharray="3 6"' : '') + '/>';
      var ang = r() * Math.PI * 2, px = cx + rx * Math.cos(ang), py = cy + ry * Math.sin(ang);
      var pr = 5 + r() * 4;
      s += '<circle cx="' + n(px) + '" cy="' + n(py) + '" r="' + n(pr * 2.4) + '" fill="url(#' + id + 'halo)"/>' +
           '<circle cx="' + n(px) + '" cy="' + n(py) + '" r="' + n(pr) + '" fill="' + (i % 2 ? t.top : t.left) + '" stroke="' + t.edge + '" stroke-width=".8"/>';
      if (i === 0 && r() > 0.35) {
        var a2 = ang + Math.PI * (0.8 + r() * 0.4);
        s += '<circle cx="' + n(cx + rx * Math.cos(a2)) + '" cy="' + n(cy + ry * Math.sin(a2)) + '" r="3" fill="' + t.edge + '" opacity=".9"/>';
      }
    }
    s += '</g>';

    s += '<circle cx="' + cx + '" cy="' + cy + '" r="64" fill="url(#' + id + 'halo)"/>' +
         '<circle cx="' + cx + '" cy="' + cy + '" r="31" fill="url(#' + id + 'core)" stroke="' + t.edge + '" stroke-width="1" stroke-opacity=".6"/>' +
         '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" font-family="Manrope, system-ui, sans-serif" font-weight="800" font-size="22" fill="' + t.ink + '" letter-spacing="1">' + esc(label) + '</text>';
    return s + '</svg>';
  }

  /* ---------- style 3: ridges (layered horizon and sun) ---------- */

  function ridgePath(r, baseY, amp, steps) {
    var pts = [], i;
    for (i = 0; i <= steps; i++) pts.push([i * (W / steps), baseY - r() * amp]);
    var d = 'M0 ' + n(pts[0][1]);
    for (i = 0; i < pts.length - 1; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += 'Q' + n(pts[i][0]) + ' ' + n(pts[i][1]) + ' ' + n(mx) + ' ' + n(my);
    }
    d += 'L' + W + ' ' + n(pts[pts.length - 1][1]) + 'L' + W + ' ' + H + 'L0 ' + H + 'Z';
    return d;
  }

  function styleRidges(id, t, r, label) {
    var defs =
      '<radialGradient id="' + id + 'sun" cx="40%" cy="35%" r="80%"><stop offset="0" stop-color="' + t.edge + '"/><stop offset="1" stop-color="' + t.top + '"/></radialGradient>' +
      '<radialGradient id="' + id + 'halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="' + t.glow + '" stop-opacity=".6"/><stop offset="1" stop-color="' + t.glow + '" stop-opacity="0"/></radialGradient>';
    var s = open(id, t, defs) + sparkles(r, t, 9, 90);

    var sx = 90 + r() * 220, sy = 74 + r() * 16;
    s += '<circle cx="' + n(sx) + '" cy="' + n(sy) + '" r="78" fill="url(#' + id + 'halo)"/>' +
         '<circle cx="' + n(sx) + '" cy="' + n(sy) + '" r="35" fill="url(#' + id + 'sun)"/>' +
         '<text x="' + n(sx) + '" y="' + n(sy) + '" text-anchor="middle" dominant-baseline="central" font-family="Manrope, system-ui, sans-serif" font-weight="800" font-size="24" fill="' + t.ink + '" letter-spacing="1">' + esc(label) + '</text>';

    var layers = [
      { y: 150, amp: 46, fill: hsl(t.h2, 68, 50, 0.5), steps: 6 },
      { y: 178, amp: 40, fill: hsl(t.h, 58, 32, 0.85),  steps: 7 },
      { y: 204, amp: 34, fill: hsl(t.h, 52, 22),        steps: 8 },
      { y: 232, amp: 26, fill: hsl(t.h, 48, 13),        steps: 9 }
    ];
    for (var i = 0; i < layers.length; i++) {
      s += '<path d="' + ridgePath(r, layers[i].y, layers[i].amp, layers[i].steps) + '" fill="' + layers[i].fill + '"/>';
    }
    return s + '</svg>';
  }

  var RENDERERS = [styleCity, styleLayers, styleOrbit, styleRidges];

  /* ---------- public api ---------- */

  function pick(seed, opts) {
    opts = opts || {};
    var r = rng(hash(seed));
    var style = Math.floor(r() * RENDERERS.length);
    var pal = Math.floor(r() * PALETTES.length);
    if (opts.style != null) style = opts.style % RENDERERS.length;
    if (opts.palette != null) pal = opts.palette % PALETTES.length;
    return { r: r, style: style, palette: pal };
  }

  function svg(seed, opts) {
    opts = opts || {};
    var pk = pick(seed, opts);
    var label = opts.label != null ? opts.label : initials(seed);
    var id = 'ca' + hash(seed + '|' + pk.style + '|' + pk.palette).toString(36);
    return RENDERERS[pk.style](id, tones(PALETTES[pk.palette]), pk.r, label);
  }

  function dataUri(seed, opts) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(seed, opts));
  }

  function mount(el, seed, opts) {
    el.innerHTML = svg(seed, opts);
    return el;
  }

  root.CardArt = {
    svg: svg,
    dataUri: dataUri,
    mount: mount,
    initials: initials,
    styles: STYLE_NAMES,
    palettes: PALETTES.map(function (p) { return p.name; })
  };
})(typeof window !== 'undefined' ? window : this);
