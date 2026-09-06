/* =========================================
   PROJECT ATLAS — INTERACTION LAYER
========================================= */

const PROJECTS_PER_PAGE = 9;
const STORAGE_KEY = "projects";

const $ = (selector) => document.querySelector(selector);

const addBtn = $("#addBtn");
const themeToggle = $("#themeToggle");
const themeLabel = themeToggle.querySelector(".theme-label");
const THEME_KEY = "project-atlas-theme";
const emptyAddBtn = $("#emptyAddBtn");
const modal = $("#modal");
const closeBtn = $("#close");
const projectForm = $("#projectForm");
const projectIdInput = $("#projectId");
const ownerNameInput = $("#ownerName");
const projectNameInput = $("#projectName");
const urlInput = $("#url");
const errorBox = $("#error");
const projectList = $("#projectList");
const emptyState = $("#emptyState");
const pagination = $("#pagination");
const projectCount = $("#projectCount");
const projectCountInline = $("#projectCountInline");
const showingCount = $("#showingCount");
const showingCountInline = $("#showingCountInline");
const searchInput = $("#searchInput");
const clearSearch = $("#clearSearch");
const searchResultText = $("#searchResultText");

let currentPage = 1;
let lastFocusedElement = null;

function getStoredProjects() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!Array.isArray(saved)) return [];

        const migrated = saved.map((project, index) => ({
            name: String(project.projectName ? project.name : (project.owner || project.name || "Unknown maker")).trim(),
            id: normalizeId(project.id) || generateFallbackId(index),
            projectName: String(project.projectName || project.name || "Untitled project").trim(),
            url: String(project.url || "#").trim(),
        }));

        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
    } catch {
        return [];
    }
}

let projects = getStoredProjects();

function saveProjects() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function normalizeId(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "-")
        .replace(/[^A-Z0-9_-]/g, "")
        .slice(0, 24);
}

function generateFallbackId(index = projects.length) {
    return `PRJ-${String(index + 1).padStart(3, "0")}`;
}

function getNextProjectId() {
    const usedIds = new Set(projects.map((project) => project.id));
    let counter = projects.length + 1;
    let candidate = `PRJ-${String(counter).padStart(3, "0")}`;

    while (usedIds.has(candidate)) {
        counter += 1;
        candidate = `PRJ-${String(counter).padStart(3, "0")}`;
    }

    return candidate;
}

function applyTheme(theme, persist = true) {
    const isDay = theme === "day";
    document.body.dataset.theme = isDay ? "day" : "night";
    themeToggle.setAttribute("aria-pressed", String(isDay));
    themeToggle.setAttribute("aria-label", isDay ? "Switch to night mode" : "Switch to day mode");
    themeLabel.textContent = isDay ? "Day" : "Night";
    if (persist) localStorage.setItem(THEME_KEY, isDay ? "day" : "night");
}

function toggleTheme() {
    applyTheme(document.body.dataset.theme === "day" ? "night" : "day");
}

function openModal() {
    lastFocusedElement = document.activeElement;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add("is-open"));
    document.body.classList.add("modal-open");
    projectIdInput.value = getNextProjectId();
    setTimeout(() => nameInput.focus(), 180);
}

function closeModal() {
    modal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    setTimeout(() => {
        modal.hidden = true;
        projectForm.reset();
        hideError();
        if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    }, 220);
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function hideError() {
    errorBox.textContent = "";
    errorBox.hidden = true;
}

function updateClearButton() {
    clearSearch.hidden = searchInput.value.trim() === "";
}

function getFilteredProjects() {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return projects;

    return projects.filter((project) => {
        return project.name.toLowerCase().includes(query)
            || project.id.toLowerCase().includes(query)
            || project.projectName.toLowerCase().includes(query);
    });
}

function render() {
    const filteredProjects = getFilteredProjects();
    const totalPages = Math.max(1, Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE));

    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * PROJECTS_PER_PAGE;
    const pageProjects = filteredProjects.slice(startIndex, startIndex + PROJECTS_PER_PAGE);
    const hasProjects = filteredProjects.length > 0;

    projectCount.textContent = projects.length;
    projectCountInline.textContent = projects.length;
    showingCount.textContent = hasProjects ? pageProjects.length : 0;
    showingCountInline.textContent = hasProjects ? pageProjects.length : 0;
    projectList.innerHTML = "";
    pagination.innerHTML = "";
    emptyState.hidden = hasProjects;

    if (searchInput.value.trim()) {
        searchResultText.textContent = `${filteredProjects.length} result${filteredProjects.length === 1 ? "" : "s"} found`;
    } else {
        searchResultText.textContent = "";
    }

    if (!hasProjects) return;

    pageProjects.forEach((project, index) => {
        projectList.appendChild(createProjectCard(project, startIndex + index));
    });

    bindCardMotion();
    renderPagination(totalPages);
}

function createProjectCard(project, index) {
    const card = document.createElement("article");
    card.className = "project-card";
    card.style.setProperty("--card-delay", `${Math.min(index, 8) * 55}ms`);
    card.innerHTML = `
        <div class="card-topline">
            <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
            <button class="delete-btn" type="button" title="Delete project" aria-label="Delete ${escapeHTML(project.name)}" data-index="${index}">×</button>
        </div>
        <div class="card-visual" aria-hidden="true">
            <span class="visual-orbit visual-orbit-one"></span>
            <span class="visual-orbit visual-orbit-two"></span>
            <span class="visual-star">✦</span>
        </div>
        <div class="card-meta card-meta-stack">
            <span class="id-label">Name</span>
            <span class="project-owner">${escapeHTML(project.name)}</span>
        </div>
        <div class="card-meta">
            <span class="id-label">ID</span>
            <span class="project-id">${escapeHTML(project.id)}</span>
        </div>
        <h3 class="project-name"><span class="project-name-label">Project Name</span><span class="project-name-value">${escapeHTML(project.projectName)}</span></h3>
        <div class="card-footer">
            <span class="card-type">PROJECT ENTRY</span>
            <a class="open-btn" href="${escapeAttribute(project.url)}" target="_blank" rel="noopener noreferrer">Open <span aria-hidden="true">↗</span></a>
        </div>
    `;

    card.querySelector(".delete-btn").addEventListener("click", () => deleteProject(index));
    return card;
}

function bindCardMotion() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    projectList.querySelectorAll(".project-card").forEach((card) => {
        card.addEventListener("pointermove", (event) => {
            const bounds = card.getBoundingClientRect();
            const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -5;
            const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 6;
            card.style.setProperty("--rotate-x", `${rotateX}deg`);
            card.style.setProperty("--rotate-y", `${rotateY}deg`);
        });

        card.addEventListener("pointerleave", () => {
            card.style.setProperty("--rotate-x", "0deg");
            card.style.setProperty("--rotate-y", "0deg");
        });
    });
}

function deleteProject(index) {
    const project = projects[index];
    if (!project) return;

    if (!window.confirm(`Delete “${project.projectName}” (${project.id}) from the collection?`)) return;
    projects.splice(index, 1);
    saveProjects();
    render();
}

function createPageButton(label, page, disabled = false, active = false) {
    const button = document.createElement("button");
    button.className = `page-btn${active ? " active" : ""}`;
    button.type = "button";
    button.textContent = label;
    button.disabled = disabled;
    button.setAttribute("aria-label", `Go to page ${page}`);
    button.addEventListener("click", () => {
        currentPage = page;
        render();
        window.scrollTo({ top: document.querySelector("#projects").offsetTop - 30, behavior: "smooth" });
    });
    return button;
}

function renderPagination(totalPages) {
    if (totalPages <= 1) return;

    pagination.appendChild(createPageButton("←", currentPage - 1, currentPage === 1));

    getPageNumbers(currentPage, totalPages).forEach((page) => {
        if (page === "…") {
            const dots = document.createElement("span");
            dots.className = "page-dots";
            dots.textContent = "…";
            pagination.appendChild(dots);
            return;
        }
        pagination.appendChild(createPageButton(page, page, false, page === currentPage));
    });

    pagination.appendChild(createPageButton("→", currentPage + 1, currentPage === totalPages));
}

function getPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

    const pages = [1];
    if (current > 4) pages.push("…");
    for (let page = Math.max(2, current - 1); page <= Math.min(total - 1, current + 1); page += 1) pages.push(page);
    if (current < total - 3) pages.push("…");
    pages.push(total);
    return pages;
}

function handleSubmit(event) {
    event.preventDefault();
    hideError();

    const name = ownerNameInput.value.trim();
    const id = normalizeId(projectIdInput.value);
    const projectName = projectNameInput.value.trim();
    const url = urlInput.value.trim();

    if (!name) {
        showError("Please enter a name.");
        ownerNameInput.focus();
        return;
    }

    if (!id) {
        showError("Please enter a project ID.");
        projectIdInput.focus();
        return;
    }

    if (projects.some((project) => project.id === id)) {
        showError("That project ID already exists. Please choose another one.");
        projectIdInput.focus();
        return;
    }

    if (!projectName) {
        showError("Please enter the project name.");
        projectNameInput.focus();
        return;
    }

    let validURL;
    try {
        validURL = new URL(url);
    } catch {
        showError("Please enter a valid URL, such as https://example.com");
        urlInput.focus();
        return;
    }

    if (!['http:', 'https:'].includes(validURL.protocol)) {
        showError("Project URL must start with http:// or https://");
        urlInput.focus();
        return;
    }

    projects.push({ name, id, projectName, url: validURL.href });
    saveProjects();
    currentPage = Math.ceil(projects.length / PROJECTS_PER_PAGE);
    searchInput.value = "";
    updateClearButton();
    render();
    closeModal();
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
    return escapeHTML(value);
}

addBtn.addEventListener("click", openModal);
themeToggle.addEventListener("click", toggleTheme);
applyTheme(localStorage.getItem(THEME_KEY) || "night", false);
emptyAddBtn.addEventListener("click", openModal);
closeBtn.addEventListener("click", closeModal);
projectForm.addEventListener("submit", handleSubmit);

modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal='true']")) closeModal();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
});

searchInput.addEventListener("input", () => {
    currentPage = 1;
    updateClearButton();
    render();
});

clearSearch.addEventListener("click", () => {
    searchInput.value = "";
    currentPage = 1;
    updateClearButton();
    render();
    searchInput.focus();
});

updateClearButton();
render();
