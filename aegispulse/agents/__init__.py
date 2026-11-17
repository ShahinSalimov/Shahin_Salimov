"""AegisPulse multi-agent threat analysis engine.

The package is framework-agnostic: it depends only on the Anthropic SDK and
Pydantic, so it can be embedded in the FastAPI backend, a Celery/arq worker,
or a CLI without pulling in any web or database code.
"""

from agents.schemas import (
    CompanyStackProfile,
    PipelineResult,
    RemediationPlan,
    StackComponent,
    ThreatContext,
    TriageResult,
)
from agents.threat_pipeline import (
    AgentOutputError,
    AgentRefusalError,
    PipelineConfig,
    PipelineError,
    ThreatPipeline,
)

__all__ = [
    "AgentOutputError",
    "AgentRefusalError",
    "CompanyStackProfile",
    "PipelineConfig",
    "PipelineError",
    "PipelineResult",
    "RemediationPlan",
    "StackComponent",
    "ThreatContext",
    "ThreatPipeline",
    "TriageResult",
]
