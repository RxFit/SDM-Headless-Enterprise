/**
 * autoTaskRules.ts — Auto-Task Rule Engine (TASK_C14)
 *
 * Evaluates incoming agent events against config-driven rules
 * and automatically creates tasks when conditions match.
 */

import { v4 as uuidv4 } from 'uuid';
import type { JsonDb } from './jsonDb.js';
import type { WssBroadcast } from './wssBroadcast.js';
import type { EnterpriseTask } from '../types.js';

/** AgentEvent — emitted by Jade CoS or external agents via POST /api/agents/events */
export interface AgentEvent {
  agent_id: string;
  event_type: string;
  node_id?: string;
  severity?: 'info' | 'warning' | 'critical';
  message?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────
// Rule Definition
// ─────────────────────────────────────────────────────────
export interface AutoTaskRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Match criteria — all specified fields must match the event */
  match: {
    event_type?: string;
    agent_id?: string;
    node_id?: string;
    severity?: string;
    /** Regex pattern matched against event message */
    message_pattern?: string;
  };
  /** Task template to create when rule fires */
  action: {
    title: string;
    description?: string;
    priority: EnterpriseTask['priority'];
    node_id: string;
    assignee?: string;
    /** Replace {event_field} tokens in title/description from the triggering event */
    use_event_fields?: boolean;
  };
  /** Dedupe: don't create if a task with same title already exists within window_hours */
  dedupe_window_hours?: number;
}

// ─────────────────────────────────────────────────────────
// Engine
// ─────────────────────────────────────────────────────────
export class AutoTaskRuleEngine {
  private rules: AutoTaskRule[] = [];
  private db: JsonDb;
  private wss: WssBroadcast;

  constructor(db: JsonDb, wss: WssBroadcast) {
    this.db = db;
    this.wss = wss;
  }

  /**
   * Load rules from data/config.json's auto_task_rules array.
   * Call once on boot, and again after config changes.
   */
  loadRules(config: Record<string, unknown>): void {
    const raw = config['auto_task_rules'];
    if (!Array.isArray(raw)) {
      this.rules = [];
      console.log('[autoTaskRules] No rules configured');
      return;
    }
    this.rules = (raw as AutoTaskRule[]).filter(r => r.enabled !== false);
    console.log(`[autoTaskRules] Loaded ${this.rules.length} active rules`);
  }

  /**
   * Evaluate an incoming event against all rules.
   * Creates tasks for any matching rule that passes dedupe check.
   */
  async evaluate(event: AgentEvent): Promise<EnterpriseTask[]> {
    const created: EnterpriseTask[] = [];

    for (const rule of this.rules) {
      if (!this.matches(rule, event)) continue;

      const title = this.interpolate(rule.action.title, event);
      const description = rule.action.description
        ? this.interpolate(rule.action.description, event)
        : undefined;

      // Dedupe check
      if (rule.dedupe_window_hours) {
        if (this.isDuplicate(title, rule.dedupe_window_hours)) {
          console.log(`[autoTaskRules] Dedupe: skipping "${title}" (rule: ${rule.id})`);
          continue;
        }
      }

      const now = new Date().toISOString();
      const task: EnterpriseTask = {
        id: `auto-${uuidv4().slice(0, 8)}`,
        node_id: rule.action.node_id,
        title,
        description,
        status: 'pending',
        priority: rule.action.priority,
        assignee: rule.action.assignee,
        source: 'agent',
        agent_id: event.agent_id,
        created_at: now,
        updated_at: now,
        tags: ['auto-generated', `rule:${rule.id}`],
      };

      await this.db.insert<EnterpriseTask>('tasks', task);
      this.wss.broadcast('task_created', task);
      created.push(task);

      console.log(`[autoTaskRules] ✓ Rule "${rule.name}" → created task: ${task.title}`);
    }

    return created;
  }

  // ─── Private helpers ───────────────────────────────────

  private matches(rule: AutoTaskRule, event: AgentEvent): boolean {
    const { match } = rule;

    if (match.event_type && match.event_type !== event.event_type) return false;
    if (match.agent_id && match.agent_id !== event.agent_id) return false;
    if (match.node_id && match.node_id !== event.node_id) return false;
    if (match.severity && match.severity !== event.severity) return false;

    if (match.message_pattern && event.message) {
      try {
        const re = new RegExp(match.message_pattern, 'i');
        if (!re.test(event.message)) return false;
      } catch {
        return false;
      }
    }

    return true;
  }

  private interpolate(template: string, event: AgentEvent): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const val = (event as unknown as Record<string, unknown>)[key];
      return val !== undefined && val !== null ? String(val) : `{${key}}`;
    });
  }

  private isDuplicate(title: string, windowHours: number): boolean {
    const tasks = this.db.getAll<EnterpriseTask>('tasks');
    const cutoff = Date.now() - windowHours * 3600 * 1000;
    return tasks.some(
      t => t.title === title && new Date(t.created_at).getTime() > cutoff
    );
  }
}

// ─────────────────────────────────────────────────────────
// Singleton accessor (set after db/wss init)
// ─────────────────────────────────────────────────────────
let _engine: AutoTaskRuleEngine | null = null;

export function initAutoTaskEngine(db: JsonDb, wss: WssBroadcast): AutoTaskRuleEngine {
  _engine = new AutoTaskRuleEngine(db, wss);
  return _engine;
}

export function getAutoTaskEngine(): AutoTaskRuleEngine | null {
  return _engine;
}
