# SoloKanban — GitHub Pages Deployment & Hosting Guide

This guide provides step-by-step instructions for deploying SoloKanban to **GitHub Pages**. 

SoloKanban is designed as a **local-first, zero-build, static web application**. It runs entirely in the browser without any custom server, backend API, build step, or cloud database.

---

## 1. Prerequisites

- A [GitHub Account](https://github.com).
- Git installed on your local computer.
- A **Chromium-based browser** (Google Chrome, Microsoft Edge, Opera, or Brave) to use the File System Access API for local workspace editing.

---

## 2. Step-by-Step Deployment Instructions

### Step 1: Create a GitHub Repository

1. Log into your GitHub account and navigate to [github.com/new](https://github.com/new).
2. Enter a repository name (e.g. `solo-kanban` or `solokanban`).
3. Choose **Public** (or Private if you have GitHub Pages enabled for private repos).
4. Do **NOT** initialize with a `.gitignore` or `README.md` if you are pushing your existing local folder.
5. Click **Create repository**.

---

### Step 2: Push SoloKanban Files to GitHub

Open a terminal in your SoloKanban project directory and run the following commands:

```bash
# 1. Initialize git repository
git init

# 2. Add all project files
git add .

# 3. Commit the code
git commit -m "Initial commit of SoloKanban v8.3 web app and SDKs"

# 4. Set main branch name
git branch -M main

# 5. Add remote GitHub origin (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/solo-kanban.git

# 6. Push to GitHub
git push -u origin main
```

---

### Step 3: Enable GitHub Pages

1. Navigate to your repository on GitHub.
2. Click on **Settings** (top right tab).
3. On the left sidebar, click on **Pages** (under the "Code and automation" section).
4. Under **Build and deployment**:
   - **Source**: Select **Deploy from a branch**.
   - **Branch**: Select `main` branch and `/ (root)` folder.
5. Click **Save**.

GitHub Pages will build and publish your site in under a minute.

---

### Step 4: Access Your Live SoloKanban App

After deployment finishes, GitHub Pages will display your published app URL:

```
https://YOUR_USERNAME.github.io/solo-kanban/
```

---

## 3. How to Use SoloKanban on GitHub Pages

1. **Open the GitHub Pages URL** in a Chromium-based browser (Chrome, Edge, Opera, Brave).
2. Click **📁 Open Workspace Folder**.
3. Select any local folder on your computer (e.g. `~/Documents/MyProjectImprovements`).
4. Grant the browser permission to edit files in that folder when prompted.
5. SoloKanban will initialize `.solokanban/`, `workspace.json`, `projects/`, and sub-board structures in your chosen folder.
6. Start creating project cards, feature cards, checklists, and moving cards across lists!

---

## 4. Why GitHub Pages + File System Access API?

| Feature | Description |
| --- | --- |
| **Zero Backend & Zero Cost** | Hosted for free on GitHub Pages as static HTML, CSS, and JS modules. |
| **Data Privacy & Control** | Your Kanban cards and project data never leave your local hard drive. |
| **Plaintext Markdown Source of Truth** | Both humans and AI agents can read and edit `.md` files directly in VS Code, Obsidian, or terminal text editors. |
| **HTTPS Security Guarantee** | Browsers require secure HTTPS contexts (like `https://*.github.io` or `http://localhost`) to enable the File System Access API. |

---

## 5. Using AI Agents with your Workspace

SoloKanban automatically places zero-dependency Python and JavaScript SDKs plus agent skills inside every workspace folder under `.solokanban/`:

- `.solokanban/sdk/solokanban.py` — Python SDK
- `.solokanban/sdk/solokanban.js` — JavaScript SDK
- `.solokanban/skills/solokanban-overview.md` — Agent Overview Skill
- `.solokanban/skills/solokanban-sdk.md` — Agent SDK Reference Skill

AI agents (e.g. Antigravity, Claude Code, Cursor, GPT-4) pointing at your local workspace directory can automatically read these skill files and manipulate cards programmatically.

---

## 6. Frequently Asked Questions & Troubleshooting

### Why does SoloKanban require Chromium?
The File System Access API (`showDirectoryPicker()`) is natively supported in Chromium browsers. In non-Chromium browsers (Firefox, Safari), a banner informs users of the requirement while noting that card files remain manually editable via text editors.

### Is my data uploaded to GitHub?
**No.** GitHub Pages hosts only the open-source client UI files (`index.html`, `index.css`, `js/*`). The workspace data you open via the folder picker resides strictly on your local disk.

### How do SDK auto-updates work?
When the app opens a workspace, `js/sdk-update.js` checks `version.json` hosted on your GitHub Pages site. If a newer standard SDK or skill file is available, it downloads and verifies the file's SHA-256 hash before updating local workspace copies safely.
