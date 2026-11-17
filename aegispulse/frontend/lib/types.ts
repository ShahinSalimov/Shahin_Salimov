// Types mirroring backend/schemas.py and agents/schemas.py.

export type ThreatStatus = "pending" | "queued" | "analyzing" | "analyzed" | "failed" | "mitigated" | "dismissed";
export type ThreatSource = "darkweb" | "telegram" | "paste" | "nvd" | "manual" | "simulator";
export type Exposure = "direct" | "indirect" | "none";
export type SeverityLabel = "critical" | "high" | "medium" | "low" | "info";
export type AlertChannel = "slack" | "whatsapp" | "webhook";

export interface StackComponent {
  key: string;
  label: string;
  version: string | null;
}

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  tech_stack: StackComponent[];
  created_at: string;
  updated_at: string;
}

export interface Indicator {
  type: string;
  value: string;
  context: string;
  confidence: "low" | "medium" | "high";
}

export interface MitreMapping {
  tactic: string;
  tactic_id: string;
  technique_id: string;
  technique_name: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
}

export interface StackImpact {
  component_key: string;
  component_label: string;
  exposure: Exposure;
  reasoning: string;
}

export interface TriageResult {
  is_actionable: boolean;
  noise_reason: string;
  title: string;
  summary: string;
  threat_category: string;
  severity_score: number;
  severity_rationale: string;
  cvss_vector: string | null;
  indicators: Indicator[];
  affected_technologies: string[];
  injection_attempt_detected: boolean;
}

export interface ThreatContext {
  threat_actor: string;
  actor_motivation: string;
  attack_narrative: string;
  mitre_mappings: MitreMapping[];
  stack_impacts: StackImpact[];
  overall_exposure: Exposure;
  likely_targets: string[];
  recommended_priority: "P1" | "P2" | "P3" | "P4";
}

export interface MitigationStep {
  order: number;
  action: string;
  owner: string;
  urgency: "immediate" | "24h" | "7d";
}

export interface RemediationPlan {
  executive_summary: string;
  mitigation_steps: MitigationStep[];
  verification_steps: string[];
  residual_risk: string;
}

export interface StageMetric {
  stage: string;
  duration_ms: number;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  fallback_used: boolean;
}

export interface PipelineAnalysis {
  pipeline_version: string;
  model: string;
  triage: TriageResult;
  context: ThreatContext | null;
  remediation: RemediationPlan | null;
  dropped_indicators: Indicator[];
  mitre_validation_notes: string[];
  sanitization: { injection_signals: string[]; truncated: boolean; removed_control_chars: number };
  short_circuited: boolean;
  stages: StageMetric[];
  total_duration_ms: number;
}

export interface ScriptValidation {
  target: string;
  kind: string;
  syntax_ok: boolean;
  risk_level: "low" | "medium" | "high";
  findings: string[];
}

export interface Patch {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  content: string;
  rollback_content: string | null;
  requires_root: boolean;
  validation: ScriptValidation | null;
  status: "proposed" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AlertLog {
  id: string;
  threat_id: string;
  channel: AlertChannel;
  status: "sent" | "failed" | "skipped";
  destination: string | null;
  trigger: string;
  response_code: number | null;
  error: string | null;
  created_at: string;
}

export interface ThreatSummary {
  id: string;
  company_id: string;
  source: ThreatSource;
  source_ref: string | null;
  status: ThreatStatus;
  current_stage: string | null;
  title: string | null;
  summary: string | null;
  threat_category: string | null;
  severity_score: number | null;
  final_severity: number | null;
  severity_label: SeverityLabel | null;
  exposure: Exposure | null;
  threat_actor: string | null;
  indicators: Indicator[];
  affected_technologies: string[];
  mitre_techniques: MitreMapping[];
  injection_signals: string[];
  requires_human_review: boolean;
  error: string | null;
  ingested_at: string;
  analyzed_at: string | null;
  updated_at: string;
  priority_score: number | null;
  live_exposure: Exposure | null;
  matched_components: string[];
}

export interface ThreatDetail extends ThreatSummary {
  raw_text: string;
  analysis: PipelineAnalysis | null;
  patches: Patch[];
  alerts: AlertLog[];
}

export interface Telemetry {
  status: "operational" | "degraded";
  database: boolean;
  queue_backend: "redis" | "in-process";
  queue_depth: number;
  ai_engine_configured: boolean;
  model: string;
  agents_total: number;
  agents_active: number;
  analyzing_now: number;
  mttr_seconds: number | null;
  total_threats: number;
  critical_threats: number;
  threats_mitigated: number;
  alerts_sent: number;
  generated_at: string;
}

export interface Scenario {
  id: string;
  name: string;
  source: ThreatSource;
  headline: string;
  targets: string[];
}

export type Role = "viewer" | "analyst" | "admin";

export interface Me {
  kind: string;
  role: Role;
  email: string | null;
  company_id: string | null;
  company_name: string | null;
}

export interface TeamUser {
  id: string;
  company_id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  role: Role;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  key?: string;
}

export interface CollectorStatus {
  name: string;
  source: ThreatSource;
  enabled: boolean;
  configured: boolean;
  config_issue: string | null;
  interval_seconds: number;
  run_requested: boolean;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_items: number;
  items_ingested_total: number;
}

export interface PatchSimulation {
  patch_id: string;
  executed: false;
  syntax_ok: boolean;
  risk_level: string;
  findings: string[];
  planned_actions: string[];
  transcript: string[];
}

export interface AlertPreview {
  channel: AlertChannel;
  configured: boolean;
  executive_summary: string;
  technical_summary: string;
  payload: Record<string, unknown>;
}
