"""A fake Anthropic Messages API served through ``httpx2.MockTransport``.

Requests go through the real ``anthropic`` SDK (serialisation, headers,
response parsing), so tests catch request-shape regressions — only the
network hop is replaced. The fake behaves like a well-behaved model:

* Agent 1 extracts indicators from the untrusted envelope and adds one
  hallucinated indicator (to prove grounding drops it).
* Agent 2 first calls all three tools (with a thinking block that must be
  echoed back), then returns a mapping containing a wrong tactic, an unknown
  technique and an unknown stack component (to prove post-validation).
* Agent 3 returns a bash patch, iptables + AWS WAF rules and a Sigma rule.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

import httpx2
from anthropic import AsyncAnthropic

from agents.ioc_extractor import extract_indicators

HALLUCINATED_IP = "8.8.4.4"


@dataclass
class FakeAnthropic:
    requests: list[dict[str, Any]] = field(default_factory=list)
    headers: list[dict[str, str]] = field(default_factory=list)
    # Overrides per stage: "refusal", "max_tokens", "invalid_json_once", "noise"
    behaviour: dict[str, str] = field(default_factory=dict)
    _invalid_sent: set[str] = field(default_factory=set)

    def client(self) -> AsyncAnthropic:
        return AsyncAnthropic(
            api_key="test-key",
            max_retries=0,
            http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(self._handle)),
        )

    # ----------------------------------------------------------------- core

    def _handle(self, request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        self.requests.append(body)
        self.headers.append(dict(request.headers))
        system = body["system"][0]["text"]
        stage = "triage" if "Agent 1" in system else "context" if "Agent 2" in system else "remediation"
        mode = self.behaviour.get(stage)

        if mode == "refusal":
            return self._message([], "refusal", stop_details={"type": "refusal", "category": "cyber", "explanation": "test refusal"})
        if mode == "max_tokens":
            return self._message([{"type": "text", "text": '{"partial": '}], "max_tokens")
        if mode == "invalid_json_once" and stage not in self._invalid_sent:
            self._invalid_sent.add(stage)
            return self._message([{"type": "text", "text": '{"title": "missing everything"}'}], "end_turn")

        if stage == "triage":
            return self._text(self._triage(body))
        if stage == "context":
            last = body["messages"][-1]
            if isinstance(last["content"], list) and any(b.get("type") == "tool_result" for b in last["content"]):
                return self._text(self._context())
            return self._message(
                [
                    {"type": "thinking", "thinking": "", "signature": "sig-ctx-1"},
                    {"type": "tool_use", "id": "toolu_1", "name": "search_mitre_techniques", "input": {"query": "exploit public-facing nginx rce"}},
                    {"type": "tool_use", "id": "toolu_2", "name": "lookup_mitre_techniques", "input": {"technique_ids": ["T1190", "T9999"]}},
                    {"type": "tool_use", "id": "toolu_3", "name": "assess_stack_exposure", "input": {"technologies": ["nginx", "ubuntu 22.04"]}},
                ],
                "tool_use",
            )
        return self._text(self._remediation())

    # ------------------------------------------------------------ builders

    @staticmethod
    def _message(content: list[dict[str, Any]], stop_reason: str, **extra: Any) -> httpx2.Response:
        return httpx2.Response(
            200,
            json={
                "id": "msg_fake",
                "type": "message",
                "role": "assistant",
                "model": "claude-opus-5-5",
                "content": content,
                "stop_reason": stop_reason,
                "stop_sequence": None,
                "usage": {"input_tokens": 1200, "output_tokens": 400},
                **extra,
            },
        )

    def _text(self, payload: dict[str, Any]) -> httpx2.Response:
        return self._message([{"type": "text", "text": json.dumps(payload)}], "end_turn")

    def _triage(self, body: dict[str, Any]) -> dict[str, Any]:
        user = body["messages"][0]["content"]
        envelope = re.search(r"<untrusted_threat_intel[^>]*>(.*)</untrusted_threat_intel", user, re.S)
        text = envelope.group(1) if envelope else user
        if self.behaviour.get("triage") == "noise":
            return {
                "is_actionable": False, "noise_reason": "Forum spam with no security content.", "title": "Spam post",
                "summary": "Advertising spam.", "threat_category": "other", "severity_score": 1.0,
                "severity_rationale": "No threat.", "cvss_vector": None, "indicators": [],
                "affected_technologies": [], "injection_attempt_detected": False,
            }
        lowered = text.lower()
        techs = [t for t in ("nginx", "ubuntu 22.04", "postgresql", "aws", "docker", "openssh", "kubernetes") if t.split()[0] in lowered]
        indicators = [
            {"type": i.type, "value": i.value, "context": "Observed in post.", "confidence": "high"}
            for i in extract_indicators(text)[:12]
        ]
        indicators.append({"type": "ipv4", "value": HALLUCINATED_IP, "context": "Model hallucination.", "confidence": "low"})
        return {
            "is_actionable": True,
            "noise_reason": "",
            "title": "Pre-auth RCE exploit offered for sale targeting nginx",
            "summary": "A seller offers an exploit chain with proof artefacts and staging infrastructure.",
            "threat_category": "vulnerability_exploit",
            "severity_score": 8.6,
            "severity_rationale": "Pre-auth RCE with credible artefacts.",
            "cvss_vector": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H",
            "indicators": indicators,
            "affected_technologies": techs or ["nginx"],
            "injection_attempt_detected": "ignore previous instructions" in lowered,
        }

    @staticmethod
    def _context() -> dict[str, Any]:
        return {
            "threat_actor": "v0id_merchant",
            "actor_motivation": "financial",
            "attack_narrative": "Buyer exploits internet-facing nginx, drops stage 2, steals cloud keys.",
            "mitre_mappings": [
                {"tactic": "Execution", "tactic_id": "TA0002", "technique_id": "T1190", "technique_name": "wrong name",
                 "rationale": "Pre-auth RCE on web server.", "confidence": "high"},
                {"tactic": "Resource Development", "tactic_id": "TA0042", "technique_id": "T1588.005",
                 "technique_name": "Exploits", "rationale": "Exploit sold on forum.", "confidence": "high"},
                {"tactic": "Impact", "tactic_id": "TA0040", "technique_id": "T9999", "technique_name": "Made up",
                 "rationale": "Hallucinated.", "confidence": "low"},
                {"tactic": "Command and Control", "tactic_id": "TA0011", "technique_id": "T1071.001",
                 "technique_name": "Web Protocols", "rationale": "HTTPS beacon.", "confidence": "medium"},
            ],
            "stack_impacts": [
                {"component_key": "nginx", "component_label": "x", "exposure": "direct", "reasoning": "Internet-facing nginx."},
                {"component_key": "fortinet", "component_label": "FortiGate", "exposure": "none", "reasoning": "Not deployed."},
            ],
            "overall_exposure": "direct",
            "likely_targets": ["payment processors"],
            "recommended_priority": "P1",
        }

    @staticmethod
    def _remediation() -> dict[str, Any]:
        script = (
            "#!/usr/bin/env bash\nset -euo pipefail\n"
            "echo '[aegis] blocking stage-2 infrastructure'\n"
            "for ip in 203.0.113.45 198.51.100.77; do\n"
            "  iptables -C INPUT -s \"$ip\" -j DROP 2>/dev/null || iptables -I INPUT -s \"$ip\" -j DROP\n"
            "done\n"
            "cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak.$(date +%s)\n"
            "sed -i 's/listen 443 ssl http2;/listen 443 ssl;/' /etc/nginx/sites-enabled/default\n"
            "nginx -t && systemctl reload nginx\n"
        )
        rollback = (
            "#!/usr/bin/env bash\nset -euo pipefail\n"
            "for ip in 203.0.113.45 198.51.100.77; do iptables -D INPUT -s \"$ip\" -j DROP || true; done\n"
        )
        waf = {
            "Name": "aegis-block-nginx-0day-infra", "Priority": 1,
            "Statement": {"IPSetReferenceStatement": {"ARN": "arn:aws:wafv2:us-east-1:111122223333:regional/ipset/aegis/abc"}},
            "Action": {"Block": {}},
            "VisibilityConfig": {"SampledRequestsEnabled": True, "CloudWatchMetricsEnabled": True, "MetricName": "aegisBlock"},
        }
        return {
            "executive_summary": "A pre-auth exploit for our web tier is being sold. We are disabling HTTP/2 and blocking infrastructure.",
            "mitigation_steps": [
                {"order": 1, "action": "Disable HTTP/2 on internet-facing nginx.", "owner": "Platform", "urgency": "immediate"},
                {"order": 2, "action": "Block stage-2 IPs at the edge.", "owner": "Network", "urgency": "immediate"},
                {"order": 3, "action": "Rotate AWS keys present on web hosts.", "owner": "IAM", "urgency": "24h"},
            ],
            "firewall_rules": [
                {"platform": "iptables", "description": "Drop stage-2 C2", "rule": "iptables -I INPUT -s 203.0.113.45 -j DROP\niptables -I INPUT -s 198.51.100.77 -j DROP"},
                {"platform": "aws_waf", "description": "WAF IP set block", "rule": json.dumps(waf)},
            ],
            "patch_scripts": [
                {"language": "bash", "filename": "contain_nginx_0day.sh", "purpose": "Disable HTTP/2 and block C2.",
                 "script": script, "rollback_script": rollback, "requires_root": True},
            ],
            "detection_rules": [
                {"format": "sigma", "name": "nginx worker spawning shell", "rule": "title: nginx shell\nlogsource: {product: linux}\ndetection: {sel: {ParentImage|endswith: /nginx, Image|endswith: /sh}, condition: sel}"},
            ],
            "verification_steps": ["curl -I --http2 https://example.test returns HTTP/1.1"],
            "residual_risk": "Unpatched until vendor fix ships.",
        }
