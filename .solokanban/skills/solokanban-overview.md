# SoloKanban — Agent Overview Skill

## Introduction
SoloKanban is a local-first, agent-native Kanban system running directly on plain Markdown files with YAML frontmatter.

## Storage Architecture
- **Workspace Config:** `/workspace.json`
- **Configuration & SDKs:** `/.solokanban/`
- **Projects Board:** `/projects/PROJ-xxxx.md`
- **Project Sub-Boards:** `/<PROJECT_ID>/project.json` and `/<PROJECT_ID>/features/`

## Core Rules for AI Agents
1. **Source of Truth:** Markdown files with YAML frontmatter are the authoritative source of truth.
2. **List Assignment:** `project.json` `featureOrder` is authoritative for list order; card frontmatter `listId` reflects list assignment.
3. **Canonical Content Hashing:** `meta.contentHash` is computed deterministically. Always use standard SDK functions or canonical hashing logic.
4. **Presence Signaling:** Always use `edit_session` or write per-actor presence files in `/.solokanban/presence/<FEATURE_ID>/<ACTOR_ID>.json`.
