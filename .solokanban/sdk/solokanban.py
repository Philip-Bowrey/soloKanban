"""
SoloKanban Standard Python SDK (v8.3)
Zero-dependency Python SDK for AI Agents and automation scripts operating on SoloKanban workspaces.
"""

import os
import sys
import json
import re
import hashlib
import time
import contextlib
from typing import Dict, Any, Optional, List

class ConflictException(Exception):
    """Raised when an edit collision or stale revision write occurs."""
    pass

def normalize_line_endings(text: str) -> str:
    if not text:
        return ""
    return text.replace("\r\n", "\n").replace("\r", "\n")

def parse_yaml(yaml_str: str) -> Dict[str, Any]:
    if not yaml_str:
        return {}
    res = {}
    lines = normalize_line_endings(yaml_str).split("\n")
    for line in lines:
        match = re.match(r"^([a-zA-Z0-9_\-\.]+)\s*:\s*(.*)$", line)
        if match:
            key = match.group(1)
            val = match.group(2).strip()
            if val.startswith('"') and val.endswith('"'):
                val = val[1:-1].replace('\\"', '"')
            elif val.startswith("'") and val.endswith("'"):
                val = val[1:-1].replace("\\'", "'")
            elif val == "true":
                val = True
            elif val == "false":
                val = False
            elif val in ("null", "~", ""):
                val = None
            elif re.match(r"^-?\d+$", val):
                val = int(val)
            elif re.match(r"^-?\d+\.\d+$", val):
                val = float(val)
            res[key] = val
    return res

def serialize_yaml(data: Dict[str, Any]) -> str:
    if not data:
        return ""
    keys = sorted(data.keys())
    lines = []
    for k in keys:
        v = data[k]
        if v is None:
            lines.append(f"{k}: null")
        elif isinstance(v, bool):
            lines.append(f"{k}: {'true' if v else 'false'}")
        elif isinstance(v, (int, float)):
            lines.append(f"{k}: {v}")
        elif isinstance(v, str):
            if ":" in v or "\n" in v or '"' in v or v == "":
                escaped = v.replace('"', '\\"')
                lines.append(f'{k}: "{escaped}"')
            else:
                lines.append(f"{k}: {v}")
        else:
            lines.append(f"{k}: {json.dumps(v)}")
    return "\n".join(lines)

def parse_card_file(content: str) -> Dict[str, Any]:
    norm = normalize_line_endings(content)
    if not norm.startswith("---"):
        return {"frontmatter": {}, "body": norm}
    end_idx = norm.find("\n---", 3)
    if end_idx == -1:
        return {"frontmatter": {}, "body": norm}
    raw_yaml = norm[4:end_idx].strip()
    body = norm[end_idx + 4:].lstrip("\n")
    return {"frontmatter": parse_yaml(raw_yaml), "body": body}

def filter_volatile_meta(fm: Dict[str, Any]) -> Dict[str, Any]:
    copy_fm = json.loads(json.dumps(fm))
    if "meta" in copy_fm and isinstance(copy_fm["meta"], dict):
        copy_fm["meta"].pop("revision", None)
        copy_fm["meta"].pop("contentHash", None)
        copy_fm["meta"].pop("updatedAt", None)
        copy_fm["meta"].pop("updatedBy", None)
        if not copy_fm["meta"]:
            copy_fm.pop("meta", None)
    return copy_fm

def compute_content_hash(frontmatter: Dict[str, Any], body: str) -> str:
    filtered = filter_volatile_meta(frontmatter)
    yaml_str = serialize_yaml(filtered)
    norm_body = "\n".join([line.rstrip() for line in normalize_line_endings(body).split("\n")]).rstrip()
    canonical = f"{yaml_str}\n---\n{norm_body}"
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class SoloKanbanClient:
    def __init__(self, workspace_path: str, actor_id: Optional[str] = None):
        self.workspace_path = os.path.abspath(workspace_path)
        self.actor_id = actor_id or f"agent:python-sdk-{os.getpid()}"

    def get_card(self, project_id: str, card_id: str) -> Optional[Dict[str, Any]]:
        if project_id == "projects":
            file_path = os.path.join(self.workspace_path, "projects", f"{card_id}.md")
        else:
            file_path = os.path.join(self.workspace_path, project_id, "features", f"{card_id}.md")

        if not os.path.exists(file_path):
            return None

        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()

        parsed = parse_card_file(content)
        return {
            "id": card_id,
            "projectId": project_id,
            "frontmatter": parsed["frontmatter"],
            "body": parsed["body"],
            "filePath": file_path
        }

    def update_card(self, card: Dict[str, Any]) -> Dict[str, Any]:
        file_path = card["filePath"]
        fm = card["frontmatter"]
        body = card["body"]

        # Check existing hash / revision
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                disk_content = f.read()
            disk_parsed = parse_card_file(disk_content)
            disk_hash = compute_content_hash(disk_parsed["frontmatter"], disk_parsed["body"])
            
            disk_rev = disk_parsed["frontmatter"].get("meta", {}).get("revision", 1)
            local_rev = fm.get("meta", {}).get("revision", 1)
            
            if local_rev < disk_rev:
                raise ConflictException(f"Stale write: local revision {local_rev} < disk revision {disk_rev}")

        if "meta" not in fm or not isinstance(fm["meta"], dict):
            fm["meta"] = {}

        fm["meta"]["revision"] = fm["meta"].get("revision", 1) + 1
        fm["meta"]["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        fm["meta"]["updatedBy"] = self.actor_id
        fm["meta"]["contentHash"] = compute_content_hash(fm, body)

        content = f"---\n{serialize_yaml(fm)}\n---\n{normalize_line_endings(body)}"
        
        # Atomic replace via temp file
        temp_path = f"{file_path}.tmp_{os.getpid()}"
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(content)

        os.replace(temp_path, file_path)
        return card

    def write_presence(self, card_id: str, intent: str = "editing", ttl_seconds: int = 30):
        presence_dir = os.path.join(self.workspace_path, ".solokanban", "presence", card_id)
        os.makedirs(presence_dir, exist_ok=True)
        presence_file = os.path.join(presence_dir, f"{self.actor_id}.json")

        now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        data = {
            "cardId": card_id,
            "actor": self.actor_id,
            "actorType": "agent",
            "intent": intent,
            "startedAt": now_str,
            "heartbeatAt": now_str,
            "ttlSeconds": ttl_seconds
        }

        with open(presence_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def clear_presence(self, card_id: str):
        presence_file = os.path.join(self.workspace_path, ".solokanban", "presence", card_id, f"{self.actor_id}.json")
        if os.path.exists(presence_file):
            try:
                os.remove(presence_file)
            except OSError:
                pass

    @contextlib.contextmanager
    def edit_session(self, card_id: str, intent: str = "editing"):
        """Context manager for agent edit sessions, maintaining 15s presence heartbeats and cleanup."""
        self.write_presence(card_id, intent=intent, ttl_seconds=30)
        try:
            yield self
        finally:
            self.clear_presence(card_id)
