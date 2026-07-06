import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { buildProjectFiles } from "../project-export.mjs";

const hospitalIdea = `Project type: multi_component_system

Decision trace:
- Hospital operations domain detected.
- Multiple operational objectives detected.
- Multi-component ML + optimization architecture selected.

Components:
- Patient risk prediction: classification
- Length-of-stay estimation: regression
- Patient volume forecasting: forecasting
- Staff and bed assignment: optimization
- Clinical operations dashboard: dashboard`;

function filesByPath(blueprint) {
  return new Map(buildProjectFiles(blueprint).map((entry) => [entry.path, new TextDecoder().decode(entry.bytes)]));
}

test("multi-component export uses component folders instead of single-task src scaffold", () => {
  const blueprint = generateBlueprint({ idea: hospitalIdea, task: "classification", audience: "technical" });
  const files = filesByPath(blueprint);

  assert.equal(blueprint.project_type, "multi_component_system");
  assert.ok(files.has("project/system_architecture.md"));
  assert.ok(files.has("project/system_schema.yaml"));
  assert.ok(files.has("project/components.json"));
  assert.ok(files.has("project/component_consequences.json"));
  assert.ok(files.has("project/tools/agent_preflight.py"));
  assert.ok(files.has("project/system/contracts.py"));
  assert.ok(files.has("project/system/api.py"));
  assert.ok(files.has("project/system/audit.py"));
  assert.ok(files.has("project/system/reason_codes.py"));
  assert.ok(files.has("project/system/monitoring.py"));
  assert.ok(files.has("project/tests/test_system_scaffold.py"));
  assert.ok(files.has("project/components/__init__.py"));
  assert.ok(files.has("project/components/patient_risk_prediction/README.md"));
  assert.ok(files.has("project/components/length_of_stay_estimation/component.yaml"));
  assert.ok(files.has("project/components/demand_forecast/src/component.py"));
  assert.ok(files.has("project/components/demand_forecast/src/__init__.py"));
  assert.ok(files.has("project/components/staff_bed_assignment/component.yaml"));
  assert.ok(files.has("project/components/clinical_ops_dashboard/README.md"));
  assert.ok(files.has("project/tests/test_system_architecture.py"));
  assert.ok(!files.has("project/src/train.py"));
  assert.ok(!files.has("project/schema.yaml"));
});

test("multi-component export system schema lists all components", () => {
  const blueprint = generateBlueprint({ idea: hospitalIdea, task: "classification", audience: "technical" });
  const files = filesByPath(blueprint);
  const schema = files.get("project/system_schema.yaml");

  assert.match(schema, /project_type: "multi_component_system"/);
  for (const id of [
    "patient_risk_prediction",
    "length_of_stay_estimation",
    "demand_forecast",
    "staff_bed_assignment",
    "clinical_ops_dashboard"
  ]) {
    assert.match(schema, new RegExp(id));
  }
  assert.match(schema, /component_consequence_verdict: "needs_resolution"/);
});

test("multi-component export writes component consequence gates into architecture and component files", () => {
  const blueprint = generateBlueprint({ idea: hospitalIdea, task: "classification", audience: "technical" });
  const files = filesByPath(blueprint);
  const architecture = files.get("project/system_architecture.md");
  const componentReadme = files.get("project/components/demand_forecast/README.md");
  const componentYaml = files.get("project/components/demand_forecast/component.yaml");
  const consequencesJson = JSON.parse(files.get("project/component_consequences.json"));

  assert.match(architecture, /## Component Consequences/);
  assert.match(architecture, /python tools\/agent_preflight\.py/);
  assert.match(architecture, /Demand forecasting/);
  assert.match(componentReadme, /forecast-horizon-gate/);
  assert.match(componentYaml, /forecast-temporal-validation-gate/);
  assert.ok(consequencesJson.by_component.demand_forecast.some((gate) => gate.id === "forecast-horizon-gate"));
});

test("multi-component blueprint markdown renders component decisions and merged blocking gates", () => {
  const blueprint = generateBlueprint({ idea: hospitalIdea, task: "classification", audience: "technical" });
  const files = filesByPath(blueprint);
  const markdown = files.get("project/blueprint.md");
  const preflight = files.get("project/tools/agent_preflight.py");

  assert.equal(blueprint.consequences.verdict, "needs_resolution");
  assert.equal(blueprint.agent_spec.consequences.verdict, blueprint.consequences.verdict);
  assert.ok(
    blueprint.decision_trace.some((item) =>
      item === "Verdict reconciliation: system=ok, components=needs_resolution -> overall=needs_resolution (max_by_severity)."
    )
  );
  assert.match(markdown, /Verdict: needs_resolution/);
  assert.match(markdown, /## Component Decisions/);
  assert.match(markdown, /Patient risk prediction \(classification\): target risk_event_label/);
  assert.doesNotMatch(markdown, /^- target: target$/m);
  assert.doesNotMatch(markdown, /confidence: high/);
  assert.match(markdown, /## Blocking Consequences\n- Demand forecasting - forecast-horizon-gate:/);
  assert.match(markdown, /Demand forecasting - forecast-temporal-validation-gate:/);
  assert.doesNotMatch(markdown, /## Blocking Consequences\n- None\./);
  assert.match(preflight, /"overall_verdict"/);
});

test("multi-component export includes ergonomic API, audit, monitoring, and gate-aware components", () => {
  const blueprint = generateBlueprint({ idea: hospitalIdea, task: "classification", audience: "technical" });
  const files = filesByPath(blueprint);

  assert.match(files.get("project/system/api.py"), /recommend_or_score/);
  assert.match(files.get("project/system/api.py"), /Blocking ModelBlueprint gates/);
  assert.match(files.get("project/system/audit.py"), /make_audit_log/);
  assert.match(files.get("project/system/reason_codes.py"), /reason_codes_for_outputs/);
  assert.match(files.get("project/system/monitoring.py"), /summarize_system/);
  assert.match(files.get("project/components/patient_risk_prediction/src/component.py"), /ComponentRequest/);
  assert.match(files.get("project/components/patient_risk_prediction/src/component.py"), /reason_codes/);
  assert.match(files.get("project/components/patient_risk_prediction/src/component.py"), /audit_log/);
  assert.match(files.get("project/components/demand_forecast/src/component.py"), /forecast-horizon-gate/);
  assert.match(files.get("project/tests/test_system_scaffold.py"), /acknowledge_blocking_gates=True/);
});

test("single-task export keeps existing src scaffold", () => {
  const blueprint = generateBlueprint({
    idea: "Detect fraudulent transactions from timestamp, amount, and a is_fraud label. 0.7% are fraud.",
    task: "classification",
    audience: "technical"
  });
  const files = filesByPath(blueprint);

  assert.notEqual(blueprint.project_type, "multi_component_system");
  assert.ok(files.has("project/src/train.py"));
  assert.ok(files.has("project/schema.yaml"));
  assert.ok(files.has("project/tools/agent_preflight.py"));
  assert.ok(!files.has("project/system_schema.yaml"));
});

test("single-task export documents agent preflight and includes gate reader", () => {
  const blueprint = generateBlueprint({
    idea: "Build a fraud scoring model. The table has merchant_risk, amount, prior_chargebacks, and an is_fraud label.",
    task: "classification",
    audience: "technical"
  });
  const files = filesByPath(blueprint);
  const preflight = files.get("project/tools/agent_preflight.py");

  assert.match(files.get("project/blueprint.md"), /python tools\/agent_preflight\.py/);
  assert.match(files.get("project/blueprint.md"), /## Corrected Decision/);
  assert.doesNotMatch(files.get("project/blueprint.md"), /## Component Decisions/);
  assert.match(preflight, /component_consequences\.json/);
  assert.match(preflight, /--acknowledge-gates/);
  assert.match(preflight, /blocking_gates/);
});

test("visible knowledge cards do not render retrieval scores", () => {
  const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");

  assert.doesNotMatch(appSource, /score\s+\$\{entry\.relevance\}/);
  assert.doesNotMatch(appSource, /semantic_score[^]*knowledge-meta/);
  assert.match(appSource, /retrieval_method/);
});
