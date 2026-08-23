# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: a-workspace-setup.spec.js >> US-SETUP-4: non-Chromium user sees stronger warning banner with manual editing note
- Location: tests/e2e/a-workspace-setup.spec.js:93:1

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]: ⚡
        - heading "SoloKanban" [level=1] [ref=e6]
      - navigation [ref=e7]:
        - generic [ref=e8]: Workspace Board
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]: 🔍
        - textbox "Filter cards (Title, Body, ID)..." [ref=e12]
      - combobox "Group board by swimlanes" [ref=e14] [cursor=pointer]:
        - 'option "Swimlanes: Off" [selected]'
        - option "By Assignee"
        - option "By Priority"
        - option "By Type"
      - generic [ref=e15]:
        - button "＋ New Card" [ref=e16] [cursor=pointer]
        - button "📁 Open Folder" [active] [ref=e17] [cursor=pointer]
        - button "⚙" [ref=e18] [cursor=pointer]
  - main [ref=e19]:
    - generic [ref=e20]:
      - generic [ref=e21]: 📁
      - heading "Welcome to SoloKanban" [level=2] [ref=e22]
      - paragraph [ref=e23]: Select a local workspace folder to start managing project & feature cards with local-first file system access.
      - button "Choose Local Workspace Folder..." [ref=e24] [cursor=pointer]
```