import assert from "node:assert/strict";
import test from "node:test";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";

function fieldByName(fields, name) {
  return fields.find((field) => field.field === name);
}

test("B1 uses profile structure for clinical number/count constraints", () => {
  const rows = ["patient_id,age,sex,smoker,bmi,length_of_stay_days,prior_admissions,department,readmitted_30d"];
  for (let index = 0; index < 60; index += 1) {
    rows.push(
      `pat_${index},${20 + index},${index % 2},${index % 2},${18 + index / 10},${1.5 + index / 5},${index % 5},${index % 2 ? "neuro" : "ortho"},${index % 7 === 0 ? 1 : 0}`
    );
  }
  const csv = rows.join("\n");
  const profile = analyzeDataset({
    csvText: csv,
    filename: "clinical_readmission.csv",
    idea: "Predict readmitted_30d from clinical patient data."
  });
  const blueprint = generateBlueprint({
    idea: "Predict readmitted_30d from clinical patient data.",
    task: "classification",
    audience: "technical",
    dataset_profile: profile
  });
  const gate = blueprint.consequences.all.find((item) => item.id === "data-contract-gate");

  assert.equal(fieldByName(gate.computed.fields, "age").kind, "number");
  assert.equal(fieldByName(gate.computed.fields, "bmi").kind, "number");
  assert.equal(fieldByName(gate.computed.fields, "length_of_stay_days").kind, "number");
  assert.equal(fieldByName(gate.computed.fields, "prior_admissions").kind, "count");
});

test("B1/B2/B3 customer revenue uses structural count, clean target text, and profile task", () => {
  const idea =
    "Predict next_quarter_revenue from customer subscription and payment history. Watch for future or post-outcome leakage and use temporal validation.";
  const rows = ["customer_id,signup_date,plan_tier,current_mrr,total_payments_to_date,last_payment_date,lifetime_value,support_tickets,next_quarter_revenue"];
  for (let index = 0; index < 60; index += 1) {
    rows.push(
      `cust_${index},2024-01-${String((index % 28) + 1).padStart(2, "0")},${index % 3 === 0 ? "free" : index % 3 === 1 ? "starter" : "pro"},${index * 7},${index * 80},2024-10-${String((index % 28) + 1).padStart(2, "0")},${index * 100},${index % 6},${index * 11 + 20}`
    );
  }
  const csv = rows.join("\n");
  const profile = analyzeDataset({ csvText: csv, filename: "customer_revenue.csv", idea });
  const blueprint = generateBlueprint({ idea, task: "regression", audience: "technical", dataset_profile: profile });
  const leakageReasons = profile.leakage_warnings.map((warning) => warning.reason).join("\n");
  const gate = blueprint.consequences.all.find((item) => item.id === "data-contract-gate");

  assert.equal(profile.inferred.task_type, "forecasting");
  assert.equal(blueprint.task_type, "forecasting");
  assert.equal(fieldByName(gate.computed.fields, "support_tickets").kind, "count");
  assert.match(leakageReasons, /target next_quarter_revenue/);
  assert.doesNotMatch(leakageReasons, /Predict next_quarter_revenue from customer subscription/);
  assert.ok(blueprint.consequences.blocking.some((item) => item.id === "target-leakage"));
});

test("fraud CSV still blocks metric validity and excludes IDs", () => {
  const rows = ["transaction_id,timestamp,amount,merchant_id,user_id,merchant_category,card_country,device_type,account_age_days,is_fraud"];
  for (let index = 0; index < 120; index += 1) {
    rows.push(`txn_${index},2025-01-01T00:${String(index % 60).padStart(2, "0")}:00,${20 + index},m${index},u${index},grocery,AT,web,${index + 1},${index < 2 ? 1 : 0}`);
  }
  const idea = "Predict transaction fraud. The target is is_fraud. I want accuracy.";
  const profile = analyzeDataset({ csvText: rows.join("\n"), filename: "fraud_transactions.csv", idea });
  const blueprint = generateBlueprint({ idea, task: "classification", audience: "technical", dataset_profile: profile });

  assert.equal(blueprint.decision.target, "is_fraud");
  assert.ok(!blueprint.decision.features.includes("transaction_id"));
  assert.ok(!blueprint.decision.features.includes("merchant_id"));
  assert.ok(!blueprint.decision.features.includes("user_id"));
  assert.ok(blueprint.consequences.blocking.some((item) => item.id === "metric-validity"));
});

test("housing regression remains clean with zero blocking gates", () => {
  const csv = [
    "property_id,sqft,bedrooms,bathrooms,age_years,location_type,garage,price",
    "prop_1,589,4,1,86,urban,0,155147",
    "prop_2,2233,3,2,4,suburban,0,435439",
    "prop_3,1450,2,2,40,rural,1,265000",
    "prop_4,3010,5,3,10,urban,1,650000"
  ].join("\n");
  const idea = "Predict housing price from property features. The target is price.";
  const profile = analyzeDataset({ csvText: csv, filename: "housing_prices.csv", idea });
  const blueprint = generateBlueprint({ idea, task: "regression", audience: "technical", dataset_profile: profile });

  assert.equal(blueprint.consequences.verdict, "ok");
  assert.equal(blueprint.consequences.blocking.length, 0);
});
