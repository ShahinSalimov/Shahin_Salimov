"""Deterministic tech-stack exposure scoring.

Shared by Agent 2's ``assess_stack_exposure`` tool and by the backend's live
prioritisation, so toggling a component in the dashboard re-ranks threats
instantly (no model call) using the same logic the agent relied on.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from agents.schemas import Exposure, StackComponent, clamp_score

# key -> aliases that identify the component in intel text / affected tech lists.
STACK_ALIASES: dict[str, tuple[str, ...]] = {
    "aws": ("aws", "amazon web services", "iam", "s3", "ec2", "cloudtrail", "akia", "lambda"),
    "azure": ("azure", "entra", "microsoft 365", "m365"),
    "gcp": ("gcp", "google cloud", "gke"),
    "ubuntu": ("ubuntu",),
    "debian": ("debian",),
    "rhel": ("rhel", "red hat", "centos", "rocky linux", "almalinux"),
    "linux": ("linux", "glibc", "kernel"),
    "windows_server": ("windows server", "active directory", "windows"),
    "nginx": ("nginx", "openresty"),
    "apache": ("apache httpd", "apache http server", "httpd"),
    "openssh": ("openssh", "sshd", "ssh"),
    "postgresql": ("postgresql", "postgres", "pgjdbc", "psql"),
    "mysql": ("mysql", "mariadb"),
    "redis": ("redis",),
    "mongodb": ("mongodb", "mongo"),
    "docker": ("docker", "runc", "containerd", "container escape"),
    "kubernetes": ("kubernetes", "k8s", "kubelet", "kubectl", "ingress-nginx"),
    "react": ("react", "next.js", "nextjs"),
    "nodejs": ("node.js", "nodejs", "npm", "express"),
    "python": ("python", "pypi", "django", "flask", "fastapi"),
    "java": ("java", "spring", "log4j", "jdbc", "tomcat"),
    "jenkins": ("jenkins",),
    "gitlab": ("gitlab",),
    "github": ("github actions", "github"),
    "okta": ("okta",),
    "fortinet": ("fortinet", "fortigate", "fortios"),
    "exchange": ("exchange server", "outlook web access", "owa"),
    "vmware": ("vmware", "esxi", "vcenter"),
}

EXPOSURE_ADJUSTMENT: dict[str, float] = {"direct": 1.5, "indirect": 0.0, "none": -3.0}


def _aliases_for(component: StackComponent) -> tuple[str, ...]:
    base = STACK_ALIASES.get(component.key.lower(), ())
    label_words = component.label.lower().split()
    label_alias = (label_words[0],) if label_words and len(label_words[0]) > 2 else ()
    return tuple(dict.fromkeys((component.key.lower().replace("_", " "), *base, *label_alias)))


def _mentions(haystack: str, alias: str) -> bool:
    return re.search(r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])", haystack) is not None


def match_components(
    stack: Iterable[StackComponent], texts: Iterable[str]
) -> list[StackComponent]:
    haystack = " \n ".join(t.lower() for t in texts if t)
    return [c for c in stack if any(_mentions(haystack, a) for a in _aliases_for(c))]


def assess_exposure(
    stack: list[StackComponent],
    affected_technologies: Iterable[str],
    raw_text: str = "",
) -> tuple[Exposure, list[StackComponent], list[StackComponent]]:
    """Return (exposure, directly_matched, indirectly_matched).

    *direct*   — a stack component matches what the threat explicitly targets.
    *indirect* — a component is only mentioned somewhere in the raw intel.
    *none*     — no overlap with the configured stack.
    """
    direct = match_components(stack, affected_technologies)
    direct_keys = {c.key for c in direct}
    indirect = [c for c in match_components(stack, [raw_text]) if c.key not in direct_keys]
    if direct:
        return "direct", direct, indirect
    if indirect:
        return "indirect", direct, indirect
    return "none", direct, indirect


def prioritized_severity(base_severity: float, exposure: Exposure) -> float:
    """Severity adjusted for the company's exposure (clamped to 0-10)."""
    return clamp_score(base_severity + EXPOSURE_ADJUSTMENT[exposure])
