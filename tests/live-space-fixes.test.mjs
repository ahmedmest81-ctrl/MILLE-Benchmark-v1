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

const loanDefaultCsv = `applicant_id,age,income,credit_score,existing_loan_amount,application_date,months_since_last_late_payment,total_late_fees_charged,collections_flag,default_within_12m
1001,34,52000,650,12000,2024-01-15,3,0,0,0
1002,41,87000,720,20000,2024-01-20,1,0,0,0
1003,29,31000,580,8000,2024-02-02,1,150,1,1
1004,52,99000,760,24000,2024-02-10,2,0,0,0
1005,38,40000,610,10000,2024-02-14,2,80,1,1
1006,46,68000,700,15000,2024-02-21,0,0,0,0
1007,25,28000,560,5000,2024-03-05,0,220,1,1
1008,57,91000,740,22000,2024-03-12,4,0,0,0
1009,31,61000,690,13000,2024-03-18,1,0,0,0
1010,44,73000,710,18000,2024-03-25,2,0,0,0`;

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

test("within-duration idea language triggers temporal validation", () => {
  const idea =
    "Predict whether a bank loan applicant will default within 12 months from age, income, credit_score, existing_loan_amount, and application_date.";
  const claims = parseIdeaClaims(idea);
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical" });

  assert.equal(claims.has_time_language, true);
  assert.equal(blueprint.decision.split_strategy, "temporal");
  assert.ok(blueprint.consequences.blocking.some((item) => item.id === "split-validity"));
  assert.match(blueprint.files["train.py"], /TimeSeriesSplit/);
  assert.doesNotMatch(blueprint.files["train.py"], /train_test_split/);
});

test("value-based leakage detection catches target proxies and respects confirmed exclusions", () => {
  const idea =
    "Predict whether a bank loan applicant will default within 12 months from age, income, credit_score, existing_loan_amount, application_date, months_since_last_late_payment, total_late_fees_charged, and collections_flag.";
  const profile = analyzeDataset({ csvText: loanDefaultCsv, filename: "loan_default.csv", idea });
  const warningColumns = profile.leakage_warnings.map((warning) => warning.column);

  assert.ok(
    profile.leakage_warnings.some((warning) => warning.column === "collections_flag" && warning.severity === "warn")
  );
  assert.ok(
    profile.leakage_warnings.some((warning) => warning.column === "total_late_fees_charged" && warning.severity === "block")
  );
  assert.ok(!warningColumns.includes("existing_loan_amount"));

  const blueprint = generateBlueprint({
    idea,
    task: "classification",
    audience: "technical",
    dataset_profile: profile,
    gate_answers: {
      cutoff_date: "2024-03-01",
      input_validation_acknowledged: true,
      leakage_field_known_before_prediction: {
        collections_flag: false,
        total_late_fees_charged: false
      }
    }
  });
  const resolvedLeakage = blueprint.consequences.resolved.find((item) => item.id === "target-leakage");

  assert.ok(resolvedLeakage);
  assert.deepEqual(resolvedLeakage.resolution_answers, {
    collections_flag: false,
    total_late_fees_charged: false
  });
  assert.ok(!blueprint.decision.features.includes("collections_flag"));
  assert.ok(!blueprint.decision.features.includes("total_late_fees_charged"));
  assert.ok(blueprint.decision.features.includes("existing_loan_amount"));
  assert.doesNotMatch(blueprint.files["train.py"], /"collections_flag"/);
  assert.doesNotMatch(blueprint.files["train.py"], /"total_late_fees_charged"/);
  assert.match(blueprint.files["preprocessing.py"], /"existing_loan_amount"/);
});

test("target quantity terms do not bleed from unrelated idea feature prose", () => {
  const idea =
    "Predict whether a bank loan applicant will default within 12 months, using applicant demographics, credit score, income, and loan repayment history so the bank can flag high-risk applications before approval.";
  const profile = analyzeDataset({ csvText: loanDefaultCsv, filename: "loan_default.csv", idea });
  const warningColumns = profile.leakage_warnings.map((warning) => warning.column);

  assert.ok(!warningColumns.includes("existing_loan_amount"));
  assert.ok(
    profile.leakage_warnings.some((warning) => warning.column === "collections_flag" && warning.severity === "warn")
  );
  assert.ok(
    profile.leakage_warnings.some((warning) => warning.column === "total_late_fees_charged" && warning.severity === "block")
  );
});

test("legitimate revenue and ltv target leakage still fires", () => {
  const churnCsv = [
    "customer_id,total_lifetime_revenue,lifetime_revenue_to_date,support_tickets,churn",
    "c1,1000,900,1,0",
    "c2,2000,1800,3,0",
    "c3,120,120,8,1",
    "c4,3000,2500,0,0",
    "c5,80,80,7,1"
  ].join("\n");
  const churnProfile = analyzeDataset({
    csvText: churnCsv,
    filename: "churn_revenue.csv",
    idea: "Predict customer churn based on total lifetime revenue and support ticket history."
  });

  assert.ok(churnProfile.leakage_warnings.some((warning) => warning.column === "lifetime_revenue_to_date"));

  const revenueTargetCsv = [
    "customer_id,cumulative_revenue,support_tickets,monthly_recurring_revenue_churned",
    "c1,1000,1,0",
    "c2,1200,2,0",
    "c3,150,8,1",
    "c4,2000,0,0",
    "c5,90,7,1"
  ].join("\n");
  const revenueTargetProfile = analyzeDataset({
    csvText: revenueTargetCsv,
    filename: "revenue_target.csv",
    idea: "Build a customer model."
  });

  assert.ok(revenueTargetProfile.leakage_warnings.some((warning) => warning.column === "cumulative_revenue"));
});
