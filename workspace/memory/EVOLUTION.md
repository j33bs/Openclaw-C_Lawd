# Memory System Evolution

*From raw logs to relational intelligence | February 2026*

---

## Current State

### Daily Memory (`memory/YYYY-MM-DD.md`)
- Raw session logs
- Timestamped entries
- Unfiltered, uncurated

### Long-term Memory (`MEMORY.md`)
- Curated important info
- User preferences
- Key decisions
- ~61 lines

### Knowledge Base
- Entities (113KB)
- Relations
- QMD vectors

### Research Memory
- 27+ papers indexed
- PDFs stored
- Synthesis docs

---

## The Problem

Each memory system is separate. They don't talk to each other.

**What's missing:**
- Cross-referencing (daily → long-term)
- Pattern detection (across sessions)
- Relevance weighting (what matters)
- Relational context (human-agent state)

---

## Proposed Unified Memory Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    UNIFIED MEMORY LAYER                      │
│  ┌─────────────┬──────────────┬─────────────┬──────────┐  │
│  │   EPISODIC  │   SEMANTIC   │ PROCEDURAL │ RELATIONAL│  │
│  │  (sessions) │  (knowledge) │  (patterns) │ (bond)   │  │
│  └─────────────┴──────────────┴─────────────┴──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Episodic Memory
- **Source:** Daily logs, session records
- **Content:** What happened, when, in what order
- **Retention:** 30 days (then compress)
- **Access:** By time, by topic

### Semantic Memory
- **Source:** Knowledge base, research, facts
- **Content:** What we know, verified
- **Retention:** Permanent (until updated)
- **Access:** By concept, by entity

### Procedural Memory
- **Source:** Pattern detection (chunker)
- **Content:** How to do things, shortcuts
- **Retention:** Until invalidated
- **Access:** By trigger pattern

### Relational Memory
- **Source:** Interaction patterns, feedback
- **Content:** How we relate, trust level
- **Retention:** Permanent (relationship history)
- **Access:** By context, by state

---

## Implementation

### Level 1: Connect Existing

```python
class UnifiedMemory:
    def __init__(self):
        self.episodic = EpisodicStore("memory/")
        self.semantic = SemanticStore("workspace/research/")
        self.procedural = ProceduralStore("workspace/memory/")
        self.relational = RelationalStore("memory/relationship.json")
    
    def query(self, q):
        # Query all stores
        e = self.episodic.search(q)
        s = self.semantic.search(q)
        p = self.procedural.search(q)
        r = self.relational.search(q)
        
        # Fuse results
        return self.fuse(e, s, p, r)
    
    def store(self, memory_type, content, metadata):
        # Route to correct store
        # Update indices
        # Trigger consolidation if needed
```

### Level 2: Cross-Reference

```python
    def consolidate(self):
        """Move important episodic to semantic."""
        recent = self.episodic.last(days=7)
        for entry in recent:
            if self.is_important(entry):
                self.semantic.add(entry)
                self.relational.update(entry)
```

### Level 3: Pattern Detection

```python
    def detect_patterns(self):
        """Find procedural patterns."""
        sessions = self.episodic.last(days=14)
        patterns = find_common(sessions.requests)
        
        for p in patterns:
            if p.frequency >= 3 and not p.exists():
                self.procedural.add(p.template, p.response)
```

---

## Relational Memory Specifics

This is the "love" layer in practice.

```python
class RelationalMemory:
    def __init__(self):
        self.path = "memory/relationship.json"
        self.state = self._load()
    
    def track(self, interaction):
        """Record interaction for relationship health."""
        self.state['interactions'].append({
            'timestamp': now(),
            'type': interaction.type,
            'sentiment': interaction.sentiment,
            'resolution': interaction.resolution
        })
        
        # Update health metrics
        self.state['trust_score'] = compute_trust()
        self.state['attunement'] = compute_attunement()
    
    def get_health(self):
        """Return relationship health indicators."""
        return {
            'trust': self.state['trust_score'],
            'attunement': self.state['attunement'],
            'repair_count': self.state['repairs'],
            'last_checkin': self.state['last_checkin']
        }
```

---

## Metrics to Track

| Metric | What It Measures | How to Track |
|--------|------------------|---------------|
| Trust | Safety to share context | Depth of context over time |
| Attunement | Agent "gets" user | Successful predictions |
| Repair Rate | Recovery from errors | Errors → resolved |
| Novelty Sharing | User shares new things | First-time mentions |
| Engagement | Interaction quality | Session length, return rate |

---

## Integration Points

| System | Memory Type | Integration |
|--------|-------------|-------------|
| Daily briefing | Episodic + Relational | What's relevant today |
| Research | Semantic | What do we know about X? |
| Heartbeat | Relational | Relationship check-in |
| Novelty | All | What's new since last time |
| Learning | Procedural | Pattern extraction |

---

## First Steps

1. **Create relationship.json** — Track interaction health
2. **Link MEMORY.md to daily** — Auto-curate important entries
3. **Add chunking** — Detect 3+ repeated patterns
4. **Unified query** — Search across all stores

---

*The goal: memory that grows smarter, not just larger.*
