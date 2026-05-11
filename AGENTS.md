# .

## SCALE Engine Integration (OpenCode)

This project uses SCALE Engine for AI engineering governance via OpenCode.

### Commands
- `scale create <type> <title>` — Create artifact
- `scale transition <id> <action>` — Transition artifact state
- `scale list --type Spec` — List artifacts
- `scale role activate <role>` — Switch role
- `scale doctor` — Health check

### Workflow
1. **Explore** → Role: explorer (Read/Grep only)
2. **Plan** → Create Spec → refine → approve (guard: ambiguity ≤ 0.2)
3. **Implement** → Role: implementer (Edit/Write/Bash unlocked)
4. **Verify** → Must run tests before claiming done
5. **Learn** → Defects → Lessons → Rules → Hooks

### Rules
- 🔴 Dangerous commands are physically blocked
- 🔴 Hardcoded secrets are blocked on Edit/Write
- 🟡 3 identical retries triggers brute-retry detection
- 🟡 Claiming done without running tests is blocked
- 🟢 All tool calls are tracked in .scale/events/
