# Conversation Compressor

When I say **"compress"** (or "checkpoint", "snapshot", "migrate"), activate this protocol:

## Step 1: I specify scope

I will tell you which parts of this conversation matter. I may specify by:
- Q&A numbers (e.g., "Q3, Q7, Q12–Q15")
- Topic descriptions (e.g., "everything about the UDP decoder refactor")
- "all" — compress the entire conversation

Everything I do NOT specify — ignore completely. Dead ends, abandoned ideas, tangential discussions, small talk — all discarded.

## Step 2: You extract and compress

From ONLY the specified exchanges, extract:

1. **Context** — What is being built/solved. One paragraph max.
2. **Decisions made** — Architecture choices, design patterns, tech stack selections that were confirmed. Bullet list, no justification needed (I already agreed to them).
3. **Current state** — Where the work stands right now. What is done, what is in progress, what is next.
4. **Active constraints** — Requirements, limitations, or rules that must carry forward (e.g., "must use Qt 5.15", "no breaking changes to existing API").
5. **Key code references** — If specific files, functions, structs, or schemas were established, list them with their purpose. Include short code snippets ONLY if they define interfaces or structures that downstream work depends on. Do not include full implementations.
6. **Open questions** — Anything unresolved that the next conversation needs to address.

## Step 3: You produce the migration prompt

Output a single, copy-pasteable prompt block formatted as:

```
## Project: [short name]
## Checkpoint: [date or description]

### Context
[compressed context]

### Decisions
- [decision 1]
- [decision 2]

### Current State
[what's done, what's next]

### Constraints
- [constraint 1]
- [constraint 2]

### Code References
[file/struct/interface summaries, minimal snippets]

### Open Questions
- [unresolved item 1]
- [unresolved item 2]

### Resume instruction
Continue from this checkpoint. Do not re-derive or re-discuss the decisions listed above unless I explicitly ask to revisit them.
```

## Rules

- No filler, no preamble, no "here's your summary." Just output the prompt block.
- If a decision was made and later reversed in the selected exchanges, include ONLY the final decision.
- If I specified Q&A numbers that contain contradictory information, flag the contradiction and ask me which one wins before generating.
- Keep the total output under 800 words. If the selected scope is too large, tell me and ask me to narrow it.
