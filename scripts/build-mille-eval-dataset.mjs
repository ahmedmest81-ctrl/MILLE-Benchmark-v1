import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { generateBlueprint } from "../blueprint-engine.mjs";
import { analyzeDataset } from "../dataset-profiler.mjs";
import { validateBlueprintContract, validateDatasetProfileContract } from "../schema-contracts.mjs";

const outputPath = new URL("../hf-dataset/mille-agent-blueprints/records.jsonl", import.meta.url);

const examples = [
  {
    id: "fraud_scoring_001",
    domain: "fintech",
    task: "classification",
    prompt:
      "Build a fraud scoring API. The table has transaction_id, amount, merchant_risk, prior_chargebacks, and an is_fraud label.",
    csv: [
      "transaction_id,amount,merchant_risk,prior_chargebacks,is_fraud",
      "t1,20,0.1,0,0",
      "t2,250,0.8,2,1",
      "t3,45,0.2,0,0",
      "t4,900,0.95,4,1"
    ].join("\n"),
    must_have: ["classification task", "fraud target", "input validation constraints", "baseline warning"],
    should_have: ["ROC-AUC", "precision/recall", "schema-aware export"],
    failure_modes: ["optimizing accuracy only", "using transaction_id as feature", "missing probability bounds"]
  },
  {
    id: "churn_prediction_001",
    domain: "saas",
    task: "classification",
    prompt:
      "Predict customer churn from subscription age, usage events, billing failures, support tickets, and a churned label.",
    csv: [
      "customer_id,subscription_age_days,usage_events,billing_failures,support_tickets,churned",
      "c1,120,84,0,1,0",
      "c2,25,3,2,5,1",
      "c3,300,220,0,0,0",
      "c4,60,12,1,3,1"
    ].join("\n"),
    must_have: ["classification task", "churn target", "ID exclusion", "threshold-aware metrics"],
    should_have: ["calibration notes", "temporal split consideration", "support ticket leakage review"],
    failure_modes: ["treating customer_id as predictive", "ignoring class imbalance", "no deployment threshold plan"]
  },
  {
    id: "hospital_operations_001",
    domain: "healthcare",
    task: "multi_component_system",
    prompt:
      "Build a hospital operations platform with patient risk prediction, length-of-stay estimation, patient volume forecasting, staff and bed assignment, and a clinical operations dashboard.",
    must_have: ["multi-component system", "component handoff contracts", "clinical leakage warnings", "dashboard component"],
    should_have: ["forecasting validation", "optimization constraints", "audit and reason codes"],
    failure_modes: ["single-model answer", "missing component contracts", "post-admission leakage"]
  },
  {
    id: "revenue_forecast_001",
    domain: "finance",
    task: "forecasting",
    prompt:
      "Forecast weekly subscription revenue from historical revenue, active accounts, acquisition spend, and calendar events.",
    csv: [
      "week,revenue,active_accounts,acquisition_spend,holiday",
      "2026-01-05,12000,810,2200,no",
      "2026-01-12,12400,830,2400,no",
      "2026-01-19,11800,835,1800,yes",
      "2026-01-26,13100,860,2600,no"
    ].join("\n"),
    must_have: ["forecasting task", "temporal validation", "naive baseline", "future-known feature review"],
    should_have: ["MAPE or MAE", "rolling backtest", "calendar feature handling"],
    failure_modes: ["random split", "using future revenue aggregates", "no naive baseline"]
  },
  {
    id: "price_regression_001",
    domain: "real_estate",
    task: "regression",
    prompt: "Predict home sale price from square footage, bedrooms, bathrooms, zip code, lot size, and sale_price.",
    csv: [
      "home_id,square_feet,bedrooms,bathrooms,zip_code,lot_size,sale_price",
      "h1,1400,3,2,90210,5500,780000",
      "h2,900,2,1,10001,1800,610000",
      "h3,2200,4,3,60614,7000,520000",
      "h4,1800,3,2,30301,6200,430000",
      "h5,2600,5,4,75201,8000,690000",
      "h6,1100,2,1,98101,2400,570000"
    ].join("\n"),
    must_have: ["regression task", "sale_price target", "constant baseline", "ID exclusion"],
    should_have: ["MAE", "residual checks", "categorical preprocessing"],
    failure_modes: ["classification framing", "no baseline", "leaking sale-derived features"]
  },
  {
    id: "recommendation_001",
    domain: "commerce",
    task: "recommendation",
    prompt:
      "Recommend products to users using user_id, item_id, purchase timestamp, product category, price, and interaction type.",
    must_have: ["recommendation task", "ranking metric", "user-item schema", "cold-start note"],
    should_have: ["NDCG", "time-aware split", "popularity baseline"],
    failure_modes: ["predicting purchase as plain classification only", "random interaction leakage", "no ranking baseline"]
  },
  {
    id: "logistics_eta_001",
    domain: "logistics",
    task: "regression",
    prompt:
      "Estimate delivery ETA from route distance, carrier, dispatch timestamp, weather risk, warehouse load, and actual_minutes_target.",
    csv: [
      "shipment_id,route_distance,carrier,dispatch_time,weather_risk,warehouse_load,actual_minutes_target",
      "s1,35,A,2026-01-01T08:00:00Z,0.1,55,48",
      "s2,120,B,2026-01-01T09:00:00Z,0.7,80,180",
      "s3,20,A,2026-01-01T10:00:00Z,0.2,45,35",
      "s4,85,C,2026-01-01T11:00:00Z,0.4,62,105",
      "s5,150,B,2026-01-01T12:00:00Z,0.8,88,220",
      "s6,55,A,2026-01-01T13:00:00Z,0.3,51,72"
    ].join("\n"),
    must_have: ["regression task", "ETA target", "timestamp handling", "operational baseline"],
    should_have: ["MAE", "route features", "monitoring for drift"],
    failure_modes: ["using shipment_id as feature", "ignoring temporal drift", "no late-delivery error analysis"]
  },
  {
    id: "credit_default_001",
    domain: "banking",
    task: "classification",
    prompt:
      "Predict credit default from application score, debt-to-income ratio, prior delinquencies, employment length, and defaulted label.",
    csv: [
      "application_id,application_score,dti,prior_delinquencies,employment_years,defaulted",
      "a1,710,0.22,0,6,0",
      "a2,590,0.48,2,1,1",
      "a3,680,0.31,0,4,0"
    ].join("\n"),
    must_have: ["classification task", "default target", "fairness/risk controls", "input constraints"],
    should_have: ["ROC-AUC", "calibration", "approval threshold discussion"],
    failure_modes: ["accuracy-only scoring", "missing governance notes", "unbounded risk inputs"]
  },
  {
    id: "manufacturing_quality_001",
    domain: "manufacturing",
    task: "classification",
    prompt:
      "Detect defective units from sensor_temperature, vibration_score, line_id, operator_shift, and defect label.",
    csv: [
      "unit_id,sensor_temperature,vibration_score,line_id,operator_shift,defect",
      "u1,71,0.12,L1,day,0",
      "u2,95,0.82,L2,night,1",
      "u3,73,0.18,L1,day,0"
    ].join("\n"),
    must_have: ["classification task", "defect target", "line/shift categorical handling", "threshold plan"],
    should_have: ["precision/recall", "sensor drift monitoring", "root-cause notes"],
    failure_modes: ["dropping categorical line effects", "no drift plan", "no false negative discussion"]
  },
  {
    id: "claims_severity_001",
    domain: "insurance",
    task: "regression",
    prompt:
      "Predict insurance claim severity from policy type, incident category, claimant age, repair estimate, and final_claim_amount_target.",
    csv: [
      "claim_id,policy_type,incident_category,claimant_age,repair_estimate,final_claim_amount_target",
      "cl1,auto,collision,34,4200,5100",
      "cl2,home,water,57,9000,12000",
      "cl3,auto,theft,41,3000,2800",
      "cl4,auto,collision,29,7600,8300",
      "cl5,home,fire,63,18000,22500",
      "cl6,auto,glass,38,1200,1600"
    ].join("\n"),
    must_have: ["regression task", "claim amount target", "MAE baseline", "leakage review"],
    should_have: ["quantile or tail-risk note", "categorical preprocessing", "outlier handling"],
    failure_modes: ["using post-settlement leakage", "no outlier plan", "classification-only output"]
  },
  {
    id: "support_triage_001",
    domain: "customer_support",
    task: "classification",
    prompt:
      "Classify support tickets by escalation risk using ticket text, customer tier, product area, wait time, and escalated label.",
    must_have: ["classification task", "text feature handling", "escalation target", "threshold-aware metrics"],
    should_have: ["false negative cost", "human review workflow", "monitoring for topic drift"],
    failure_modes: ["ignoring text fields", "no human escalation path", "accuracy-only metric"]
  },
  {
    id: "inventory_optimization_001",
    domain: "retail",
    task: "multi_component_system",
    prompt:
      "Build an inventory planning system with demand forecasting, stockout risk prediction, replenishment optimization, supplier delay monitoring, and a buyer dashboard.",
    must_have: ["multi-component system", "forecasting component", "optimization component", "dashboard component"],
    should_have: ["stockout cost tradeoff", "supplier delay risk", "component contracts"],
    failure_modes: ["single forecast only", "no optimization constraints", "no dashboard handoff"]
  },
  {
    id: "patient_readmission_001",
    domain: "healthcare",
    task: "classification",
    prompt:
      "Predict readmission risk at admission time from age, diagnosis_group, prior_visits, admission_source, discharge_date, and readmitted_30d.",
    csv: [
      "patient_id,age,diagnosis_group,prior_visits,admission_source,discharge_date,readmitted_30d",
      "p1,72,cardiac,4,er,2026-01-10,1",
      "p2,45,ortho,1,clinic,2026-01-11,0",
      "p3,65,pulmonary,3,er,2026-01-12,1"
    ].join("\n"),
    must_have: ["classification task", "readmission target", "admission-time leakage block", "clinical validation warning"],
    should_have: ["ROC-AUC", "calibration", "care-management threshold"],
    failure_modes: ["using discharge_date at admission", "ignoring clinical leakage", "no calibration plan"]
  },
  {
    id: "marketing_ltv_001",
    domain: "marketing",
    task: "regression",
    prompt:
      "Predict 90-day customer lifetime value from acquisition channel, first purchase amount, discount used, visits, and ltv_90d_target.",
    csv: [
      "customer_id,acquisition_channel,first_purchase_amount,discount_used,visits,ltv_90d_target",
      "m1,paid_search,45,yes,7,120",
      "m2,organic,30,no,3,55",
      "m3,referral,90,no,10,240",
      "m4,paid_social,60,yes,8,180",
      "m5,organic,25,no,2,42",
      "m6,partner,110,no,12,310"
    ].join("\n"),
    must_have: ["regression task", "LTV target", "time horizon clarity", "constant baseline"],
    should_have: ["MAE", "segment error analysis", "leakage warning for future purchases"],
    failure_modes: ["unclear prediction horizon", "future revenue leakage", "no baseline"]
  },
  {
    id: "security_anomaly_001",
    domain: "security",
    task: "clustering",
    prompt:
      "Discover anomalous login behavior from user_id, login_hour, country, device_fingerprint, failed_attempts, and session_duration.",
    must_have: ["unsupervised or anomaly framing", "ID handling", "cluster/anomaly profile", "human investigation workflow"],
    should_have: ["silhouette or stability checks", "false positive review", "feature scaling"],
    failure_modes: ["pretending labels exist", "using user_id as numeric signal", "no analyst review loop"]
  },
  {
    id: "energy_load_forecast_001",
    domain: "energy",
    task: "forecasting",
    prompt:
      "Forecast hourly electricity load from timestamp, temperature, humidity, holiday flag, historical load, and load_mw.",
    csv: [
      "timestamp,temperature,humidity,holiday,load_mw",
      "2026-01-01T00:00:00Z,3,0.7,yes,420",
      "2026-01-01T01:00:00Z,2,0.72,yes,410",
      "2026-01-01T02:00:00Z,2,0.71,yes,405"
    ].join("\n"),
    must_have: ["forecasting task", "hourly temporal split", "previous-value baseline", "weather/calendar features"],
    should_have: ["rolling validation", "MAE or MAPE", "seasonality note"],
    failure_modes: ["random split", "no naive baseline", "using future load aggregates"]
  },
  {
    id: "hr_attrition_001",
    domain: "hr",
    task: "classification",
    prompt:
      "Predict employee attrition risk from tenure, role, manager_changes, engagement_score, compensation_band, and attrited label.",
    csv: [
      "employee_id,tenure_months,role,manager_changes,engagement_score,compensation_band,attrited",
      "e1,36,engineer,0,0.82,B,0",
      "e2,8,sales,2,0.31,A,1",
      "e3,48,manager,1,0.74,C,0"
    ].join("\n"),
    must_have: ["classification task", "attrition target", "sensitive-use caution", "ID exclusion"],
    should_have: ["calibration", "human-in-the-loop policy", "fairness review"],
    failure_modes: ["automated employment action", "missing fairness warning", "using employee_id"]
  },
  {
    id: "loan_ops_platform_001",
    domain: "banking",
    task: "multi_component_system",
    prompt:
      "Build an explicit multi-component ML system for loan operations with default prediction, document completeness extraction, underwriting queue optimization, SLA forecasting, and an operations dashboard.",
    must_have: ["multi-component system", "classification component", "optimization component", "forecasting component"],
    should_have: ["component contracts", "audit trail", "queue/SLA metrics"],
    failure_modes: ["single classifier only", "missing document pipeline contract", "no auditability"]
  },
  {
    id: "ad_click_prediction_001",
    domain: "ads",
    task: "classification",
    prompt:
      "Predict ad click probability from campaign_id, user_segment, device_type, impression_hour, bid_price, and clicked label.",
    csv: [
      "impression_id,campaign_id,user_segment,device_type,impression_hour,bid_price,clicked",
      "i1,camp1,bargain,mobile,12,0.8,0",
      "i2,camp2,premium,desktop,20,1.7,1",
      "i3,camp1,bargain,mobile,13,0.9,0"
    ].join("\n"),
    must_have: ["classification task", "click target", "probability output", "calibration/threshold note"],
    should_have: ["log loss", "AUC", "time-aware validation"],
    failure_modes: ["click leakage", "no probability calibration", "random split across time"]
  },
  {
    id: "fleet_maintenance_001",
    domain: "fleet",
    task: "classification",
    prompt:
      "Predict vehicle maintenance failure from mileage, engine_temperature, vibration, last_service_days, vehicle_id, and failure_next_30d.",
    csv: [
      "vehicle_id,mileage,engine_temperature,vibration,last_service_days,failure_next_30d",
      "v1,120000,91,0.2,20,0",
      "v2,180000,110,0.8,120,1",
      "v3,90000,88,0.1,15,0"
    ].join("\n"),
    must_have: ["classification task", "failure target", "vehicle_id exclusion", "maintenance threshold plan"],
    should_have: ["recall emphasis", "temporal validation", "sensor drift monitoring"],
    failure_modes: ["using vehicle_id as feature", "accuracy-only", "no temporal validation"]
  }
];

const TARGET_COUNTS = {
  classification: 50,
  regression: 35,
  forecasting: 35,
  recommendation: 25,
  clustering: 20,
  multi_component_system: 35
};

const DOMAIN_POOL = [
  "fintech",
  "banking",
  "insurance",
  "healthcare",
  "saas",
  "retail",
  "logistics",
  "manufacturing",
  "security",
  "hr",
  "energy",
  "telecom",
  "marketing",
  "education",
  "legal_ops",
  "real_estate",
  "supply_chain",
  "customer_support"
];

const CLASSIFICATION_SPECS = [
  ["payments", "chargeback", "payment_id", "amount", "merchant_score", "channel", "chargebacked"],
  ["saas", "expansion lead", "account_id", "usage_events", "seat_count", "plan_tier", "expanded"],
  ["healthcare", "missed appointment", "appointment_id", "days_since_booking", "prior_no_shows", "clinic", "missed"],
  ["retail", "return risk", "order_id", "basket_value", "discount_rate", "category", "returned"],
  ["security", "account takeover", "login_id", "failed_attempts", "session_minutes", "device_type", "takeover"],
  ["manufacturing", "line defect", "unit_id", "temperature", "vibration", "line_id", "defective"],
  ["insurance", "claim fraud", "claim_id", "repair_estimate", "incident_score", "policy_type", "fraudulent"],
  ["banking", "loan default", "loan_id", "dti", "prior_delinquencies", "employment_band", "defaulted"],
  ["customer_support", "escalation", "ticket_id", "wait_minutes", "sentiment_score", "product_area", "escalated"],
  ["telecom", "network churn", "subscriber_id", "dropped_calls", "monthly_usage", "region", "churned"]
];

const REGRESSION_SPECS = [
  ["real_estate", "home sale price", "home_id", "square_feet", "bedrooms", "zip_code", "sale_price_target"],
  ["logistics", "delivery duration", "shipment_id", "distance_km", "warehouse_load", "carrier", "actual_minutes_target"],
  ["insurance", "claim severity", "claim_id", "repair_estimate", "claimant_age", "incident_type", "final_amount_target"],
  ["marketing", "customer lifetime value", "customer_id", "first_order_value", "visit_count", "channel", "ltv_90d_target"],
  ["energy", "site energy demand", "site_id", "temperature", "occupancy", "building_type", "load_mw_target"],
  ["education", "course completion time", "student_id", "lessons_completed", "quiz_score", "course_type", "days_to_complete_target"],
  ["legal_ops", "case handling cost", "case_id", "document_count", "matter_age_days", "matter_type", "handling_cost_target"],
  ["supply_chain", "supplier delay minutes", "purchase_order_id", "distance_km", "order_value", "supplier_tier", "delay_minutes_target"]
];

const FORECASTING_SPECS = [
  ["finance", "weekly revenue", "week", "revenue", "active_accounts", "marketing_spend", "holiday"],
  ["retail", "daily demand", "date", "units_sold", "price", "promotion_spend", "store_region"],
  ["energy", "hourly load", "timestamp", "load_mw", "temperature", "humidity", "holiday"],
  ["logistics", "warehouse volume", "date", "packages", "staff_count", "weather_risk", "hub"],
  ["customer_support", "ticket arrivals", "date", "ticket_count", "active_customers", "release_flag", "product_area"],
  ["telecom", "network traffic", "timestamp", "gbps", "active_devices", "event_flag", "region"],
  ["healthcare", "patient volume", "date", "visits", "scheduled_staff", "flu_index", "clinic"],
  ["supply_chain", "supplier lead time", "week", "lead_time_days", "order_count", "port_delay", "supplier_region"]
];

const RECOMMENDATION_SPECS = [
  ["commerce", "product", "user_id", "item_id", "purchase_timestamp", "category", "price", "interaction"],
  ["education", "course", "learner_id", "course_id", "event_timestamp", "topic", "difficulty", "interaction"],
  ["media", "article", "reader_id", "article_id", "read_timestamp", "section", "length_minutes", "interaction"],
  ["saas", "feature", "account_id", "feature_id", "usage_timestamp", "module", "admin_count", "interaction"],
  ["retail", "promotion", "shopper_id", "offer_id", "event_timestamp", "segment", "discount_pct", "interaction"],
  ["banking", "next best action", "customer_id", "action_id", "event_timestamp", "channel", "risk_score", "interaction"]
];

const CLUSTERING_SPECS = [
  ["security", "login behavior", "user_id", "login_hour", "failed_attempts", "country"],
  ["manufacturing", "sensor behavior", "machine_id", "temperature", "vibration", "line_id"],
  ["finance", "merchant behavior", "merchant_id", "avg_ticket", "refund_rate", "category"],
  ["healthcare", "patient utilization", "patient_id", "visit_count", "medication_count", "diagnosis_group"],
  ["telecom", "usage behavior", "subscriber_id", "data_gb", "dropped_calls", "region"],
  ["education", "learner behavior", "student_id", "login_count", "quiz_attempts", "course_type"]
];

const MULTI_COMPONENT_SPECS = [
  ["healthcare", "care operations", "patient risk prediction", "volume forecasting", "staff scheduling", "clinical dashboard"],
  ["retail", "inventory planning", "demand forecasting", "stockout prediction", "replenishment optimization", "buyer dashboard"],
  ["banking", "loan operations", "default prediction", "document completion checking", "underwriting queue optimization", "SLA dashboard"],
  ["logistics", "delivery control tower", "ETA prediction", "volume forecasting", "route optimization", "operations dashboard"],
  ["manufacturing", "quality operations", "defect prediction", "sensor anomaly detection", "maintenance scheduling", "line dashboard"],
  ["security", "risk operations", "account takeover scoring", "alert prioritization", "analyst queue optimization", "SOC dashboard"],
  ["energy", "grid operations", "load forecasting", "outage risk prediction", "crew dispatch optimization", "operator dashboard"],
  ["customer_support", "support operations", "escalation prediction", "ticket volume forecasting", "agent routing", "manager dashboard"]
];

function pad(value) {
  return String(value).padStart(3, "0");
}

function countByTask(items) {
  return items.reduce((counts, item) => {
    counts[item.task] = (counts[item.task] || 0) + 1;
    return counts;
  }, {});
}

function generatedClassification(index) {
  const [domain, label, id, numericA, numericB, category, target] = CLASSIFICATION_SPECS[index % CLASSIFICATION_SPECS.length];
  return {
    id: `generated_classification_${pad(index + 1)}`,
    domain,
    task: "classification",
    prompt: `Predict ${label} from ${numericA}, ${numericB}, ${category}, and a ${target} label.`,
    csv: [
      `${id},${numericA},${numericB},${category},${target}`,
      `a${index}1,12,0.15,alpha,0`,
      `a${index}2,35,0.72,beta,1`,
      `a${index}3,18,0.21,alpha,0`,
      `a${index}4,44,0.88,gamma,1`
    ].join("\n"),
    must_have: ["classification task", `${target} target`, "ID exclusion", "threshold-aware metrics"],
    should_have: ["ROC-AUC", "precision/recall", "input validation"],
    failure_modes: [`using ${id} as feature`, "accuracy-only metric", "missing threshold plan"],
    source_type: "synthetic_generated"
  };
}

function generatedRegression(index) {
  const [domain, label, id, numericA, numericB, category, target] = REGRESSION_SPECS[index % REGRESSION_SPECS.length];
  return {
    id: `generated_regression_${pad(index + 1)}`,
    domain,
    task: "regression",
    prompt: `Predict ${label} from ${numericA}, ${numericB}, ${category}, and ${target}.`,
    csv: [
      `${id},${numericA},${numericB},${category},${target}`,
      `r${index}1,120,4,alpha,480`,
      `r${index}2,220,7,beta,900`,
      `r${index}3,180,5,alpha,650`,
      `r${index}4,260,9,gamma,1120`,
      `r${index}5,310,11,beta,1380`,
      `r${index}6,95,3,alpha,360`
    ].join("\n"),
    must_have: ["regression task", `${target} target`, "constant baseline", "ID exclusion"],
    should_have: ["MAE", "residual checks", "categorical preprocessing"],
    failure_modes: [`using ${id} as feature`, "classification framing", "no baseline"],
    source_type: "synthetic_generated"
  };
}

function generatedForecasting(index) {
  const [domain, label, dateColumn, target, numericA, numericB, category] = FORECASTING_SPECS[index % FORECASTING_SPECS.length];
  return {
    id: `generated_forecasting_${pad(index + 1)}`,
    domain,
    task: "forecasting",
    prompt: `Forecast ${label} using ${dateColumn}, historical ${target}, ${numericA}, ${numericB}, and ${category}.`,
    csv: [
      `${dateColumn},${target},${numericA},${numericB},${category}`,
      "2026-01-01,100,12,0.1,alpha",
      "2026-01-02,112,13,0.2,beta",
      "2026-01-03,108,14,0.1,alpha",
      "2026-01-04,121,15,0.3,gamma"
    ].join("\n"),
    must_have: ["forecasting task", "temporal validation", "naive baseline", "future-known feature review"],
    should_have: ["MAE or MAPE", "rolling backtest", "seasonality note"],
    failure_modes: ["random split", "using future target aggregates", "no naive baseline"],
    source_type: "synthetic_generated"
  };
}

function generatedRecommendation(index) {
  const [domain, itemKind, userId, itemId, timestamp, category, numeric, interaction] =
    RECOMMENDATION_SPECS[index % RECOMMENDATION_SPECS.length];
  return {
    id: `generated_recommendation_${pad(index + 1)}`,
    domain,
    task: "recommendation",
    prompt: `Recommend ${itemKind}s using ${userId}, ${itemId}, ${timestamp}, ${category}, ${numeric}, and ${interaction}.`,
    csv: [
      `${userId},${itemId},${timestamp},${category},${numeric},${interaction}`,
      `u${index}1,i${index}1,2026-01-01T09:00:00Z,alpha,10,view`,
      `u${index}1,i${index}2,2026-01-02T10:00:00Z,beta,20,purchase`,
      `u${index}2,i${index}1,2026-01-03T11:00:00Z,alpha,10,click`,
      `u${index}3,i${index}3,2026-01-04T12:00:00Z,gamma,35,view`
    ].join("\n"),
    must_have: ["recommendation task", "ranking metric", "user-item schema", "cold-start note"],
    should_have: ["NDCG", "time-aware split", "popularity baseline"],
    failure_modes: ["plain classification only", "random interaction leakage", "no ranking baseline"],
    source_type: "synthetic_generated"
  };
}

function generatedClustering(index) {
  const [domain, label, id, numericA, numericB, category] = CLUSTERING_SPECS[index % CLUSTERING_SPECS.length];
  return {
    id: `generated_clustering_${pad(index + 1)}`,
    domain,
    task: "clustering",
    prompt: `Cluster ${label} and discover unusual segments from ${id}, ${numericA}, ${numericB}, and ${category}.`,
    must_have: ["clustering task", "ID handling", "feature scaling", "cluster profile"],
    should_have: ["silhouette or stability checks", "human review workflow", "outlier review"],
    failure_modes: ["pretending labels exist", `using ${id} as numeric signal`, "no analyst review loop"],
    source_type: "synthetic_generated"
  };
}

function generatedMultiComponent(index) {
  const [domain, platform, componentA, componentB, componentC, dashboard] =
    MULTI_COMPONENT_SPECS[index % MULTI_COMPONENT_SPECS.length];
  return {
    id: `generated_multi_component_${pad(index + 1)}`,
    domain,
    task: "multi_component_system",
    prompt: `Build an explicit multi-component ML system for a ${platform} platform with ${componentA}, ${componentB}, ${componentC}, workflow automation, and a ${dashboard}.`,
    must_have: ["multi-component system", "component handoff contracts", "optimization component", "dashboard component"],
    should_have: ["component contracts", "forecasting validation", "audit trail"],
    failure_modes: ["single-model answer", "missing component contracts", "no dashboard handoff"],
    source_type: "synthetic_generated"
  };
}

const GENERATORS = {
  classification: generatedClassification,
  regression: generatedRegression,
  forecasting: generatedForecasting,
  recommendation: generatedRecommendation,
  clustering: generatedClustering,
  multi_component_system: generatedMultiComponent
};

function buildGeneratedExamples(seedExamples) {
  const counts = countByTask(seedExamples);
  const generated = [];
  for (const [task, targetCount] of Object.entries(TARGET_COUNTS)) {
    const seedCount = counts[task] || 0;
    const needed = targetCount - seedCount;
    if (needed < 0) {
      throw new Error(`Seed examples already exceed target count for ${task}: ${seedCount} > ${targetCount}`);
    }
    for (let index = 0; index < needed; index += 1) {
      generated.push(GENERATORS[task](index));
    }
  }
  return generated;
}

function inputSchemaFromProfile(profile) {
  return {
    filename: profile?.filename || null,
    row_count: profile?.row_count || null,
    column_count: profile?.column_count || null,
    columns: (profile?.columns || []).map((column) => ({
      name: column.name,
      kind: column.kind,
      missing_ratio: column.missing_ratio
    })),
    inferred: profile?.inferred || null
  };
}

function buildRecord(example) {
  const profile = example.csv
    ? analyzeDataset({ csvText: example.csv, filename: `${example.id}.csv`, idea: example.prompt })
    : null;
  if (profile) {
    const profileContract = validateDatasetProfileContract(profile);
    if (!profileContract.ok) {
      throw new Error(`${example.id} dataset profile failed contract: ${profileContract.errors.join("; ")}`);
    }
  }
  const blueprint = generateBlueprint({
    idea: example.prompt,
    task: example.task === "multi_component_system" ? "auto" : example.task,
    audience: "technical",
    dataset_profile: profile
  });
  const blueprintContract = validateBlueprintContract(blueprint);
  if (!blueprintContract.ok) {
    throw new Error(`${example.id} blueprint failed contract: ${blueprintContract.errors.join("; ")}`);
  }

  return {
    id: example.id,
    prompt: example.prompt,
    task: example.task,
    domain: example.domain,
    input_schema: inputSchemaFromProfile(profile),
    dataset_profile: profile,
    expected_blueprint: blueprint,
    rubric: {
      must_have: example.must_have,
      should_have: example.should_have,
      scoring_notes: [
        "Award full credit only when the blueprint preserves explicit data contracts.",
        "Penalize outputs that ignore blocking gates or executable baseline warnings.",
        "Prefer agent-ready implementation plans with schemas, tests, and validation."
      ]
    },
    failure_modes: example.failure_modes,
    source: {
      type: example.source_type || "synthetic_seed",
      generator: "scripts/build-mille-eval-dataset.mjs",
      schema: "schemas/mille-eval-record.schema.json"
    }
  };
}

const allExamples = [...examples, ...buildGeneratedExamples(examples)];
const finalCounts = countByTask(allExamples);
for (const [task, targetCount] of Object.entries(TARGET_COUNTS)) {
  if (finalCounts[task] !== targetCount) {
    throw new Error(`Expected ${targetCount} ${task} records, found ${finalCounts[task]}`);
  }
}
if (new Set(allExamples.map((example) => example.id)).size !== allExamples.length) {
  throw new Error("Eval example ids must be unique.");
}

const records = allExamples.map(buildRecord);
mkdirSync(dirname(fileURLToPath(outputPath)), { recursive: true });
writeFileSync(outputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
console.log(`Wrote ${records.length} records to ${outputPath.pathname}`);
