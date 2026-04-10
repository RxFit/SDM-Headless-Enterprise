---
description: The Wolverine Clause - SDM Auto-Healing Architecture Directives
---
# The Wolverine Clause (Autopoiesis Directive)

## Core Philosophy
The Sovereign Domain Mesh (SDM) is designed to be deployed for external companies with zero technical overhead. Because end-users and non-technical founders will not understand how to debug database states, dangling WebSockets, or auth routing, the system must **self-heal**. 

As an AI Agent working on this codebase, you are bound by **The Wolverine Clause**:

1. **Stateful Redundancy**: If a database state becomes decoupled from a hardcoded ground-truth (e.g., an Admin's email in the environment variables vs. their role in the `profiles` table), the system must silently and forcefully overwrite the degraded state upon the next user access. 
2. **Never Require Support**: If a user is trapped in an error loop (e.g., a missing config or expired auth token), do not just show an error page. The system must attempt a graceful fallback, a silent re-authentication, or self-elevation before failing.
3. **Database Paradigms**: When writing schema migrations or routing logic, always ask: *"If this row is manually corrupted by an owner, or if the server crashes mid-transaction, will the application self-correct when normal traffic resumes?"* 
4. **Implementation Mandate**: For every new API route or authentication module you build, you must actively inject these auto-healing hooks. 

Any AI modifying the SDM outbox, the `anc-mcp-core` node templates, or the Command Center infrastructure is required to review PRs against this clause and enforce it stringently.
