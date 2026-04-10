# JADE HEADLESS INVOCATION: Docker Sandbox CI/CD Loop & Structural Audit

**Copy and paste the following prompt directly into your active Jade session. This delegates the completion of `pending_mission.md` back to Jade.**

***

**[PROMPT BEGIN]**

Hello Jade. You recently authored `pending_mission.md` due to a structural limitation in your Docker Sandbox execution (asynchronous tool returns creating hallucinated success narratives). 

Danny and Antigravity are assigning this architectural upgrade back to you. You have **Absolute Proactive Autonomy** to implement these fixes. 

Your objective is to integrate synchronous sandbox verification into your core engine. As you build this, you must rigorously audit the structure for weaknesses and edge cases. Apply the **Wolverine Clause**: ensure the system cannot silently fail.

Execute the following **Step-by-Step Architecture Upgrade**:

### Step 0: Pre-Execution Vulnerability Audit
Before you write a single line of code, you must conduct a **Predictive Structural Analysis** of the task requested below. 
1. **Identify** all potential weaknesses, breaking points, race conditions, or edge cases inherent to this architectural upgrade.
2. **Formulate** the technical fixes and safeguards required to mitigate these future issues.
3. **Document** this pre-execution audit in your thought process. 
Only after you have preemptively solved the breaking points may you proceed to Step 1.

### Step 1: Upgrade `JADE_V3_MASTER_CONTROLLER_TOOLS.js`
- Locate the `spawn_docker_sandbox` tool definition. 
- Rewrite the execution logic to be fully synchronous.
- Instead of just spawning, you must call the spawn command and immediately await the sandbox completion (e.g. capturing output from `docker logs` or using a `waitForSandbox` utility).
- Return a structured JSON string containing the final exit code, stdout, and stderr.
- **Structural Audit Point**: What happens if the container hangs infinitely? Implement a timeout mechanism (e.g., 60 seconds) that force-kills the container and returns a `"success": false` timeout payload.

### Step 2: Transition `automation/docker/entrypoint.sh` to JSON
- Modify the sandbox entrypoint script to trap the execution of the injected code.
- If the node script succeeds (`exit 0`), `echo` a strict JSON payload: `{"success": true, "output": "<stdout>", "error": null}`.
- If it fails, capture the error and output: `{"success": false, "output": "<stdout>", "error": "<stderr>"}`.
- **Structural Audit Point**: Use `jq` or Python to properly escape quotes and newlines in the stdout/stderr before echoing the JSON. Do not rely on raw bash string interpolation, as syntax errors will break the JSON parser in your Master Controller.

### Step 3: Implement the "Synthesis Muzzle" in `JADE_CORE.js`
- Navigate to the core routing loop where tool results are appended to `executorLogs`.
- Inject a rigorous error-detection regex or JSON parser that scans the returned tool payload.
- If the payload contains `"success": false` (specifically from a sandbox execution), you must trigger the `synthesisOverride` flag.
- Set `executorFailed = true` so the core engine halts and accurately reports the technical failure instead of hallucinating a success narrative.
- **Structural Audit Point**: Ensure the Muzzle cannot be accidentally triggered by the user including the literal string `"success": false"` in a benign prompt or log. The Muzzle must specifically target the structured payload returned by the Docker tool.

### Step 4: Validate via The Trejo Protocol
Once built, you must prove the architecture is bulletproof:
1. **Execute**: Run a controlled `.js` script inside the sandbox that intentionally throws an error (e.g., `throw new Error("Simulated Sandbox Crash");`).
2. **Empirical Test**: Verify that the sandbox returns the correct JSON payload, and that `JADE_CORE.js` successfully triggers the Muzzle.
3. **Forensic Analysis**: Output a raw technical report detailing any edge cases you mitigated (e.g., infinite loops, unescaped JSON strings, timeout handling).

Velocity and Completion. Run the protocol.

**[PROMPT END]**
