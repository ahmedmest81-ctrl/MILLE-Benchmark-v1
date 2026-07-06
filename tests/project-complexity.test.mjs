import assert from "node:assert/strict";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { componentLibrary, detectProjectComplexity } from "../project-complexity.mjs";

const hotelIdea = `Design an intelligent hotel operations system for a hotel with 200 rooms.
The hotel has approximately 30 housekeeping staff working different shifts throughout the day.
Standard check-out time is 11:00 and standard check-in time is 15:00.
Guests may request early check-in or late check-out, rooms can become unavailable due to maintenance,
and room cleaning times vary depending on room type and condition.
The system should optimize room availability, housekeeping assignments, maintenance requests, guest requests,
room readiness, staffing requirements, operational bottlenecks, occupancy forecasts, and manager insights.`;

test("component library includes every supported component class", () => {
  assert.deepEqual(Object.keys(componentLibrary()).sort(), [
    "anomaly_detection",
    "api",
    "classification",
    "dashboard",
    "forecasting",
    "optimization",
    "recommendation",
    "regression"
  ]);
});

test("hotel operations becomes a multi-component ML system", () => {
  const blueprint = generateBlueprint({ idea: hotelIdea, task: "auto", audience: "technical" });
  const componentTasks = blueprint.components.map((component) => component.task_type);

  assert.equal(blueprint.project_type, "multi_component_system");
  assert.ok(componentTasks.includes("classification"));
  assert.ok(componentTasks.includes("regression"));
  assert.ok(componentTasks.includes("forecasting"));
  assert.ok(componentTasks.includes("optimization"));
  assert.ok(componentTasks.includes("dashboard"));
  assert.ok(blueprint.components.some((component) => component.id === "housekeeping_assignment"));
  assert.ok(blueprint.components.some((component) => component.id === "room_readiness_prediction"));
  assert.ok(blueprint.decision_trace.some((item) => /Multi-component ML system selected/.test(item)));
  assert.equal(blueprint.agent_spec.project_type, "multi_component_system");
  assert.equal(blueprint.agent_spec.components.length, blueprint.components.length);
});

test("ecommerce platform includes recommendation, forecasting, classification, optimization, dashboard", () => {
  const idea =
    "Build an ecommerce marketplace operations platform that recommends products, forecasts SKU demand, predicts conversion risk, optimizes inventory allocation, and gives managers a dashboard for inventory and revenue insights.";
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });
  const tasks = new Set(blueprint.components.map((component) => component.task_type));

  assert.equal(blueprint.project_type, "multi_component_system");
  for (const task of ["recommendation", "forecasting", "classification", "optimization", "dashboard"]) {
    assert.ok(tasks.has(task), `missing ${task}`);
  }
});

test("fintech risk platform includes classification, anomaly, optimization, api, dashboard", () => {
  const idea =
    "Design a fintech risk platform for payments that scores fraud, detects anomalous account behavior, chooses review thresholds under capacity constraints, serves a real-time API, and monitors fraud operations.";
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });
  const tasks = new Set(blueprint.components.map((component) => component.task_type));

  assert.equal(blueprint.project_type, "multi_component_system");
  for (const task of ["classification", "anomaly_detection", "optimization", "api", "dashboard"]) {
    assert.ok(tasks.has(task), `missing ${task}`);
  }
});

test("bank risk platform prefers fintech components over ecommerce overlap", () => {
  const idea = `Build a bank risk and operations platform for retail banking.

The system should detect suspicious transactions, predict credit default risk, recommend which accounts need manual review, optimize fraud investigation queues under limited analyst capacity, serve real-time risk scores through an API, and give compliance managers a dashboard for fraud, AML alerts, review backlog, model drift, and customer friction.

The bank has transaction history, account profiles, loan repayment records, merchant categories, device metadata, timestamps, analyst review outcomes, chargeback labels, and customer complaint records.

The platform must support real-time transaction scoring, daily batch monitoring, audit logs, explainable decisions, fairness monitoring, and operational constraints such as review team capacity, false-positive cost, fraud loss cost, SLA latency, and regulatory reporting.`;
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });
  const componentIds = new Set(blueprint.components.map((component) => component.id));
  const tasks = new Set(blueprint.components.map((component) => component.task_type));

  assert.equal(blueprint.project_type, "multi_component_system");
  assert.ok(blueprint.decision_trace.some((item) => /fintech_risk domain detected/.test(item)));
  assert.ok(componentIds.has("fraud_risk_scoring"));
  assert.ok(componentIds.has("anomaly_alerting"));
  assert.ok(componentIds.has("risk_threshold_policy"));
  assert.ok(componentIds.has("scoring_api"));
  assert.ok(componentIds.has("risk_dashboard"));
  for (const task of ["classification", "anomaly_detection", "optimization", "api", "dashboard"]) {
    assert.ok(tasks.has(task), `missing ${task}`);
  }
  assert.ok(!componentIds.has("product_recommendation"));
  assert.ok(blueprint.component_consequences.by_component.scoring_api.some((gate) => gate.id === "api-contract-gate"));
});

test("logistics platform includes regression, forecasting, optimization, classification, dashboard", () => {
  const idea =
    "Create a logistics operations system for dispatchers that predicts ETA, forecasts shipment volume, optimizes driver route assignments, flags late delivery risk, and shows an operations dashboard.";
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });
  const tasks = new Set(blueprint.components.map((component) => component.task_type));

  assert.equal(blueprint.project_type, "multi_component_system");
  for (const task of ["regression", "forecasting", "optimization", "classification", "dashboard"]) {
    assert.ok(tasks.has(task), `missing ${task}`);
  }
});

test("selected explicit task preserves single-task mode", () => {
  const result = detectProjectComplexity({ idea: hotelIdea, selectedTask: "classification", datasetProfile: null });

  assert.equal(result.projectType, "single_task");
  assert.equal(result.shouldOverrideSingleTask, false);
  assert.ok(result.candidateComponents.length >= 3);
});

test("explicit multi-component project type overrides selected classification", () => {
  const idea = `Project type: multi_component_system

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
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical" });

  assert.equal(blueprint.project_type, "multi_component_system");
  assert.ok(blueprint.components.length >= 5);
  assert.equal(blueprint.agent_spec.project_type, "multi_component_system");
  assert.ok(!blueprint.decision.features.includes("multi_component_system"));
  assert.ok(blueprint.decision_trace.some((item) => /Explicit multi-component architecture requested/.test(item)));
});

test("multi-component systems emit component-aware consequence gates", () => {
  const idea = `Project type: multi_component_system

Components:
- Patient risk prediction: classification
- Length-of-stay estimation: regression
- Patient volume forecasting: forecasting
- Staff and bed assignment: optimization
- Clinical operations dashboard: dashboard`;
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical" });
  const gates = blueprint.component_consequences.by_component;

  assert.equal(blueprint.project_type, "multi_component_system");
  assert.equal(blueprint.consequences.verdict, "needs_resolution");
  assert.equal(blueprint.component_consequences.verdict, "needs_resolution");
  assert.ok(gates.patient_risk_prediction.some((gate) => gate.id === "classification-threshold-gate"));
  assert.ok(gates.length_of_stay_estimation.some((gate) => gate.id === "regression-baseline-gate"));
  assert.ok(gates.demand_forecast.some((gate) => gate.id === "forecast-horizon-gate" && gate.severity === "block"));
  const temporalGate = gates.demand_forecast.find((gate) => gate.id === "forecast-temporal-validation-gate");
  assert.equal(temporalGate.severity, "block");
  assert.equal(temporalGate.computed.shared_check, "split-validity");
  assert.match(temporalGate.message, /Random train\/test split is invalid/);
  assert.ok(gates.staff_bed_assignment.some((gate) => gate.id === "optimization-solver-gate"));
  assert.ok(gates.clinical_ops_dashboard.some((gate) => gate.id === "dashboard-kpi-gate"));
  assert.ok(
    blueprint.generated_questions.some((question) => question === "Demand forecasting: Prediction horizon?")
  );
  assert.equal(blueprint.agent_spec.component_consequences.verdict, "needs_resolution");
});
