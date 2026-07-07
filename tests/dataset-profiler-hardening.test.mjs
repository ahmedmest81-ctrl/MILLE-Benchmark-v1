import assert from "node:assert/strict";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";

test("repeated entity columns trigger group-aware split validation and codegen", () => {
  const rows = ["customer_id,amount,merchant_risk,is_fraud"];
  for (let index = 0; index < 24; index += 1) {
    rows.push(`cust_${index % 6},${20 + index},${index % 3 === 0 ? "high" : "low"},${index % 5 === 0 ? 1 : 0}`);
  }
  const profile = analyzeDataset({
    csvText: rows.join("\n"),
    filename: "fraud_groups.csv",
    idea: "Predict transaction fraud. The target is is_fraud."
  });
  const blueprint = generateBlueprint({
    idea: "Predict transaction fraud. The target is is_fraud.",
    task: "classification",
    audience: "technical",
    dataset_profile: profile
  });
  const splitGate = blueprint.consequences.blocking.find((gate) => gate.id === "split-validity");

  assert.deepEqual(profile.inferred.group_columns, ["customer_id"]);
  assert.ok(profile.split_warnings.some((warning) => /GroupKFold|GroupShuffleSplit/.test(warning.reason)));
  assert.equal(blueprint.decision.split_strategy, "group");
  assert.equal(blueprint.decision.group_split_column, "customer_id");
  assert.ok(splitGate);
  assert.deepEqual(splitGate.computed.group_signals, ["customer_id"]);
  assert.match(blueprint.files["train.py"], /GroupShuffleSplit/);
  assert.doesNotMatch(blueprint.files["train.py"], /train_test_split/);
});

test("tiny samples downgrade statistical lookup leakage to a warning", () => {
  const csv = [
    "row_id,proxy_status,is_bad",
    "r1,clean,0",
    "r2,clean,0",
    "r3,clean,0",
    "r4,clean,0",
    "r5,clean,0",
    "r6,flagged,1",
    "r7,flagged,1",
    "r8,flagged,1",
    "r9,flagged,1",
    "r10,flagged,1"
  ].join("\n");
  const profile = analyzeDataset({ csvText: csv, filename: "tiny_proxy.csv", idea: "Predict is_bad." });
  const proxyWarning = profile.leakage_warnings.find((warning) => warning.column === "proxy_status");

  assert.ok(proxyWarning);
  assert.equal(proxyWarning.severity, "warn");
  assert.match(proxyWarning.reason, /low-confidence statistical signal/);
  assert.ok(profile.quality_warnings.some((warning) => warning.column === "dataset" && /Only 10 rows/.test(warning.reason)));
});

test("profiler flags PII, protected proxies, variance, and categorical cardinality", () => {
  const rows = ["email,age,zip_code,constant_flag,mostly_constant,promo_code,churn"];
  for (let index = 0; index < 120; index += 1) {
    rows.push(
      `person${index}@example.com,${20 + (index % 50)},10${String(index % 20).padStart(3, "0")},1,${index === 119 ? "rare" : "common"},promo_${index % 80},${index % 2}`
    );
  }
  const profile = analyzeDataset({ csvText: rows.join("\n"), filename: "governance.csv", idea: "Predict churn." });
  const warningText = profile.quality_warnings.map((warning) => `${warning.column}: ${warning.reason}`).join("\n");

  assert.match(warningText, /email.*direct PII/i);
  assert.match(warningText, /age.*protected or sensitive/i);
  assert.match(warningText, /zip_code.*protected-attribute proxy/i);
  assert.match(warningText, /constant_flag.*zero variance/i);
  assert.match(warningText, /mostly_constant.*near-zero variance/i);
  assert.match(warningText, /promo_code.*one-hot encoding may explode/i);
});

test("cutoff dates must fall inside the profiled date range", () => {
  const rows = ["application_id,application_date,income,defaulted"];
  for (let index = 0; index < 40; index += 1) {
    rows.push(`app_${index},2024-02-${String((index % 20) + 1).padStart(2, "0")},${40000 + index * 100},${index % 7 === 0 ? 1 : 0}`);
  }
  const profile = analyzeDataset({
    csvText: rows.join("\n"),
    filename: "applications.csv",
    idea: "Predict defaulted from application_date and income."
  });
  const blueprint = generateBlueprint({
    idea: "Predict defaulted from application_date and income.",
    task: "classification",
    audience: "technical",
    dataset_profile: profile,
    gate_answers: {
      cutoff_date: "2024-01-01"
    }
  });
  const splitGate = blueprint.consequences.blocking.find((gate) => gate.id === "split-validity");

  assert.ok(splitGate);
  assert.equal(splitGate.resolution_status, "blocking");
  assert.match(splitGate.resolution_note, /strictly inside application_date's observed range/);
});

test("optional holdout CSV detects train-test row overlap", () => {
  const train = [
    "customer_id,amount,is_fraud",
    "c1,10,0",
    "c2,20,1",
    "c3,30,0"
  ].join("\n");
  const holdout = [
    "customer_id,amount,is_fraud",
    "c2,20,1",
    "c4,40,0"
  ].join("\n");
  const profile = analyzeDataset({
    csvText: train,
    filename: "train.csv",
    holdoutCsvText: holdout,
    holdoutFilename: "test.csv",
    idea: "Predict is_fraud."
  });

  assert.equal(profile.holdout_overlap.exact_duplicate_rows, 1);
  assert.equal(profile.holdout_overlap.feature_duplicate_rows, 1);
  assert.ok(profile.quality_warnings.some((warning) => warning.column === "train_test_overlap" && warning.severity === "block"));
});
