/**
 * SoloKanban System Defaults & Initial Configurations
 */

export const DEFAULT_FEATURE_TYPES = [
  {
    id: "project",
    name: "Project Card",
    description: "Workspace-level project card representing a distinct sub-project board.",
    color: "#6c5ce7",
    frontmatterFields: [
      { key: "projectId", label: "Project Identifier Code", type: "text", required: true, cardVisible: true },
      { key: "owner", label: "Owner / Lead", type: "text", required: false, cardVisible: true },
      { key: "status", label: "Status", type: "text", required: false, default: "active", cardVisible: true }
    ],
    bodySections: [
      { id: "description", label: "Project Summary", type: "markdown", required: true, placeholder: "Brief overview of the project goal..." },
      { id: "scope", label: "Scope & Boundaries", type: "markdown", required: false, placeholder: "Key deliverables and non-goals..." }
    ]
  },
  {
    id: "feature",
    name: "Feature / Capability",
    description: "New capability, functionality, or feature addition.",
    color: "#0984e3",
    frontmatterFields: [
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high", "critical"], required: true, default: "medium", cardVisible: true },
      { key: "assignee", label: "Assignee", type: "text", required: false, cardVisible: true },
      { key: "dueDate", label: "Due Date", type: "text", required: false, cardVisible: true },
      { key: "storyPoints", label: "Story Points", type: "text", required: false, cardVisible: true }
    ],
    bodySections: [
      { id: "description", label: "Feature Specification", type: "markdown", required: true, placeholder: "Describe the desired capability..." },
      { id: "acceptance", label: "Acceptance Criteria", type: "checklist", required: true, placeholder: "Items to complete before done..." },
      { id: "validation", label: "Validation & Testing", type: "markdown", required: false, placeholder: "How to test this feature..." }
    ]
  },
  {
    id: "bugfix",
    name: "Bug Fix / Defect",
    description: "Correction of unintended behavior or system defect.",
    color: "#d63031",
    frontmatterFields: [
      { key: "priority", label: "Severity", type: "select", options: ["low", "medium", "high", "critical"], required: true, default: "high", cardVisible: true },
      { key: "assignee", label: "Assignee", type: "text", required: false, cardVisible: true },
      { key: "dueDate", label: "Target Fix Date", type: "text", required: false, cardVisible: true }
    ],
    bodySections: [
      { id: "problem", label: "Bug Description & Impact", type: "markdown", required: true, placeholder: "What went wrong?" },
      { id: "steps", label: "Reproduction Steps", type: "markdown", required: true, placeholder: "1. Step one\n2. Step two" },
      { id: "solution", label: "Proposed Fix & Resolution", type: "markdown", required: false, placeholder: "How to fix the defect..." }
    ]
  },
  {
    id: "architecture",
    name: "Architecture & Refactoring",
    description: "Structural code changes, refactoring, and tech debt reduction.",
    color: "#e17055",
    frontmatterFields: [
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high", "critical"], required: true, default: "medium", cardVisible: true },
      { key: "assignee", label: "Lead Architect", type: "text", required: false, cardVisible: true }
    ],
    bodySections: [
      { id: "context", label: "Current Limitations", type: "markdown", required: true, placeholder: "Why is refactoring needed?" },
      { id: "design", label: "Proposed Design", type: "markdown", required: true, placeholder: "Architectural overview and trade-offs..." },
      { id: "checklist", label: "Refactoring Steps", type: "checklist", required: false, placeholder: "Components to refactor..." }
    ]
  },
  {
    id: "documentation",
    name: "Documentation & Specs",
    description: "Guides, API documentation, architecture specs, and READMEs.",
    color: "#00b894",
    frontmatterFields: [
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"], required: false, default: "low", cardVisible: true },
      { key: "assignee", label: "Author", type: "text", required: false, cardVisible: true }
    ],
    bodySections: [
      { id: "overview", label: "Documentation Scope", type: "markdown", required: true, placeholder: "What docs need updating?" },
      { id: "content", label: "Draft Content / Outline", type: "markdown", required: false, placeholder: "Outline of changes..." }
    ]
  },
  {
    id: "process",
    name: "Process & Workflow",
    description: "DevOps, CI/CD pipeline, toolchain, and operational workflow improvements.",
    color: "#fdcb6e",
    frontmatterFields: [
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high"], required: false, default: "medium", cardVisible: true },
      { key: "assignee", label: "Owner", type: "text", required: false, cardVisible: true }
    ],
    bodySections: [
      { id: "goal", label: "Process Goal", type: "markdown", required: true, placeholder: "What process are we improving?" },
      { id: "implementation", label: "Implementation Steps", type: "checklist", required: true, placeholder: "Steps to implement..." }
    ]
  },
  {
    id: "prompt-engineering",
    name: "Agent Skill & Prompt Tuning",
    description: "Refining agent instructions, prompt templates, and skills.",
    color: "#a29bfe",
    frontmatterFields: [
      { key: "priority", label: "Priority", type: "select", options: ["low", "medium", "high", "critical"], required: true, default: "high", cardVisible: true },
      { key: "assignee", label: "Agent / Human Lead", type: "text", required: false, cardVisible: true }
    ],
    bodySections: [
      { id: "target", label: "Target Agent / Skill", type: "markdown", required: true, placeholder: "Which agent skill is being tuned?" },
      { id: "changes", label: "Proposed Instruction Updates", type: "markdown", required: true, placeholder: "Prompt adjustments..." },
      { id: "eval", label: "Evaluation Checklist", type: "checklist", required: false, placeholder: "Tests to confirm agent behavior..." }
    ]
  }
];

export const DEFAULT_LABELS = [
  { id: "lbl-core", name: "Core", color: "#6c5ce7" },
  { id: "lbl-ui", name: "UI/UX", color: "#0984e3" },
  { id: "lbl-agent", name: "Agent Native", color: "#a29bfe" },
  { id: "lbl-security", name: "Security", color: "#d63031" },
  { id: "lbl-performance", name: "Performance", color: "#e17055" },
  { id: "lbl-legal", name: "Legal/Compliance", color: "#00b894" }
];

export const DEFAULT_FIELDS = [
  {
    key: "storyPoints",
    label: "Story Points",
    type: "text",
    cardVisible: true
  },
  {
    key: "impact",
    label: "Impact Level",
    type: "select",
    options: [
      { value: "minor", label: "Minor", color: "#b2bec3" },
      { value: "major", label: "Major", color: "#fdcb6e" },
      { value: "critical", label: "Critical", color: "#d63031" }
    ],
    cardVisible: true
  }
];

export const DEFAULT_PREFERENCES = {
  board: {
    background: "#0f172a",
    swimlaneBy: null,
    collapsedLists: [],
    columnStats: ["count", "storyPoints"]
  },
  card: {
    staleAfterDays: 7,
    showStoryPoints: true,
    showAvatar: true,
    showSubtaskBadge: true,
    showAgentBadge: true
  },
  ui: {
    darkMode: true,
    firstRunBannerDismissed: false
  }
};

export const DEFAULT_WORKSPACE_CONFIG = {
  id: "workspace",
  name: "SoloKanban Workspace",
  lists: [
    { id: "backlog", name: "Backlog" },
    { id: "in-progress", name: "In Progress" },
    { id: "done", name: "Done", done: true }
  ],
  featureOrder: {
    backlog: [],
    "in-progress": [],
    done: []
  },
  layout: {
    dividers: []
  }
};

export const DEFAULT_PROJECT_CONFIG = {
  lists: [
    { id: "backlog", name: "Backlog" },
    { id: "in-progress", name: "In Progress" },
    { id: "done", name: "Done", done: true }
  ],
  featureOrder: {
    backlog: [],
    "in-progress": [],
    done: []
  },
  layout: {
    dividers: []
  }
};
