const encoder = new TextEncoder();

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function zipEntry(path, content = "") {
  return {
    path: path.replace(/\\/g, "/"),
    bytes: typeof content === "string" ? encoder.encode(content) : content
  };
}

export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.path);
    const data = Buffer.from(entry.bytes);
    const checksum = crc32(data);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(nameBytes.length),
      uint16(0),
      Buffer.from(nameBytes)
    ]);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(data.length),
      uint32(data.length),
      uint16(nameBytes.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(entry.path.endsWith("/") ? 0x10 : 0),
      uint32(offset),
      Buffer.from(nameBytes)
    ]);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0)
  ]);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function isMultiComponentBlueprint(blueprint) {
  return blueprint.project_type === "multi_component_system";
}

function markdownValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

function componentVerdict(blueprint, componentId) {
  const items = blueprint.component_consequences?.by_component?.[componentId] || [];
  if (items.some((item) => item.severity === "block")) return "needs_resolution";
  return items.length ? "needs_component_resolution" : "ok";
}

function correctedDecisionMarkdown(blueprint) {
  if (!isMultiComponentBlueprint(blueprint)) {
    return blueprint.decision
      ? Object.entries(blueprint.decision)
          .map(([key, value]) => `- ${key}: ${markdownValue(value)}`)
          .join("\n")
      : "- No decision object returned.";
  }

  return (blueprint.components || [])
    .map(
      (component) =>
        `- ${component.name} (${component.task_type}): target ${component.target}; metrics ${(component.metrics || []).join(", ")}; verdict ${componentVerdict(blueprint, component.id)}.`
    )
    .join("\n") || "- No component decisions returned.";
}

function allBlockingConsequences(blueprint) {
  return [
    ...(blueprint.consequences?.blocking || []),
    ...(blueprint.component_consequences?.blocking || [])
  ];
}

function allResolvedConsequences(blueprint) {
  return [
    ...(blueprint.consequences?.resolved || []),
    ...(blueprint.component_consequences?.resolved || [])
  ];
}

function allAcceptedConsequences(blueprint) {
  return [
    ...(blueprint.consequences?.accepted || []),
    ...(blueprint.component_consequences?.accepted || [])
  ];
}

function blockingConsequenceLine(item) {
  const scope = item.component_name ? `${item.component_name} - ` : "";
  const remedy = item.remedy ? ` Remedy: ${markdownValue(item.remedy)}` : "";
  return `- ${scope}${item.id}: ${item.message}${remedy}`;
}

function resolvedConsequenceLine(item) {
  const scope = item.component_name ? `${item.component_name} - ` : "";
  const note = item.resolution_note ? ` ${item.resolution_note}` : "";
  return `- ${scope}${item.id}: ${item.resolution_status || "resolved"}.${note}`;
}

function markdownBlueprint(blueprint) {
  const componentConsequences = blueprint.component_consequences?.by_component || {};
  const blockingAll = allBlockingConsequences(blueprint);
  const resolvedAll = allResolvedConsequences(blueprint);
  const acceptedAll = allAcceptedConsequences(blueprint);
  return `# ${blueprint.title}

Task type: ${blueprint.task_type}
Project type: ${blueprint.project_type || "single_task"}
Audience: ${blueprint.audience}
Verdict: ${blueprint.consequences?.verdict || "ok"}

## Decision Trace
${(blueprint.decision_trace || []).map((item) => `- ${item}`).join("\n") || "- No decision trace returned."}

## ${isMultiComponentBlueprint(blueprint) ? "Component Decisions" : "Corrected Decision"}
${correctedDecisionMarkdown(blueprint)}

## Components
${(blueprint.components || [])
  .map(
    (component) =>
      `- ${component.name} (${component.task_type}): ${component.objective}. Target: ${component.target}. Metrics: ${component.metrics.join(", ")}.`
  )
  .join("\n") || "- Single-task blueprint."}

## Blocking Consequences
${blockingAll.map(blockingConsequenceLine).join("\n") || "- None."}

## Resolved Gates
${resolvedAll.map(resolvedConsequenceLine).join("\n") || "- None."}

## Accepted Gate Risks
${acceptedAll.map(resolvedConsequenceLine).join("\n") || "- None."}

## Agent Preflight
Before coding, run:

\`\`\`bash
python tools/agent_preflight.py
\`\`\`

If blocking gates are present, the command exits non-zero and prints the gates the agent must resolve or explicitly acknowledge.

## Component Consequences
${Object.keys(componentConsequences).length
  ? Object.entries(componentConsequences)
      .map(([componentId, items]) => {
        const component = (blueprint.components || []).find((candidate) => candidate.id === componentId);
        const title = component ? component.name : componentId;
        return `### ${title}\n${items
          .map((item) => `- ${item.severity}: ${item.id} - ${item.message} Remedy: ${item.remedy}`)
          .join("\n")}`;
      })
      .join("\n\n")
  : "- None."}

${Object.entries(blueprint.summary)
  .map(([key, value]) => `## ${key}\n${value}`)
  .join("\n\n")}

## Data Contract
${blueprint.data_contract.map((item) => `- ${item}`).join("\n")}

## Model Path
${blueprint.model_path.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Math
${blueprint.formulas.map((item) => `- ${item.title}: ${item.formula}`).join("\n")}

## Retrieved Knowledge
${(blueprint.retrieved_knowledge || [])
  .map((item) => `- ${item.title} (${item.source.label}): ${item.source.url}`)
  .join("\n")}
`;
}

function testDataContract() {
  return `from pathlib import Path


def test_training_data_matches_schema():
    data_path = Path("data/training.csv")
    schema_path = Path("schema.yaml")

    if not data_path.exists():
        return

    import pandas as pd

    schema_text = schema_path.read_text()
    target = "target"
    for line in schema_text.splitlines():
        if line.strip().startswith("target:"):
            target = line.split(":", 1)[1].strip().strip('"')
            break
    frame = pd.read_csv(data_path)
    assert target in frame.columns
`;
}

function agentPreflightPy() {
  return `"""Agent preflight for ModelBlueprint-generated projects.

Run before coding:
    python tools/agent_preflight.py

If blocking gates exist, the command fails until the agent explicitly acknowledges
them with:
    python tools/agent_preflight.py --acknowledge-gates
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ACK_PATH = ROOT / "agent_preflight_ack.json"


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Invalid JSON in {path}: {exc}") from exc


def required_files():
    files = [
        "agent_spec.json",
        "consequences.json",
        "component_consequences.json",
        "decision_trace.json",
    ]
    if (ROOT / "system_schema.yaml").exists():
        files.append("system_schema.yaml")
    elif (ROOT / "schema.yaml").exists():
        files.append("schema.yaml")
    if (ROOT / "components.json").exists():
        files.append("components.json")
    return files


def missing_required(files):
    return [name for name in files if not (ROOT / name).exists()]


def gate_record(source: str, item: dict) -> dict:
    return {
        "source": source,
        "id": item.get("id"),
        "component_id": item.get("component_id"),
        "component_name": item.get("component_name"),
        "severity": item.get("severity"),
        "message": item.get("message"),
        "remedy": item.get("remedy"),
        "questions": item.get("questions", []),
    }


def collect_blocking_gates():
    consequences = load_json(ROOT / "consequences.json", {})
    component_consequences = load_json(ROOT / "component_consequences.json", {})
    blocking = []
    for item in consequences.get("blocking", []) or []:
        blocking.append(gate_record("consequences.json", item))
    for item in component_consequences.get("blocking", []) or []:
        blocking.append(gate_record("component_consequences.json", item))
    return blocking


def list_tests():
    tests_dir = ROOT / "tests"
    if not tests_dir.exists():
        return []
    return sorted(str(path.relative_to(ROOT)).replace("\\\\", "/") for path in tests_dir.glob("test_*.py"))


def build_report():
    required = required_files()
    missing = missing_required(required)
    agent_spec = load_json(ROOT / "agent_spec.json", {})
    return {
        "product": "ModelBlueprint",
        "preflight_status": "missing_files" if missing else "ready",
        "project_type": agent_spec.get("project_type"),
        "task_type": agent_spec.get("task_type"),
        "overall_verdict": (agent_spec.get("consequences") or {}).get("verdict", "ok"),
        "required_read_files": required,
        "missing_required_files": missing,
        "blocking_gates": collect_blocking_gates(),
        "tests_to_keep_passing": list_tests(),
    }


def print_report(report):
    print(json.dumps(report, indent=2))
    if report["missing_required_files"]:
        print("\\nPreflight failed: required ModelBlueprint files are missing.", file=sys.stderr)
    elif report["blocking_gates"]:
        print(
            "\\nPreflight blocked: read the blocking gates above before coding. "
            "Resolve them or rerun with --acknowledge-gates to create an explicit acknowledgment.",
            file=sys.stderr,
        )
    else:
        print("\\nPreflight passed: no blocking gates detected.")


def write_ack(report):
    ack = {
        "acknowledged_at": datetime.now(timezone.utc).isoformat(),
        "acknowledged_blocking_gates": report["blocking_gates"],
        "required_read_files": report["required_read_files"],
        "tests_to_keep_passing": report["tests_to_keep_passing"],
        "agent_instruction": (
            "Do not delete or bypass generated validation, consequence, schema, "
            "or contract tests. If a blocking gate remains, edits must either resolve "
            "the gate or preserve the failing guard that prevents unsafe behavior."
        ),
    }
    ACK_PATH.write_text(json.dumps(ack, indent=2) + "\\n", encoding="utf-8")
    return ack


def main():
    parser = argparse.ArgumentParser(description="Read ModelBlueprint gates before coding.")
    parser.add_argument("--acknowledge-gates", action="store_true", help="Write agent_preflight_ack.json and exit 0.")
    args = parser.parse_args()

    report = build_report()
    print_report(report)

    if report["missing_required_files"]:
        return 3
    if report["blocking_gates"] and not args.acknowledge_gates:
        return 2
    if args.acknowledge_gates:
        ack = write_ack(report)
        print("\\nWrote acknowledgment:")
        print(json.dumps(ack, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
`;
}

function yamlScalar(value) {
  return JSON.stringify(value ?? "");
}

function yamlArray(items = [], indent = 2) {
  const prefix = " ".repeat(indent);
  if (!items.length) return " []";
  return `\n${items.map((item) => `${prefix}- ${yamlScalar(item)}`).join("\n")}`;
}

function componentMarkdown(component, consequences = []) {
  return `# ${component.name}

Component ID: ${component.id}
Task type: ${component.task_type}
Domain: ${component.domain}
Target: ${component.target}

## Objective
${component.objective}

## Metrics
${component.metrics.map((metric) => `- ${metric}`).join("\n")}

## Outputs
${component.outputs.map((output) => `- ${output}`).join("\n")}

## Data Needs
${component.data_needs.map((need) => `- ${need}`).join("\n")}

## Constraints
${component.constraints?.length ? component.constraints.map((constraint) => `- ${constraint}`).join("\n") : "- None specified yet."}

## Consequence Gates
${consequences.length
  ? consequences
      .map(
        (item) =>
          `- ${item.severity}: ${item.id}\n  - ${item.message}\n  - Remedy: ${item.remedy}\n  - Questions: ${(item.questions || []).join(" | ") || "None"}`
      )
      .join("\n")
  : "- No component-specific gates fired."}

## Acceptance Tests
- Component has an explicit target or output contract.
- Component metrics match its task type.
- Component data contract identifies required source tables and timestamps.
- Component handoff to downstream components is documented.
`;
}

function componentSchema(component, consequences = []) {
  return `id: ${yamlScalar(component.id)}
name: ${yamlScalar(component.name)}
domain: ${yamlScalar(component.domain)}
task_type: ${yamlScalar(component.task_type)}
target: ${yamlScalar(component.target)}
objective: ${yamlScalar(component.objective)}
metrics:${yamlArray(component.metrics, 2)}
outputs:${yamlArray(component.outputs, 2)}
data_needs:${yamlArray(component.data_needs, 2)}
constraints:${yamlArray(component.constraints || [], 2)}
consequence_gates:
${consequences.length
  ? consequences
      .map(
        (item) => `  - id: ${yamlScalar(item.id)}
    severity: ${yamlScalar(item.severity)}
    message: ${yamlScalar(item.message)}
    remedy: ${yamlScalar(item.remedy)}
    questions:${yamlArray(item.questions || [], 6)}`
      )
      .join("\n")
  : "  []"}
`;
}

function pythonLiteral(value, indent = 0) {
  const space = " ".repeat(indent);
  const inner = " ".repeat(indent + 4);
  if (value === null || value === undefined) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "None";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((item) => `${inner}${pythonLiteral(item, indent + 4)}`).join(",\n")}\n${space}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${pythonLiteral(item, indent + 4)}`).join(",\n")}\n${space}}`;
  }
  return JSON.stringify(String(value));
}

function componentStub(component, consequences = []) {
  return `"""Ergonomic starter component for ${component.name}.

Task type: ${component.task_type}
Target/output: ${component.target}
Metrics: ${component.metrics.join(", ")}

This file is intentionally small but operational: it gives coding agents typed
inputs/outputs, reason codes, audit fields, and consequence-gate awareness.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4


COMPONENT_ID = ${JSON.stringify(component.id)}
TASK_TYPE = ${JSON.stringify(component.task_type)}
TARGET = ${JSON.stringify(component.target)}
METRICS = ${JSON.stringify(component.metrics, null, 4)}
CONSEQUENCE_GATES = ${pythonLiteral(consequences)}


@dataclass(frozen=True)
class ComponentRequest:
    entity_id: str
    features: dict[str, object] = field(default_factory=dict)
    context: dict[str, object] = field(default_factory=dict)

    def __post_init__(self):
        if not isinstance(self.entity_id, str) or not self.entity_id.strip():
            raise ValueError("entity_id is required")
        if not isinstance(self.features, dict):
            raise ValueError("features must be a dictionary")
        if not isinstance(self.context, dict):
            raise ValueError("context must be a dictionary")


@dataclass(frozen=True)
class ComponentResult:
    component_id: str
    output: object
    reason_codes: list[str]
    audit_log: dict[str, object]


def build_component_spec():
    return {
        "component_id": COMPONENT_ID,
        "task_type": TASK_TYPE,
        "target": TARGET,
        "metrics": METRICS,
        "consequence_gates": CONSEQUENCE_GATES,
    }


def run(request: ComponentRequest) -> ComponentResult:
    output = _baseline_output(request)
    reason_codes = _reason_codes(request)
    return ComponentResult(
        component_id=COMPONENT_ID,
        output=output,
        reason_codes=reason_codes,
        audit_log={
            "decision_id": f"{COMPONENT_ID}-{uuid4().hex[:12]}",
            "component_id": COMPONENT_ID,
            "task_type": TASK_TYPE,
            "target": TARGET,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "entity_id": request.entity_id,
            "gates_present": [gate.get("id") for gate in CONSEQUENCE_GATES],
        },
    )


def _baseline_output(request: ComponentRequest):
    if TASK_TYPE == "classification":
        score = _bounded_score(request.features)
        return {"probability": score, "class_label": int(score >= 0.5)}
    if TASK_TYPE == "regression":
        return {"numeric_prediction": float(request.context.get("baseline", 0.0))}
    if TASK_TYPE == "forecasting":
        horizon = int(request.context.get("horizon", 1))
        baseline = float(request.context.get("baseline", 0.0))
        return {"future_values": [baseline for _ in range(max(1, horizon))], "prediction_horizon": horizon}
    if TASK_TYPE == "optimization":
        capacity = int(request.context.get("capacity", 1))
        candidates = list(request.context.get("candidates", []))
        return {"assignment_plan": candidates[: max(0, capacity)], "constraint_violations": max(0, len(candidates) - capacity)}
    if TASK_TYPE == "api":
        return {"endpoint_status": "contract_required", "schema_contract_pass_rate": 0.0}
    if TASK_TYPE == "dashboard":
        return {"operational_views": [], "alerts": [], "drilldowns": []}
    return {"status": "placeholder"}


def _reason_codes(request: ComponentRequest) -> list[str]:
    codes = [f"TASK_{TASK_TYPE.upper()}"]
    if CONSEQUENCE_GATES:
        codes.append("CONSEQUENCE_GATES_PRESENT")
    if request.context.get("manual_override"):
        codes.append("MANUAL_OVERRIDE_CONTEXT")
    return codes


def _bounded_score(features: dict[str, object]) -> float:
    numeric_values = [
        float(value)
        for value in features.values()
        if isinstance(value, (int, float)) and not isinstance(value, bool)
    ]
    if not numeric_values:
        return 0.5
    return max(0.0, min(1.0, sum(numeric_values) / (len(numeric_values) * 10.0)))
`;
}

function pyList(items = [], indent = 0) {
  const space = " ".repeat(indent);
  const inner = " ".repeat(indent + 4);
  if (!items.length) return "[]";
  return `[\n${items.map((item) => `${inner}${JSON.stringify(item)}`).join(",\n")}\n${space}]`;
}

function systemContractsPy(blueprint) {
  return `"""Shared contracts for the generated multi-component system."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


COMPONENT_IDS = ${pyList((blueprint.components || []).map((component) => component.id))}
BLOCKING_GATES = ${pythonLiteral(
    [
      ...(blueprint.consequences?.blocking || []),
      ...(blueprint.component_consequences?.blocking || [])
    ].map((gate) => ({
      id: gate.id,
      component_id: gate.component_id || null,
      message: gate.message
    }))
  )}


@dataclass(frozen=True)
class SystemRequest:
    entity_id: str
    payload: dict[str, Any] = field(default_factory=dict)
    requested_at: str = ""

    def __post_init__(self):
        if not isinstance(self.entity_id, str) or not self.entity_id.strip():
            raise ValueError("entity_id is required")
        if not isinstance(self.payload, dict):
            raise ValueError("payload must be a dictionary")
        if self.requested_at:
            datetime.fromisoformat(self.requested_at.replace("Z", "+00:00"))


@dataclass(frozen=True)
class SystemResponse:
    decision_id: str
    outputs: dict[str, Any]
    reason_codes: list[str]
    audit_log: dict[str, Any]


def blocking_gate_ids() -> list[str]:
    return [gate["id"] for gate in BLOCKING_GATES]
`;
}

function systemReasonCodesPy() {
  return `"""Shared reason-code helpers."""


def reason_codes_for_outputs(outputs):
    codes = []
    for component_id, output in outputs.items():
        codes.append(f"{component_id}:OUTPUT_READY")
        if isinstance(output, dict) and output.get("constraint_violations", 0):
            codes.append(f"{component_id}:CONSTRAINT_VIOLATION")
        if isinstance(output, dict) and output.get("probability", 0) >= 0.5:
            codes.append(f"{component_id}:HIGH_PROBABILITY")
    return codes or ["NO_COMPONENT_OUTPUTS"]
`;
}

function systemAuditPy() {
  return `"""Audit log helpers for generated system scaffolds."""

from datetime import datetime, timezone
from uuid import uuid4


def make_audit_log(entity_id, outputs, extra=None):
    return {
        "decision_id": f"decision-{uuid4().hex[:12]}",
        "entity_id": entity_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "component_ids": sorted(outputs),
        "extra": extra or {},
    }
`;
}

function systemMonitoringPy() {
  return `"""Monitoring and dashboard KPI helpers."""


def summarize_system(outputs):
    component_count = len(outputs)
    alert_count = 0
    constraint_violations = 0
    for output in outputs.values():
        if isinstance(output, dict):
            alert_count += len(output.get("alerts", []))
            constraint_violations += int(output.get("constraint_violations", 0) or 0)
    return {
        "component_count": component_count,
        "alert_count": alert_count,
        "constraint_violations": constraint_violations,
        "monitoring_coverage": 1.0 if component_count else 0.0,
    }
`;
}

function systemApiPy(blueprint) {
  const imports = (blueprint.components || [])
    .map((component) => `from components.${component.id}.src.component import ComponentRequest, run as run_${component.id}`)
    .join("\n");
  const runLines = (blueprint.components || [])
    .map(
      (component) =>
        `    outputs[${JSON.stringify(component.id)}] = run_${component.id}(ComponentRequest(entity_id=request.entity_id, features=request.payload, context=request.payload)).output`
    )
    .join("\n");
  return `"""System-level API facade.

This facade is intentionally pure Python so a coding agent can run and test the
handoff contract before choosing FastAPI, Flask, queues, or batch jobs.
"""

from __future__ import annotations

from audit import make_audit_log
from contracts import SystemRequest, SystemResponse, blocking_gate_ids
from monitoring import summarize_system
from reason_codes import reason_codes_for_outputs
${imports}


def recommend_or_score(request: SystemRequest, acknowledge_blocking_gates=False) -> SystemResponse:
    gates = blocking_gate_ids()
    if gates and not acknowledge_blocking_gates:
        raise ValueError("Blocking ModelBlueprint gates must be resolved or acknowledged: " + ", ".join(gates))

    outputs = {}
${runLines || "    outputs = {}"}
    audit_log = make_audit_log(request.entity_id, outputs, {"monitoring": summarize_system(outputs)})
    return SystemResponse(
        decision_id=audit_log["decision_id"],
        outputs=outputs,
        reason_codes=reason_codes_for_outputs(outputs),
        audit_log=audit_log,
    )
`;
}

function testSystemScaffoldPy(blueprint) {
  return `from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "system"))

from contracts import SystemRequest, blocking_gate_ids
from api import recommend_or_score


class TestSystemScaffold(unittest.TestCase):
    def test_system_request_requires_entity_id(self):
        with self.assertRaises(ValueError):
            SystemRequest(entity_id="")

    def test_api_blocks_when_modelblueprint_gates_exist(self):
        if not blocking_gate_ids():
            self.skipTest("no blocking gates in this blueprint")
        with self.assertRaises(ValueError):
            recommend_or_score(SystemRequest(entity_id="entity-1", payload={}))

    def test_api_runs_with_explicit_gate_acknowledgment(self):
        response = recommend_or_score(
            SystemRequest(entity_id="entity-1", payload={"risk": 0.4, "capacity": 1}),
            acknowledge_blocking_gates=True,
        )
        self.assertTrue(response.decision_id)
        self.assertTrue(response.audit_log["component_ids"])
        self.assertIn("monitoring", response.audit_log["extra"])


if __name__ == "__main__":
    unittest.main()
`;
}

function systemArchitectureMarkdown(blueprint) {
  const componentConsequences = blueprint.component_consequences?.by_component || {};
  return `# System Architecture

Project type: ${blueprint.project_type}
Engine: ${blueprint.engine_name || "MILLE"}
Verdict: ${blueprint.consequences?.verdict || "ok"}

## Decision Trace
${(blueprint.decision_trace || []).map((item) => `- ${item}`).join("\n")}

## Components
${(blueprint.components || [])
  .map(
    (component, index) =>
      `${index + 1}. **${component.name}** (${component.task_type})\n   - Target/output: ${component.target}\n   - Objective: ${component.objective}\n   - Metrics: ${component.metrics.join(", ")}`
  )
  .join("\n")}

## Integration Contract
- Define shared entity IDs and timestamps before implementation.
- Keep each component's schema in \`components/<component_id>/component.yaml\`.
- Wire prediction outputs into optimization and dashboard components through explicit typed contracts.
- Resolve generated questions and acceptance gates before production deployment.

## Agent Preflight
Before coding, run:

\`\`\`bash
python tools/agent_preflight.py
\`\`\`

The command reads \`agent_spec.json\`, \`consequences.json\`, \`component_consequences.json\`, and the system schema before an agent starts editing.

## Component Consequences
${Object.keys(componentConsequences).length
  ? Object.entries(componentConsequences)
      .map(([componentId, items]) => {
        const component = (blueprint.components || []).find((candidate) => candidate.id === componentId);
        const title = component ? component.name : componentId;
        return `### ${title}\n${items
          .map((item) => `- ${item.severity}: ${item.id} - ${item.message}`)
          .join("\n")}`;
      })
      .join("\n\n")
  : "- None."}

## Generated Questions
${(blueprint.generated_questions || []).map((question) => `- ${question}`).join("\n") || "- None generated."}
`;
}

function systemSchema(blueprint) {
  return `project_type: ${yamlScalar(blueprint.project_type || "single_task")}
engine: ${yamlScalar(blueprint.engine_name || "MILLE")}
components:
${(blueprint.components || [])
  .map(
    (component) => `  - id: ${yamlScalar(component.id)}
    task_type: ${yamlScalar(component.task_type)}
    target: ${yamlScalar(component.target)}
    metrics:${yamlArray(component.metrics, 6)}
    consumes:${yamlArray(component.data_needs, 6)}
    produces:${yamlArray(component.outputs, 6)}`
  )
  .join("\n")}
integration:
  shared_keys: []
  shared_timestamps: []
  handoff_contracts_required: true
validation:
  component_contract_tests_required: true
  leakage_checks_required: true
  temporal_validation_required_for_forecasting: true
component_consequence_verdict: ${yamlScalar(blueprint.component_consequences?.verdict || "ok")}
`;
}

function testSystemArchitecture() {
  return `from pathlib import Path
import unittest


class TestSystemArchitecture(unittest.TestCase):
    def test_system_schema_has_components(self):
        text = Path("system_schema.yaml").read_text()
        self.assertIn('project_type: "multi_component_system"', text)
        self.assertIn("components:", text)
        self.assertIn("task_type:", text)


if __name__ == "__main__":
    unittest.main()
`;
}

function buildMultiComponentProjectFiles(blueprint, { datasetCsv = null, datasetFilename = "training.csv" } = {}) {
  const entries = [
    zipEntry("project/"),
    zipEntry("project/data/"),
    zipEntry("project/notebooks/"),
    zipEntry("project/components/"),
    zipEntry("project/tests/"),
    zipEntry("project/tools/"),
    zipEntry("project/system/"),
    zipEntry("project/artifacts/"),
    zipEntry("project/data/README.md", "Place raw and curated source data here. Keep raw data immutable.\n"),
    zipEntry("project/notebooks/README.md", "Use this folder for cross-component exploration notebooks.\n"),
    zipEntry("project/artifacts/.gitkeep", ""),
    zipEntry("project/blueprint.md", markdownBlueprint(blueprint)),
    zipEntry("project/system_architecture.md", systemArchitectureMarkdown(blueprint)),
    zipEntry("project/system_schema.yaml", systemSchema(blueprint)),
    zipEntry("project/agent_spec.json", `${JSON.stringify(blueprint.agent_spec, null, 2)}\n`),
    zipEntry("project/decision_trace.json", `${JSON.stringify(blueprint.decision_trace || [], null, 2)}\n`),
    zipEntry("project/components.json", `${JSON.stringify(blueprint.components || [], null, 2)}\n`),
    zipEntry("project/consequences.json", `${JSON.stringify(blueprint.consequences || null, null, 2)}\n`),
    zipEntry("project/component_consequences.json", `${JSON.stringify(blueprint.component_consequences || null, null, 2)}\n`),
    zipEntry("project/retrieved_knowledge.json", `${JSON.stringify(blueprint.retrieved_knowledge || [], null, 2)}\n`),
    zipEntry("project/data_profile.json", `${JSON.stringify(blueprint.dataset_profile || null, null, 2)}\n`),
    zipEntry("project/tools/agent_preflight.py", agentPreflightPy()),
    zipEntry("project/components/__init__.py", ""),
    zipEntry("project/system/__init__.py", ""),
    zipEntry("project/system/contracts.py", systemContractsPy(blueprint)),
    zipEntry("project/system/reason_codes.py", systemReasonCodesPy()),
    zipEntry("project/system/audit.py", systemAuditPy()),
    zipEntry("project/system/monitoring.py", systemMonitoringPy()),
    zipEntry("project/system/api.py", systemApiPy(blueprint)),
    zipEntry("project/requirements.txt", "joblib\nnumpy\npandas\npyyaml\nscikit-learn\n"),
    zipEntry("project/tests/test_system_architecture.py", testSystemArchitecture()),
    zipEntry("project/tests/test_system_scaffold.py", testSystemScaffoldPy(blueprint))
  ];

  if (datasetCsv) {
    entries.push(zipEntry("project/data/training.csv", datasetCsv));
    entries.push(zipEntry("project/data/SOURCE_FILENAME.txt", `${datasetFilename}\n`));
  }

  for (const component of blueprint.components || []) {
    const base = `project/components/${component.id}/`;
    const consequences = blueprint.component_consequences?.by_component?.[component.id] || [];
    entries.push(zipEntry(base));
    entries.push(zipEntry(`${base}__init__.py`, ""));
    entries.push(zipEntry(`${base}README.md`, componentMarkdown(component, consequences)));
    entries.push(zipEntry(`${base}component.yaml`, componentSchema(component, consequences)));
    entries.push(zipEntry(`${base}src/`));
    entries.push(zipEntry(`${base}src/__init__.py`, ""));
    entries.push(zipEntry(`${base}src/component.py`, componentStub(component, consequences)));
  }

  return entries;
}

export function buildProjectFiles(blueprint, { datasetCsv = null, datasetFilename = "training.csv" } = {}) {
  if (blueprint.project_type === "multi_component_system" && (blueprint.components || []).length) {
    return buildMultiComponentProjectFiles(blueprint, { datasetCsv, datasetFilename });
  }

  const entries = [
    zipEntry("project/"),
    zipEntry("project/data/"),
    zipEntry("project/notebooks/"),
    zipEntry("project/src/"),
    zipEntry("project/tests/"),
    zipEntry("project/tools/"),
    zipEntry("project/artifacts/"),
    zipEntry("project/data/README.md", "Place training, validation, and test data here. Keep raw data immutable.\n"),
    zipEntry("project/notebooks/README.md", "Use this folder for exploration notebooks. Move reusable logic into src/.\n"),
    zipEntry("project/artifacts/.gitkeep", ""),
    zipEntry("project/blueprint.md", markdownBlueprint(blueprint)),
    zipEntry("project/agent_spec.json", `${JSON.stringify(blueprint.agent_spec, null, 2)}\n`),
    zipEntry("project/decision_trace.json", `${JSON.stringify(blueprint.decision_trace || [], null, 2)}\n`),
    zipEntry("project/components.json", `${JSON.stringify(blueprint.components || [], null, 2)}\n`),
    zipEntry("project/consequences.json", `${JSON.stringify(blueprint.consequences || null, null, 2)}\n`),
    zipEntry("project/component_consequences.json", `${JSON.stringify(blueprint.component_consequences || null, null, 2)}\n`),
    zipEntry("project/retrieved_knowledge.json", `${JSON.stringify(blueprint.retrieved_knowledge || [], null, 2)}\n`),
    zipEntry("project/data_profile.json", `${JSON.stringify(blueprint.dataset_profile || null, null, 2)}\n`),
    zipEntry("project/tools/agent_preflight.py", agentPreflightPy()),
    zipEntry("project/requirements.txt", "joblib\nnumpy\npandas\npyyaml\nscikit-learn\n"),
    zipEntry("project/tests/test_data_contract.py", testDataContract())
  ];

  if (datasetCsv) {
    entries.push(zipEntry("project/data/training.csv", datasetCsv));
    entries.push(zipEntry("project/data/SOURCE_FILENAME.txt", `${datasetFilename}\n`));
  }

  for (const [filename, content] of Object.entries(blueprint.files)) {
    const target = /^test_.*\.py$/.test(filename)
      ? `project/tests/${filename}`
      : filename.endsWith(".py")
        ? `project/src/${filename}`
        : `project/${filename}`;
    entries.push(zipEntry(target, content));
  }

  return entries;
}

export function buildProjectZip(blueprint, options = {}) {
  return createZip(buildProjectFiles(blueprint, options));
}

export function exportFilename(blueprint) {
  const slug = blueprint.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${slug || "modelblueprint-project"}.zip`;
}
