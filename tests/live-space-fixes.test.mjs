import assert from "node:assert/strict";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";
import { parseIdeaClaims } from "../idea-claims.mjs";

const fraudCsv = `transaction_id,customer_id,timestamp,amount,merchant_risk,prior_chargebacks,is_fraud
tx001,c001,2026-01-01T09:03:00Z,18.42,low,0,0
tx002,c002,2026-01-01T10:15:00Z,27.10,low,0,0
tx003,c003,2026-01-01T11:21:00Z,44.95,medium,0,0
tx004,c004,2026-01-02T08:44:00Z,13.20,low,0,0
tx005,c005,2026-01-02T12:12:00Z,62.80,medium,0,0
tx006,c006,2026-01-02T13:09:00Z,7.99,low,0,0
tx007,c007,2026-01-03T09:40:00Z,31.50,low,0,0
tx008,c008,2026-01-03T14:32:00Z,85.10,medium,0,0
tx009,c009,2026-01-04T07:55:00Z,22.30,low,0,0
tx010,c010,2026-01-04T16:45:00Z,116.00,medium,0,0
tx011,c011,2026-01-05T08:07:00Z,9.40,low,0,0
tx012,c012,2026-01-05T18:22:00Z,48.70,medium,0,0
tx013,c013,2026-01-06T09:11:00Z,19.99,low,0,0
tx014,c014,2026-01-06T19:02:00Z,73.45,medium,0,0
tx015,c015,2026-01-07T10:31:00Z,15.00,low,0,0
tx016,c016,2026-01-07T21:18:00Z,249.99,high,1,1
tx017,c017,2026-01-08T01:42:00Z,520.40,high,2,1
tx018,c018,2026-01-08T03:05:00Z,399.00,high,1,0
tx019,c019,2026-01-08T04:25:00Z,760.25,high,3,1
tx020,c020,2026-01-08T05:12:00Z,33.30,medium,0,0`;

const hospitalCsv = `patient_id,admission_date,discharge_date,age,prior_admissions,length_of_stay_days,diagnosis_group,readmitted_30d
p001,2026-01-01,2026-01-04,72,3,3,cardiac,1
p002,2026-01-02,2026-01-05,45,0,3,orthopedic,0
p003,2026-01-03,2026-01-08,81,4,5,pulmonary,1
p004,2026-01-04,2026-01-06,33,0,2,maternity,0
p005,2026-01-05,2026-01-09,67,2,4,diabetes,0
p006,2026-01-06,2026-01-11,76,5,5,cardiac,1
p007,2026-01-07,2026-01-10,59,1,3,orthopedic,0
p008,2026-01-08,2026-01-15,84,6,7,pulmonary,1`;

test("fraud CSV exposes 85 percent majority baseline and blocks metric guidance", () => {
  const idea = "Build a fraud detection risk scoring blueprint. The target is is_fraud.";
  const profile = analyzeDataset({ csvText: fraudCsv, filename: "fraud.csv", idea });
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical", dataset_profile: profile });
  const check = profile.executable_checks.find((item) => item.kind === "classification_majority_baseline");

  assert.equal(check.majority_accuracy, 0.85);
  assert.equal(check.minority_recall, 0);
  assert.equal(blueprint.decision.primary_metric, "average_precision");
  assert.ok(blueprint.consequences.blocking.some((item) => item.id === "metric-validity"));
});

test("hospital CSV identifies readmission target and blocks admission-time leakage", () => {
  const idea =
    "Build a hospital readmission ML system at admission time. The target is readmitted_30d.";
  const profile = analyzeDataset({ csvText: hospitalCsv, filename: "hospital.csv", idea });
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical", dataset_profile: profile });
  const leakageBlock = blueprint.consequences.blocking.find((item) => item.id === "target-leakage");

  assert.equal(profile.inferred.target, "readmitted_30d");
  assert.equal(blueprint.decision.target, "readmitted_30d");
  assert.ok(leakageBlock.computed.blocked_columns.includes("discharge_date"));
  assert.ok(leakageBlock.computed.blocked_columns.includes("length_of_stay_days"));
  assert.ok(!blueprint.decision.features.includes("readmitted_30d"));
  assert.ok(!blueprint.decision.features.includes("discharge_date"));
  assert.ok(!blueprint.decision.features.includes("length_of_stay_days"));
  assert.match(blueprint.files["train.py"], /TARGET = "readmitted_30d"/);
  assert.doesNotMatch(blueprint.files["train.py"], /"readmitted_30d",/);
});

test("plain hospital prompt target is not leaked into generated FEATURES", () => {
  const idea =
    "Build a hospital readmission / operations ML system for a CSV with columns patient_id, admission_date, discharge_date, age, prior_admissions, length_of_stay_days, diagnosis_group, readmitted_30d. The target is readmitted_30d.";
  const claims = parseIdeaClaims(idea);
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical" });
  const featureBlock = blueprint.files["train.py"].match(/FEATURES = \[[\s\S]*?\]/)?.[0] || "";

  assert.equal(claims.resolved_target, "readmitted_30d");
  assert.equal(blueprint.decision.target, "readmitted_30d");
  assert.doesNotMatch(featureBlock, /readmitted_30d/);
});
