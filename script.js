"use strict";

/* Supabase details live in config.js (paste your key there). */
const CFG = window.APP_CONFIG || {};
const configured =
  !!CFG.SUPABASE_URL &&
  !!CFG.SUPABASE_ANON_KEY &&
  !CFG.SUPABASE_URL.includes("PASTE_") &&
  !CFG.SUPABASE_ANON_KEY.includes("PASTE_");
const sb = configured
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;

/* ---------- elements ---------- */
const $ = (id) => document.getElementById(id);
const grid = $("grid");
const empty = $("empty");
const noMatch = $("noMatch");
const toolbar = $("toolbar");
const countEl = $("count");
const notice = $("setupNotice");
const searchInput = $("search");
const tagWrap = $("tagFilters");
const addDialog = $("addDialog");
const addForm = $("addForm");
const addError = $("addError");
const addSubmit = $("addSubmit");
const deleteDialog = $("deleteDialog");
const deleteForm = $("deleteForm");
const deleteError = $("delError");
const deleteSubmit = $("delSubmit");
const delName = $("delName");
const toastEl = $("toast");

let allProjects = [];
let query = "";
let activeTag = "";
let deleteId = null;
let toastTimer = null;

/* =====================================================
   Theme (light / dark)
   ===================================================== */
const root = document.documentElement;
const themeBtn = $("themeToggle");
const metaTheme = $("metaTheme");

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
  themeBtn.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
  );
  if (metaTheme) metaTheme.setAttribute("content", theme === "dark" ? "#0C111C" : "#F6F7F9");
}

themeBtn.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch (e) {}
});

applyTheme(root.getAttribute("data-theme") || "light");

// Follow the device setting until the visitor picks a theme themselves
try {
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem("theme")) applyTheme(e.matches ? "dark" : "light");
  });
} catch (e) {}

$("year").textContent = new Date().getFullYear();

/* =====================================================
   Helpers
   ===================================================== */
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
}
function showError(el, message) { el.textContent = message; el.hidden = false; }
function clearError(el) { el.textContent = ""; el.hidden = true; }

// Only real http/https links are allowed
function safeUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch { return null; }
}
// "example.com" -> "https://example.com". null = empty, false = invalid.
function normalizeUrl(value) {
  const v = (value || "").trim();
  if (!v) return null;
  const withProtocol = /^https?:\/\//i.test(v) ? v : "https://" + v;
  return safeUrl(withProtocol) || false;
}
function parseTags(value) {
  return (value || "").split(",").map((t) => t.trim().slice(0, 20)).filter(Boolean).slice(0, 6);
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
function hueFor(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}
function initialsFor(title) {
  return title.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/* =====================================================
   Rendering
   ===================================================== */
function showSkeletons() {
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("div");
    s.className = "card skeleton";
    grid.appendChild(s);
  }
}

function makeTile(title) {
  const tile = document.createElement("div");
  tile.className = "card-tile";
  tile.style.setProperty("--h", hueFor(title));
  tile.setAttribute("aria-hidden", "true");
  tile.textContent = initialsFor(title);
  return tile;
}

function makeLink(label, href, primary) {
  const a = document.createElement("a");
  a.className = "btn btn-small" + (primary ? " btn-primary" : "");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = label;
  return a;
}

function renderCard(p) {
  const card = document.createElement("article");
  card.className = "card";

  const imgUrl = safeUrl(p.image_url);
  if (imgUrl) {
    const im = document.createElement("img");
    im.className = "card-img";
    im.src = imgUrl;
    im.alt = "";
    im.loading = "lazy";
    im.referrerPolicy = "no-referrer";
    im.addEventListener("error", () => im.replaceWith(makeTile(p.title)));
    card.appendChild(im);
  } else {
    card.appendChild(makeTile(p.title));
  }

  const body = document.createElement("div");
  body.className = "card-body";

  const h = document.createElement("h2");
  h.textContent = p.title;
  body.appendChild(h);

  if (p.description) {
    const d = document.createElement("p");
    d.textContent = p.description;
    body.appendChild(d);
  }

  if (p.tags && p.tags.length) {
    const ul = document.createElement("ul");
    ul.className = "tags";
    p.tags.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  const live = safeUrl(p.live_url);
  const repo = safeUrl(p.repo_url);
  if (live || repo) {
    const links = document.createElement("div");
    links.className = "card-links";
    if (live) links.appendChild(makeLink("Open project", live, true));
    if (repo) links.appendChild(makeLink("GitHub", repo, false));
    body.appendChild(links);
  }
  card.appendChild(body);

  const foot = document.createElement("div");
  foot.className = "card-foot";
  const date = document.createElement("span");
  date.textContent = formatDate(p.created_at);
  const del = document.createElement("button");
  del.type = "button";
  del.className = "link-delete";
  del.textContent = "Delete";
  del.setAttribute("aria-label", "Delete " + p.title);
  del.addEventListener("click", () => openDelete(p));
  foot.append(date, del);
  card.appendChild(foot);

  return card;
}

function renderTagChips() {
  const tags = [...new Set(allProjects.flatMap((p) => p.tags || []))].sort((a, b) =>
    a.localeCompare(b)
  );
  if (activeTag && !tags.includes(activeTag)) activeTag = "";
  tagWrap.innerHTML = "";
  if (!tags.length) return;

  const make = (label, value) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(activeTag === value));
    b.addEventListener("click", () => {
      activeTag = value;
      renderTagChips();
      applyFilters();
    });
    return b;
  };
  tagWrap.appendChild(make("All", ""));
  tags.forEach((t) => tagWrap.appendChild(make(t, t)));
}

function applyFilters() {
  grid.setAttribute("aria-busy", "false");

  if (!allProjects.length) {
    grid.innerHTML = "";
    toolbar.hidden = true;
    noMatch.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  toolbar.hidden = false;

  const q = query.trim().toLowerCase();
  const list = allProjects.filter((p) => {
    const tagOk = !activeTag || (p.tags || []).includes(activeTag);
    const hay = (p.title + " " + (p.description || "") + " " + (p.tags || []).join(" ")).toLowerCase();
    return tagOk && (!q || hay.includes(q));
  });

  grid.innerHTML = "";
  list.forEach((p) => grid.appendChild(renderCard(p)));
  noMatch.hidden = list.length > 0;

  const total = allProjects.length;
  const noun = total === 1 ? "project" : "projects";
  countEl.textContent = list.length === total ? total + " " + noun : list.length + " of " + total + " " + noun;
}

searchInput.addEventListener("input", () => {
  query = searchInput.value;
  applyFilters();
});

/* =====================================================
   Data
   ===================================================== */
async function loadProjects() {
  if (!configured) {
    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "false");
    notice.hidden = false;
    notice.textContent = "Setup needed: open config.js and paste your Supabase anon key.";
    return;
  }
  const { data, error } = await sb
    .from("projects")
    .select("id,title,description,live_url,repo_url,image_url,tags,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "false");
    notice.hidden = false;
    notice.textContent =
      "Could not load projects. Check config.js (URL and key) and that supabase-setup.sql was run.";
    return;
  }
  notice.hidden = true;
  allProjects = data || [];
  renderTagChips();
  applyFilters();
}

/* =====================================================
   Add (needs security code)
   ===================================================== */
function openAdd() {
  if (!configured) {
    toast("Add your Supabase key in config.js first.");
    return;
  }
  clearError(addError);
  addDialog.showModal();
  addForm.elements.title.focus();
}

addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(addError);

  const f = addForm.elements;
  const title = f.title.value.trim();
  const code = f.code.value;

  if (!title) return showError(addError, "Please enter a project name.");
  if (!code) return showError(addError, "Please enter the security code.");

  const live = normalizeUrl(f.live_url.value);
  const repo = normalizeUrl(f.repo_url.value);
  const image = normalizeUrl(f.image_url.value);
  if (live === false || repo === false || image === false) {
    return showError(addError, "One of the links is not valid. Check it and try again.");
  }

  addSubmit.disabled = true;
  addSubmit.textContent = "Adding...";

  const { data, error } = await sb.rpc("add_project", {
    p_code: code,
    p_title: title,
    p_description: f.description.value.trim() || null,
    p_live_url: live,
    p_repo_url: repo,
    p_image_url: image,
    p_tags: parseTags(f.tags.value),
  });

  addSubmit.disabled = false;
  addSubmit.textContent = "Add to collection";

  if (error) return showError(addError, "Could not add the project. Please try again.");
  if (data !== true) {
    f.code.value = "";
    f.code.focus();
    return showError(addError, "Wrong security code. The project was not added.");
  }

  addDialog.close();
  toast("Added to collection");
  loadProjects();
});

/* =====================================================
   Delete (needs security code)
   ===================================================== */
function openDelete(project) {
  deleteId = project.id;
  delName.textContent = project.title;
  deleteForm.reset();
  clearError(deleteError);
  deleteDialog.showModal();
  $("delCode").focus();
}

deleteForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(deleteError);
  const code = $("delCode").value;
  if (!code) return showError(deleteError, "Please enter the security code.");

  deleteSubmit.disabled = true;
  deleteSubmit.textContent = "Deleting...";

  const { data, error } = await sb.rpc("delete_project", { p_id: deleteId, p_code: code });

  deleteSubmit.disabled = false;
  deleteSubmit.textContent = "Delete project";

  if (error) return showError(deleteError, "Could not delete. Please try again.");
  if (data !== true) {
    $("delCode").value = "";
    $("delCode").focus();
    return showError(deleteError, "Wrong security code. The project was not deleted.");
  }

  deleteDialog.close();
  toast("Project deleted");
  loadProjects();
});

/* =====================================================
   Dialog close behaviour
   ===================================================== */
[addDialog, deleteDialog].forEach((dlg) => {
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.hasAttribute("data-close")) dlg.close();
  });
  dlg.addEventListener("close", () => {
    const form = dlg.querySelector("form");
    if (form) form.reset();
    dlg.querySelectorAll(".form-error").forEach(clearError);
  });
});

/* =====================================================
   Start
   ===================================================== */
$("openAdd").addEventListener("click", openAdd);
$("emptyAdd").addEventListener("click", openAdd);

// Refresh when you come back to the tab, so a project added on phone shows on PC
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadProjects();
});

showSkeletons();
loadProjects();
