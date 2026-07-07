import assert from "node:assert/strict";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";

function temporalGroupCsv() {
  const rows = ["customer_id,application_date,age,amount,risk_score,is_fraud"];
  const customers = Array.from({ length: 10 }, (_, index) => `CUST${String(index).padStart(3, "0")}`);
  const dates = [
    "2024-01-05",
    "2024-01-15",
    "2024-01-25",
    "2024-02-05",
    "2024-02-15",
    "2024-02-25",
    "2024-03-05",
    "2024-03-15",
    "2024-03-25",
    "2024-04-05",
    "2024-04-15",
    "2024-04-25",
    "2024-05-05",
    "2024-05-15",
    "2024-05-25",
    "2024-06-05",
    "2024-06-15",
    "2024-06-25"
  ];
  for (let index = 0; index < 30; index += 1) {
    rows.push(
      `${customers[index % customers.length]},${dates[index % dates.length]},${22 + (index * 7) % 45},${100 + index},${(index / 100).toFixed(2)},${index % 2}`
    );
  }
  return rows.join("\n");
}

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

test("temporal group split codegen preserves both date ordering and entity groups with a dataset profile", () => {
  const idea = "Predict whether a transaction is fraudulent based on customer history and risk score.";
  const profile = analyzeDataset({
    csvText: temporalGroupCsv(),
    filename: "temporal_groups.csv",
    idea
  });
  const blueprint = generateBlueprint({
    idea,
    task: "classification",
    audience: "technical",
    dataset_profile: profile,
    gate_answers: {
      cutoff_date: "2024-03-15",
      group_split_column: "customer_id",
      input_validation_acknowledged: true
    }
  });
  const trainPy = blueprint.files["train.py"];
  const schemaYaml = blueprint.files["schema.yaml"];

  assert.deepEqual(profile.inferred.group_columns, ["customer_id"]);
  assert.deepEqual(profile.inferred.date_columns, ["application_date"]);
  assert.equal(blueprint.decision.split_strategy, "temporal_group");
  assert.equal(blueprint.decision.group_split_column, "customer_id");
  assert.match(schemaYaml, /split_policy: grouped_time_based/);
  assert.match(trainPy, /from sklearn\.model_selection import GroupShuffleSplit/);
  assert.match(trainPy, /group_column = "customer_id"/);
  assert.match(trainPy, /date_column = "application_date"/);
  assert.match(trainPy, /sort_values\("__split_date"\)/);
  assert.match(trainPy, /train_groups\.intersection\(test_groups\)/);
  assert.doesNotMatch(trainPy, /TimeSeriesSplit/);
});

test("idea-only temporal group split codegen keeps the explicit group column", () => {
  const idea =
    "Predict fraud. The table has customer_id, application_date, amount, risk_score, and a is_fraud label. Use grouped time-based validation by customer_id.";
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical" });
  const trainPy = blueprint.files["train.py"];

  assert.equal(blueprint.decision.split_strategy, "temporal_group");
  assert.equal(blueprint.decision.group_split_column, "customer_id");
  assert.match(blueprint.files["schema.yaml"], /split_policy: grouped_time_based/);
  assert.match(trainPy, /group_column = "customer_id"/);
  assert.match(trainPy, /date_column = "application_date"/);
  assert.match(trainPy, /from sklearn\.model_selection import GroupShuffleSplit/);
  assert.match(trainPy, /sort_values\("__split_date"\)/);
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

test("date-kind values do not trigger PII shape warnings while sensitive names still warn", () => {
  const rows = ["application_date,date_of_birth,email,is_fraud"];
  for (let index = 0; index < 40; index += 1) {
    rows.push(
      `2024-01-${String((index % 20) + 1).padStart(2, "0")},1980-02-${String((index % 20) + 1).padStart(2, "0")},person${index}@example.com,${index % 2}`
    );
  }
  const profile = analyzeDataset({ csvText: rows.join("\n"), filename: "dates_and_pii.csv", idea: "Predict is_fraud." });
  const warningsFor = (column) =>
    profile.quality_warnings
      .filter((warning) => warning.column === column)
      .map((warning) => warning.reason)
      .join("\n");

  assert.equal(profile.columns.find((column) => column.name === "application_date")?.kind, "date");
  assert.equal(profile.columns.find((column) => column.name === "date_of_birth")?.kind, "date");
  assert.doesNotMatch(warningsFor("application_date"), /direct PII/i);
  assert.match(warningsFor("email"), /direct PII/i);
  assert.match(warningsFor("date_of_birth"), /protected or sensitive/i);
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
