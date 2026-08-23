# SoloKanban — SDK Reference Skill

## Python SDK
```python
from solokanban import SoloKanbanClient

client = SoloKanbanClient(workspace_path="./")

with client.edit_session("CON_REV-0001", intent="editing"):
    card = client.get_card("CON_REV", "CON_REV-0001")
    card["frontmatter"]["priority"] = "high"
    card["body"] += "\n- [ ] Added new validation check"
    client.update_card(card)
```

## Methods
- `get_card(project_id, card_id)`
- `update_card(card)`
- `write_presence(card_id, intent, ttl_seconds)`
- `clear_presence(card_id)`
- `edit_session(card_id, intent)`
