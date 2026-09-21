"use strict";

/* =====================================================
   1) Paste your Supabase details here
   Supabase Dashboard > Project Settings > API
   ===================================================== */
const SUPABASE_URL = "https://kuvbvldmpjqafbvtuwqa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dmJ2bGRtcGpxYWZidnR1d3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5NDg0MzIsImV4cCI6MjEwNTUyNDQzMn0.lG0S-kGOxKOjdaZ-pw6I5C4qb_FQOv09xiiw2R4kxdA";
/* The anon key is meant to be public. Security comes from the
   database rules in supabase-setup.sql, not from hiding this key. */

const configured =
  !SUPABASE_URL.includes("PASTE_") && !SUPABASE_ANON_KEY.includes("PASTE_");
const sb = configured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* ---------- elements ---------- */
const $ = (id) => document.getElementById(id);
const grid = $("grid");
const empty = $("empty");
const countEl = $("count");
const notice = $("setupNotice");
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

let deleteId = null;
let toastTimer = null;

/* ---------- helpers ---------- */
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function clearError(el) {
  el.textContent = "";
  el.hidden = true;
}

// Only allow real http/https links
function safeUrl(value) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// Turn "example.com" into "https://example.com". Returns null if empty, false if invalid.
function normalizeUrl(value) {
  const v = (value || "").trim();
  if (!v) return null;
  const withProtocol = /^https?:\/\//i.test(v) ? v : "https://" + v;
  return safeUrl(withProtocol) || false;
}

function parseTags(value) {
  return (value || "")
    .split(",")
    .map((t) => t.trim().slice(0, 20))
    .filter(Boolean)
    .slice(0, 6);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ---------- rendering ---------- */
function showSkeletons() {
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const s = document.createElement("div");
    s.className = "card skeleton";
    grid.appendChild(s);
  }
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

  const img = safeUrl(p.image_url);
  if (img) {
    const im = document.createElement("img");
    im.className = "card-img";
    im.src = img;
    im.alt = "";
    im.loading = "lazy";
    im.referrerPolicy = "no-referrer";
    im.addEventListener("error", () => im.remove());
    card.appendChild(im);
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
  del.addEventListener("click", () => openDelete(p));
  foot.append(date, del);
  card.appendChild(foot);

  return card;
}

function render(projects) {
  grid.innerHTML = "";
  grid.setAttribute("aria-busy", "false");

  if (!projects.length) {
    empty.hidden = false;
    countEl.textContent = "";
    return;
  }
  empty.hidden = true;
  countEl.textContent =
    projects.length + (projects.length === 1 ? " project" : " projects");
  projects.forEach((p) => grid.appendChild(renderCard(p)));
}

/* ---------- data ---------- */
async function loadProjects() {
  if (!configured) {
    grid.innerHTML = "";
    grid.setAttribute("aria-busy", "false");
    notice.hidden = false;
    notice.textContent =
      "Setup needed: open script.js and paste your Supabase URL and anon key.";
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
      "Could not load projects. Check your Supabase URL, key and that supabase-setup.sql was run.";
    return;
  }
  notice.hidden = true;
  render(data || []);
}

/* ---------- add ---------- */
function openAdd() {
  if (!configured) {
    toast("Add your Supabase details in script.js first.");
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

/* ---------- delete ---------- */
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

  const { data, error } = await sb.rpc("delete_project", {
    p_id: deleteId,
    p_code: code,
  });

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

/* ---------- dialog close behaviour ---------- */
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

/* ---------- start ---------- */
$("openAdd").addEventListener("click", openAdd);
$("emptyAdd").addEventListener("click", openAdd);

// Refresh when you come back to the tab, so a project added on phone shows on PC
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadProjects();
});

showSkeletons();
loadProjects();
