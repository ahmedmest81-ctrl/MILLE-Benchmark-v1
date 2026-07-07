import assert from "node:assert/strict";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";
import { parseIdeaClaims } from "../idea-claims.mjs";
import { callTool } from "../mcp-server.mjs";

function imbalancedCsv() {
  const rows = ["customer_id,usage_minutes,plan,churn"];
  for (let index = 1; index <= 94; index += 1) rows.push(`c${index},${100 + index},pro,0`);
  for (let index = 95; index <= 100; index += 1) rows.push(`c${index},${100 + index},basic,1`);
  return rows.join("\n");
}

const fraudNoCsvDemoIdea =
  "Detect fraudulent transactions from our payments table with timestamp, amount, merchant_id, and a is_fraud label. 0.7% of transactions are fraud. I want the model to be accurate.";

const overlapIdea = "Predict whether a loan applicant will default, using applicant demographics and credit history.";

const overlapTrainCsv = [
  "applicant_id,age,zip_code,email,credit_score,constant_flag,default_within_12m",
  "A001,34,10001,a@example.com,650,yes,0",
  "A001,34,10001,a@example.com,650,yes,1",
  "A002,45,10002,b@example.com,720,yes,0",
  "A002,45,10002,b@example.com,720,yes,0",
  "A003,29,10003,c@example.com,580,yes,1",
  "A004,52,10004,d@example.com,760,yes,0",
  "A005,38,10005,e@example.com,610,yes,1",
  "A005,38,10005,e@example.com,610,yes,1",
  "A006,41,10006,f@example.com,690,yes,0",
  "A007,25,10007,g@example.com,560,yes,1"
].join("\n");

const contaminatedHoldoutCsv = [
  "applicant_id,age,zip_code,email,credit_score,constant_flag,default_within_12m",
  "A001,34,10001,a@example.com,650,yes,1",
  "A010,30,10010,h@example.com,600,yes,0"
].join("\n");

const cleanHoldoutCsv = [
  "applicant_id,age,zip_code,email,credit_score,constant_flag,default_within_12m",
  "A010,30,10010,h@example.com,600,yes,0",
  "A011,36,10011,i@example.com,640,yes,1"
].join("\n");

function overlapGate(blueprint) {
  return blueprint.consequences.all.find((gate) => gate.id === "train-test-overlap-gate");
}

function overlapGateAnswers() {
  return {
    group_split_column: "applicant_id",
    input_validation_acknowledged: true
  };
}

test("fraud idea without CSV blocks accuracy from claimed positive rate", () => {
  const idea = "0.7% of transactions are fraud. I want the model to be accurate.";
  const claims = parseIdeaClaims(idea);
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });

  assert.equal(claims.positive_rate, 0.007);
  assert.equal(claims.stated_objective, "accuracy");
  assert.equal(blueprint.consequences.verdict, "needs_resolution");
  assert.equal(blueprint.decision.primary_metric, "average_precision");
  assert.equal(blueprint.decision.confidence, "needs_resolution");
  assert.equal(blueprint.confidence, "Needs resolution");
  assert.notEqual(blueprint.decision.objective, "accuracy");
  const metricBlock = blueprint.consequences.blocking.find((block) => block.id === "metric-validity");
  assert.ok(metricBlock);
  assert.match(metricBlock.message, /0\.7%/);
  assert.match(metricBlock.message, /0\.993/);
  assert.match(metricBlock.message, /recall is 0/);
  assert.ok(blueprint.consequences.blocking.some((block) => block.id === "identifiable-target-gate"));
});

test("business cost answers resolve the metric-validity gate", () => {
  const idea = "0.7% of transactions are fraud. I want the model to be accurate.";
  const blueprint = generateBlueprint({
    idea,
    task: "classification",
    audience: "technical",
    gate_answers: {
      false_negative_cost: 500,
      false_positive_cost: 25,
      minimum_recall: 0.85
    }
  });

  assert.equal(blueprint.consequences.verdict, "needs_resolution");
  assert.ok(!blueprint.consequences.blocking.some((item) => item.id === "metric-validity"));
  assert.ok(blueprint.consequences.blocking.some((item) => item.id === "identifiable-target-gate"));
  assert.ok(blueprint.consequences.resolved.some((item) => item.id === "metric-validity"));
  assert.equal(blueprint.decision.threshold_policy.false_negative_cost, 500);
  assert.equal(blueprint.decision.threshold_policy.false_positive_cost, 25);
  assert.equal(blueprint.decision.threshold_policy.minimum_recall, 0.85);
  assert.equal(blueprint.decision.confidence, "needs_resolution");
  assert.ok(!blueprint.generated_questions.some((question) => /Cost of a missed positive/.test(question)));
});

test("gate answers can resolve metric, split, and validation gates together", () => {
  const blueprint = generateBlueprint({
    idea: fraudNoCsvDemoIdea,
    task: "auto",
    audience: "technical",
    gate_answers: {
      false_negative_cost: 500,
      false_positive_cost: 25,
      minimum_recall: 0.9,
      cutoff_date: "2026-03-01",
      input_validation_acknowledged: true
    }
  });
  const resolvedIds = blueprint.consequences.resolved.map((item) => item.id);

  assert.deepEqual(blueprint.decision.gate_resolution.unresolved_gate_ids, []);
  assert.deepEqual(blueprint.consequences.blocking, []);
  assert.ok(resolvedIds.includes("metric-validity"));
  assert.ok(resolvedIds.includes("split-validity"));
  assert.ok(resolvedIds.includes("data-contract-gate"));
  assert.equal(blueprint.decision.split_resolution.cutoff_date, "2026-03-01");
  assert.equal(blueprint.decision.input_validation_asserted, true);
  assert.deepEqual(blueprint.agent_spec.gate_resolution.unresolved_gate_ids, []);
});

test("v2.1 fraud demo resolves is_fraud as target and timestamp as temporal split", () => {
  const claims = parseIdeaClaims(fraudNoCsvDemoIdea);
  const blueprint = generateBlueprint({ idea: fraudNoCsvDemoIdea, task: "auto", audience: "technical" });
  const blockIds = blueprint.consequences.blocking.map((block) => block.id);
  const splitBlock = blueprint.consequences.blocking.find((block) => block.id === "split-validity");
  const renderedText = [
    blueprint.summary.Optimization,
    ...blueprint.data_contract,
    ...blueprint.model_path
  ].join("\n");

  assert.ok(claims.named_columns.includes("timestamp"));
  assert.ok(claims.named_columns.includes("amount"));
  assert.ok(claims.named_columns.includes("merchant_id"));
  assert.ok(claims.named_columns.includes("is_fraud"));
  assert.equal(claims.resolved_target, "is_fraud");
  assert.ok(!claims.resolved_features.includes("is_fraud"));
  assert.ok(!claims.resolved_features.includes("merchant_id"));
  assert.equal(claims.has_time_language, true);

  assert.equal(blueprint.decision.target, "is_fraud");
  assert.ok(!blueprint.decision.features.includes("is_fraud"));
  assert.ok(!blueprint.decision.features.includes("merchant_id"));
  assert.ok(blueprint.decision.features.includes("timestamp"));
  assert.ok(blueprint.decision.features.includes("amount"));
  assert.ok(blockIds.includes("metric-validity"));
  assert.ok(blockIds.includes("split-validity"));
  assert.equal(splitBlock.fired, true);
  assert.match(splitBlock.message, /timestamp/);
  assert.equal(blueprint.decision.split_strategy, "temporal");
  assert.equal(blueprint.decision.primary_metric, "average_precision");
  assert.equal(blueprint.confidence, "Needs resolution");
  assert.match(blueprint.files["train.py"], /TARGET = "is_fraud"/);
  assert.match(blueprint.files["train.py"], /"timestamp"/);
  assert.match(blueprint.files["train.py"], /"amount"/);
  assert.doesNotMatch(blueprint.files["train.py"].match(/FEATURES = \[[\s\S]*?\]/)?.[0] || "", /"is_fraud"/);
  assert.doesNotMatch(renderedText, /\brandom\b/i);
  assert.doesNotMatch(renderedText, /\bROC-AUC\b/i);
  assert.doesNotMatch(renderedText, /\baccuracy\b/i);
});

test("software-build fraud scenario parses table has column prose", () => {
  const idea =
    "Build a fraud detection web service for our payments table. The table has timestamp, amount, merchant_id, user_id, card_country, device_type, and a is_fraud label. Only 0.7% of transactions are fraud. I want the model to be accurate and expose an API endpoint that scores new transactions.";
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });

  assert.deepEqual(blueprint.claims.named_columns, [
    "timestamp",
    "amount",
    "merchant_id",
    "user_id",
    "card_country",
    "device_type",
    "is_fraud"
  ]);
  assert.equal(blueprint.decision.target, "is_fraud");
  assert.deepEqual(blueprint.decision.features, ["timestamp", "amount", "card_country", "device_type"]);
  assert.equal(blueprint.decision.split_strategy, "temporal");
  assert.equal(blueprint.decision.primary_metric, "average_precision");
  assert.ok(blueprint.consequences.blocking.some((block) => block.id === "metric-validity"));
  assert.ok(blueprint.consequences.blocking.some((block) => block.id === "split-validity"));
});

test("fraud CSV wins over claimed checks and blocks accuracy", () => {
  const idea = "predict churn from customer activity; I want the model to be accurate";
  const profile = analyzeDataset({ csvText: imbalancedCsv(), filename: "imbalanced_churn.csv", idea });
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical", dataset_profile: profile });
  const check = blueprint.dataset_profile.executable_checks[0];

  assert.equal(check.majority_accuracy, 0.94);
  assert.equal(check.minority_recall, 0);
  assert.equal(blueprint.consequences.verdict, "needs_resolution");
  assert.equal(blueprint.decision.primary_metric, "average_precision");
  assert.match(blueprint.files["train.py"], /average_precision_score/);
});

test("train-test overlap gate blocks contaminated holdout files", () => {
  const profile = analyzeDataset({
    csvText: overlapTrainCsv,
    filename: "train.csv",
    holdoutCsvText: contaminatedHoldoutCsv,
    holdoutFilename: "holdout.csv",
    idea: overlapIdea
  });
  const blueprint = generateBlueprint({
    idea: overlapIdea,
    task: "classification",
    audience: "technical",
    dataset_profile: profile,
    gate_answers: overlapGateAnswers()
  });
  const gate = overlapGate(blueprint);

  assert.equal(profile.holdout_overlap.exact_duplicate_rows, 1);
  assert.ok(profile.quality_warnings.some((warning) => warning.column === "train_test_overlap" && warning.severity === "block"));
  assert.equal(gate.fired, true);
  assert.equal(gate.severity, "block");
  assert.ok(blueprint.consequences.blocking.some((block) => block.id === "train-test-overlap-gate"));
  assert.match(gate.computed.advisory_policy, /warn-severity quality_warnings stay advisory-only/i);
});

test("train-test overlap gate is not applicable without holdout data", () => {
  const profile = analyzeDataset({ csvText: overlapTrainCsv, filename: "train.csv", idea: overlapIdea });
  const blueprint = generateBlueprint({
    idea: overlapIdea,
    task: "classification",
    audience: "technical",
    dataset_profile: profile,
    gate_answers: overlapGateAnswers()
  });
  const gate = overlapGate(blueprint);

  assert.equal(profile.holdout_overlap, null);
  assert.equal(gate.fired, false);
  assert.equal(blueprint.consequences.blocking.some((block) => block.id === "train-test-overlap-gate"), false);
});

test("train-test overlap gate does not fire for distinct holdout rows", () => {
  const profile = analyzeDataset({
    csvText: overlapTrainCsv,
    filename: "train.csv",
    holdoutCsvText: cleanHoldoutCsv,
    holdoutFilename: "holdout.csv",
    idea: overlapIdea
  });
  const blueprint = generateBlueprint({
    idea: overlapIdea,
    task: "classification",
    audience: "technical",
    dataset_profile: profile,
    gate_answers: overlapGateAnswers()
  });
  const gate = overlapGate(blueprint);

  assert.notEqual(profile.holdout_overlap, null);
  assert.equal(profile.holdout_overlap.exact_duplicate_rows, 0);
  assert.equal(profile.holdout_overlap.feature_duplicate_rows, 0);
  assert.equal(gate.fired, false);
  assert.equal(blueprint.consequences.blocking.some((block) => block.id === "train-test-overlap-gate"), false);
});

test("train-test overlap gate fails score and export readiness", async () => {
  const profileResponse = await callTool("mille_profile_dataset", {
    csv_text: overlapTrainCsv,
    filename: "train.csv",
    holdout_csv_text: contaminatedHoldoutCsv,
    holdout_filename: "holdout.csv",
    idea: overlapIdea
  });
  const profile = profileResponse.structuredContent.profile;
  const blueprintResponse = await callTool("mille_generate_blueprint", {
    idea: overlapIdea,
    task: "classification",
    audience: "technical",
    dataset_profile: profile,
    gate_answers: overlapGateAnswers()
  });
  const blueprint = blueprintResponse.structuredContent.blueprint;
  const scoreResponse = await callTool("mille_score_blueprint", { blueprint });
  const exportResponse = await callTool("mille_export_project", {
    idea: overlapIdea,
    task: "classification",
    audience: "technical",
    dataset_profile: profile,
    gate_answers: overlapGateAnswers(),
    include_zip_base64: true
  });

  assert.ok(blueprint.consequences.blocking.some((block) => block.id === "train-test-overlap-gate"));
  assert.notEqual(scoreResponse.structuredContent.verdict, "ready");
  assert.ok(scoreResponse.structuredContent.score < 100);
  assert.equal(
    scoreResponse.structuredContent.checks.find((check) => check.id === "no_blocking_gates").passed,
    false
  );
  assert.equal(exportResponse.structuredContent.export_allowed, false);
  assert.equal("zip_base64" in exportResponse.structuredContent, false);
  assert.ok(
    exportResponse.structuredContent.blocking_gates.some((gate) => gate.id === "train-test-overlap-gate")
  );
});

test("revenue idea without CSV blocks random split and aggregate leakage", () => {
  const idea =
    "We have a customer table with signup_date, total_payments_to_date, last_payment_date, current_mrr, and lifetime_value. Predict next-quarter revenue. Use a normal train/test split.";
  const claims = parseIdeaClaims(idea);
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });
  const blockIds = blueprint.consequences.blocking.map((block) => block.id);
  const leakageBlock = blueprint.consequences.blocking.find((block) => block.id === "target-leakage");

  assert.equal(claims.stated_split, "random");
  assert.equal(claims.has_time_language, true);
  assert.ok(claims.named_columns.includes("lifetime_value"));
  assert.ok(claims.named_columns.includes("total_payments_to_date"));
  assert.ok(blockIds.includes("split-validity"));
  assert.ok(blockIds.includes("target-leakage"));
  assert.equal(blueprint.decision.split_strategy, "temporal");
  assert.ok(leakageBlock.computed.blocked_columns.includes("lifetime_value"));
  assert.ok(leakageBlock.computed.blocked_columns.includes("total_payments_to_date"));
  assert.ok(!blueprint.decision.features.includes("lifetime_value"));
  assert.ok(!blueprint.decision.features.includes("total_payments_to_date"));
  assert.match(blueprint.files["train.py"], /TimeSeriesSplit/);
  assert.doesNotMatch(blueprint.files["train.py"], /train_test_split/);
  assert.doesNotMatch(blueprint.files["schema.yaml"], /lifetime_value/);
  assert.doesNotMatch(blueprint.files["schema.yaml"], /total_payments_to_date/);
});

test("clean house price idea does not create false blocking consequences", () => {
  const idea = "Predict house price. Table has columns property_id, sqft, location, bedrooms, price. Use an out-of-time split.";
  const blueprint = generateBlueprint({ idea, task: "auto", audience: "technical" });

  assert.equal(blueprint.consequences.verdict, "ok");
  assert.equal(blueprint.consequences.blocking.length, 0);
  assert.notEqual(blueprint.confidence, "Needs resolution");
});
