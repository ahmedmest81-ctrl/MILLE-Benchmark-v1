const COMPONENT_LIBRARY = {
  classification: {
    task_type: "classification",
    metrics: ["PR-AUC", "recall", "precision"],
    outputs: ["probability", "class_label"],
    data_needs: ["labeled outcomes", "entity/event features", "class balance report"]
  },
  regression: {
    task_type: "regression",
    metrics: ["MAE", "RMSE"],
    outputs: ["numeric_prediction"],
    data_needs: ["numeric target", "feature history", "baseline error report"]
  },
  forecasting: {
    task_type: "forecasting",
    metrics: ["MAE", "MAPE", "rolling backtest error"],
    outputs: ["future_values", "prediction_horizon"],
    data_needs: ["timestamp", "target history", "known future covariates"]
  },
  recommendation: {
    task_type: "recommendation",
    metrics: ["NDCG@K", "Recall@K", "coverage"],
    outputs: ["ranked_items"],
    data_needs: ["user_id", "item_id", "interaction signal", "timestamp"]
  },
  optimization: {
    task_type: "optimization",
    metrics: ["objective_value", "constraint_violations", "resource_utilization"],
    outputs: ["assignment_plan", "schedule", "resource_allocation"],
    data_needs: ["resources", "constraints", "capacity", "objective weights"]
  },
  anomaly_detection: {
    task_type: "anomaly_detection",
    metrics: ["precision@alert", "recall@incident", "alert_volume"],
    outputs: ["anomaly_score", "alert_reason"],
    data_needs: ["normal behavior history", "incident labels when available", "time/context features"]
  },
  api: {
    task_type: "api",
    metrics: ["latency", "availability", "schema_contract_pass_rate"],
    outputs: ["prediction_endpoint", "batch_endpoint"],
    data_needs: ["request schema", "response schema", "auth and logging requirements"]
  },
  dashboard: {
    task_type: "dashboard",
    metrics: ["decision_latency", "manager_action_rate", "monitoring_coverage"],
    outputs: ["operational_views", "alerts", "drilldowns"],
    data_needs: ["KPIs", "user roles", "refresh frequency", "alert thresholds"]
  }
};

const DOMAIN_PATTERNS = [
  {
    domain: "hotel_operations",
    pattern: /\b(hotel|room|rooms|housekeeping|cleaners?|guest|check-?in|check-?out|maintenance)\b/,
    components: [
      {
        id: "room_readiness_prediction",
        name: "Room readiness prediction",
        library_key: "classification",
        target: "room_ready_before_checkin",
        objective: "predict whether each room will be ready before guest arrival",
        metrics: ["recall", "precision", "PR-AUC"]
      },
      {
        id: "cleaning_time_estimation",
        name: "Cleaning time estimation",
        library_key: "regression",
        target: "cleaning_duration_minutes",
        objective: "estimate room cleaning duration from room type, condition, and staffing context",
        metrics: ["MAE", "RMSE"]
      },
      {
        id: "occupancy_arrival_forecast",
        name: "Occupancy and arrival forecasting",
        library_key: "forecasting",
        target: "future_occupancy_and_arrivals",
        objective: "forecast arrivals, departures, and demand by time window",
        metrics: ["MAE", "rolling backtest error"]
      },
      {
        id: "housekeeping_assignment",
        name: "Housekeeping assignment",
        library_key: "optimization",
        target: "room_staff_assignment_plan",
        objective: "minimize walking distance and late rooms while balancing workload",
        constraints: ["staff shifts", "room priority", "check-in deadlines", "maintenance blocks"]
      },
      {
        id: "manager_alerting_dashboard",
        name: "Manager alerting dashboard",
        library_key: "dashboard",
        target: "operational_bottlenecks",
        objective: "surface bottlenecks, delays, staffing shortages, and at-risk rooms"
      }
    ]
  },
  {
    domain: "ecommerce_marketplace",
    pattern: /\b(e-?commerce|marketplace|cart|checkout|product|sku|inventory|merchant|recommend|conversion)\b/,
    components: [
      {
        id: "product_recommendation",
        name: "Product recommendation",
        library_key: "recommendation",
        target: "ranked_products",
        objective: "rank products for users or sessions",
        metrics: ["NDCG@K", "Recall@K", "coverage"]
      },
      {
        id: "demand_forecast",
        name: "Demand forecasting",
        library_key: "forecasting",
        target: "future_product_demand",
        objective: "forecast demand by SKU, channel, and time period",
        metrics: ["MAE", "MAPE"]
      },
      {
        id: "conversion_propensity",
        name: "Conversion propensity",
        library_key: "classification",
        target: "purchase_or_conversion",
        objective: "predict purchase likelihood for targeting and ranking",
        metrics: ["PR-AUC", "calibration", "recall"]
      },
      {
        id: "inventory_allocation",
        name: "Inventory allocation",
        library_key: "optimization",
        target: "stock_and_fulfillment_plan",
        objective: "allocate inventory while minimizing stockouts, holding cost, and late fulfillment",
        constraints: ["stock levels", "warehouse capacity", "delivery deadlines"]
      },
      {
        id: "commerce_dashboard",
        name: "Commerce operations dashboard",
        library_key: "dashboard",
        target: "conversion_inventory_revenue_kpis",
        objective: "monitor demand, conversion, inventory risk, and recommendation quality"
      }
    ]
  },
  {
    domain: "fintech_risk",
    pattern: /\b(fraud|payment|transaction|credit|loan|default|chargeback|aml|bank)\b/,
    components: [
      {
        id: "fraud_risk_scoring",
        name: "Fraud risk scoring",
        library_key: "classification",
        target: "fraud_or_chargeback_label",
        objective: "score transaction or account risk",
        metrics: ["PR-AUC", "recall", "precision"]
      },
      {
        id: "anomaly_alerting",
        name: "Anomaly alerting",
        library_key: "anomaly_detection",
        target: "unusual_behavior_score",
        objective: "detect unusual payment/account behavior for investigation",
        metrics: ["precision@alert", "alert_volume"]
      },
      {
        id: "risk_threshold_policy",
        name: "Risk threshold policy",
        library_key: "optimization",
        target: "review_decline_approve_policy",
        objective: "choose thresholds under false-positive, false-negative, and review-capacity constraints",
        constraints: ["manual review capacity", "fraud loss cost", "customer friction cost"]
      },
      {
        id: "scoring_api",
        name: "Real-time scoring API",
        library_key: "api",
        target: "transaction_score_endpoint",
        objective: "serve calibrated risk scores with latency and audit requirements"
      },
      {
        id: "risk_dashboard",
        name: "Risk operations dashboard",
        library_key: "dashboard",
        target: "fraud_ops_monitoring",
        objective: "monitor alerts, drift, recall proxies, and review queue health"
      }
    ]
  },
  {
    domain: "logistics_operations",
    pattern: /\b(logistics|delivery|route|routes|fleet|driver|warehouse|dispatch|shipment|supply chain)\b/,
    components: [
      {
        id: "eta_prediction",
        name: "ETA prediction",
        library_key: "regression",
        target: "arrival_time_minutes",
        objective: "estimate delivery or route duration",
        metrics: ["MAE", "p90 absolute error"]
      },
      {
        id: "demand_volume_forecast",
        name: "Demand and volume forecasting",
        library_key: "forecasting",
        target: "future_shipments_or_orders",
        objective: "forecast demand by zone and time window",
        metrics: ["MAE", "rolling backtest error"]
      },
      {
        id: "route_assignment_optimization",
        name: "Route and driver assignment",
        library_key: "optimization",
        target: "driver_route_plan",
        objective: "minimize lateness, distance, and imbalance under fleet constraints",
        constraints: ["driver shifts", "vehicle capacity", "delivery windows"]
      },
      {
        id: "delay_risk_prediction",
        name: "Delay risk prediction",
        library_key: "classification",
        target: "late_delivery_risk",
        objective: "flag shipments likely to miss SLA",
        metrics: ["PR-AUC", "recall", "precision"]
      },
      {
        id: "operations_dashboard",
        name: "Operations dashboard",
        library_key: "dashboard",
        target: "route_sla_capacity_kpis",
        objective: "monitor capacity, late risk, bottlenecks, and dispatch quality"
      }
    ]
  },
  {
    domain: "healthcare_operations",
    pattern: /\b(healthcare|hospital|patient|clinic|appointment|triage|readmission|nurse|doctor|bed)\b/,
    components: [
      {
        id: "patient_risk_prediction",
        name: "Patient risk prediction",
        library_key: "classification",
        target: "risk_event_label",
        objective: "identify high-risk patients or appointments",
        metrics: ["recall", "PR-AUC", "calibration"]
      },
      {
        id: "length_of_stay_estimation",
        name: "Length-of-stay estimation",
        library_key: "regression",
        target: "length_of_stay_hours",
        objective: "estimate resource need duration",
        metrics: ["MAE", "RMSE"]
      },
      {
        id: "demand_forecast",
        name: "Demand forecasting",
        library_key: "forecasting",
        target: "future_patient_volume",
        objective: "forecast appointment, bed, or staffing demand",
        metrics: ["MAE", "rolling backtest error"]
      },
      {
        id: "staff_bed_assignment",
        name: "Staff and bed assignment",
        library_key: "optimization",
        target: "resource_assignment_plan",
        objective: "allocate beds, staff, and appointments under clinical constraints",
        constraints: ["staff shifts", "bed capacity", "clinical priority"]
      },
      {
        id: "clinical_ops_dashboard",
        name: "Clinical operations dashboard",
        library_key: "dashboard",
        target: "capacity_risk_kpis",
        objective: "monitor capacity, risk queues, staffing, and delays"
      }
    ]
  },
  {
    domain: "manufacturing_operations",
    pattern: /\b(manufacturing|factory|machine|equipment|production|defect|downtime|maintenance|quality)\b/,
    components: [
      {
        id: "defect_prediction",
        name: "Defect prediction",
        library_key: "classification",
        target: "defect_label",
        objective: "predict quality failures before release",
        metrics: ["PR-AUC", "recall", "precision"]
      },
      {
        id: "downtime_forecast",
        name: "Downtime forecasting",
        library_key: "forecasting",
        target: "future_downtime_or_output",
        objective: "forecast downtime, throughput, or production volume",
        metrics: ["MAE", "rolling backtest error"]
      },
      {
        id: "remaining_useful_life",
        name: "Remaining useful life estimation",
        library_key: "regression",
        target: "remaining_useful_life_hours",
        objective: "estimate equipment lifetime or maintenance timing",
        metrics: ["MAE", "RMSE"]
      },
      {
        id: "production_scheduling",
        name: "Production scheduling",
        library_key: "optimization",
        target: "machine_job_schedule",
        objective: "schedule jobs and maintenance while minimizing downtime and lateness",
        constraints: ["machine capacity", "maintenance windows", "order deadlines"]
      },
      {
        id: "factory_dashboard",
        name: "Factory operations dashboard",
        library_key: "dashboard",
        target: "quality_throughput_downtime_kpis",
        objective: "monitor defects, capacity, downtime, and schedule risk"
      }
    ]
  }
];

const GENERIC_OBJECTIVE_PATTERNS = [
  {
    key: "forecasting",
    pattern: /\b(forecast|predict future|demand|occupancy|volume|arrival|capacity needs?|staffing requirements?)\b/
  },
  {
    key: "optimization",
    pattern: /\b(optimi[sz]e|assign|schedule|allocation|routing|balance workload|minimi[sz]e|constraints?|capacity)\b/
  },
  {
    key: "classification",
    pattern: /\b(classify|flag|detect|risk|ready|fraud|defect|delay|alert|approve|default)\b/
  },
  {
    key: "regression",
    pattern: /\b(estimate|how long|duration|time estimation|cost|price|amount|score|remaining useful life)\b/
  },
  {
    key: "recommendation",
    pattern: /\b(recommend|rank|personalize|next best|match)\b/
  },
  {
    key: "anomaly_detection",
    pattern: /\b(anomaly|unusual|outlier|incident|bottleneck|shortage)\b/
  },
  {
    key: "api",
    pattern: /\b(api|endpoint|service|serve|real.?time|web service)\b/
  },
  {
    key: "dashboard",
    pattern: /\b(dashboard|insights|manager|monitor|report|kpi|analytics)\b/
  }
];

const DOMAIN_SIGNAL_PATTERNS = {
  hotel_operations: [
    /\bhotel\b/g,
    /\brooms?\b/g,
    /\bhousekeeping\b/g,
    /\bguests?\b/g,
    /\bcheck-?in\b/g,
    /\bcheck-?out\b/g,
    /\bmaintenance\b/g
  ],
  ecommerce_marketplace: [
    /\be-?commerce\b/g,
    /\bmarketplace\b/g,
    /\bcart\b/g,
    /\bcheckout\b/g,
    /\bproducts?\b/g,
    /\bsku\b/g,
    /\binventory\b/g,
    /\bfulfillment\b/g
  ],
  fintech_risk: [
    /\bbank(?:ing)?\b/g,
    /\bfraud\b/g,
    /\baml\b/g,
    /\bpayments?\b/g,
    /\btransactions?\b/g,
    /\bcredit\b/g,
    /\bloans?\b/g,
    /\bdefault\b/g,
    /\bchargebacks?\b/g,
    /\baccounts?\b/g,
    /\bcompliance\b/g,
    /\bregulatory\b/g
  ],
  logistics_operations: [
    /\blogistics\b/g,
    /\bdeliver(?:y|ies)\b/g,
    /\broutes?\b/g,
    /\bfleet\b/g,
    /\bdrivers?\b/g,
    /\bdispatch\b/g,
    /\bshipments?\b/g,
    /\bsupply chain\b/g
  ],
  healthcare_operations: [
    /\bhealthcare\b/g,
    /\bhospital\b/g,
    /\bpatients?\b/g,
    /\bclinic\b/g,
    /\bappointments?\b/g,
    /\btriage\b/g,
    /\bnurses?\b/g,
    /\bdoctors?\b/g,
    /\bbeds?\b/g
  ],
  manufacturing_operations: [
    /\bmanufacturing\b/g,
    /\bfactory\b/g,
    /\bmachines?\b/g,
    /\bequipment\b/g,
    /\bproduction\b/g,
    /\bdefects?\b/g,
    /\bdowntime\b/g,
    /\bquality\b/g
  ]
};

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function enrichComponent(component, domain = "general_operations") {
  const base = COMPONENT_LIBRARY[component.library_key] || COMPONENT_LIBRARY.classification;
  return {
    id: component.id,
    name: component.name,
    domain,
    task_type: base.task_type,
    target: component.target,
    objective: component.objective,
    metrics: component.metrics || base.metrics,
    constraints: component.constraints || [],
    outputs: base.outputs,
    data_needs: base.data_needs
  };
}

function genericComponent(key) {
  const names = {
    classification: ["risk_or_status_prediction", "Risk/status prediction", "risk_or_status_label", "predict important operational states or risks"],
    regression: ["numeric_estimation", "Numeric estimation", "numeric_operational_target", "estimate duration, cost, value, or workload"],
    forecasting: ["demand_forecasting", "Demand forecasting", "future_demand_or_volume", "forecast future demand, volume, staffing, or capacity needs"],
    recommendation: ["ranking_recommendation", "Ranking and recommendation", "ranked_options", "rank users, items, actions, or resources"],
    optimization: ["resource_optimization", "Resource optimization", "resource_assignment_plan", "optimize assignment, routing, scheduling, or allocation under constraints"],
    anomaly_detection: ["anomaly_alerting", "Anomaly alerting", "anomaly_score", "detect unusual events, bottlenecks, or incidents"],
    api: ["prediction_api", "Prediction API", "serving_endpoint", "serve predictions and decisions to downstream systems"],
    dashboard: ["operations_dashboard", "Operations dashboard", "operational_kpis", "monitor decisions, alerts, metrics, and system health"]
  };
  const [id, name, target, objective] = names[key];
  return enrichComponent({ id, name, library_key: key, target, objective }, "general_operations");
}

function detectGenericComponents(lowerIdea) {
  return GENERIC_OBJECTIVE_PATTERNS.filter((entry) => entry.pattern.test(lowerIdea)).map((entry) => genericComponent(entry.key));
}

function detectedObjectiveKeys(lowerIdea) {
  return GENERIC_OBJECTIVE_PATTERNS.filter((entry) => entry.pattern.test(lowerIdea)).map((entry) => entry.key);
}

function countPatternMatches(text, patterns = []) {
  return patterns.reduce((total, pattern) => total + (text.match(pattern) || []).length, 0);
}

function detectDomainArchitecture(lowerIdea) {
  const matches = DOMAIN_PATTERNS.filter((entry) => entry.pattern.test(lowerIdea));
  if (matches.length <= 1) return matches[0] || null;

  return matches
    .map((entry, index) => ({
      entry,
      index,
      score: countPatternMatches(lowerIdea, DOMAIN_SIGNAL_PATTERNS[entry.domain]) * 2 + entry.components.length
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)[0].entry;
}

export function componentLibrary() {
  return COMPONENT_LIBRARY;
}

export function detectProjectComplexity({ idea = "", selectedTask = "auto", datasetProfile = null } = {}) {
  const lower = String(idea || "").toLowerCase();
  const trace = ["Input idea parsed."];
  if (datasetProfile) {
    trace.push(`CSV uploaded: ${datasetProfile.row_count} rows and ${datasetProfile.column_count} columns detected.`);
  } else {
    trace.push("No dataset uploaded.");
  }

  const domain = detectDomainArchitecture(lower);
  let components = [];
  if (domain) {
    trace.push(`${domain.domain} domain detected.`);
    components = domain.components.map((component) => enrichComponent(component, domain.domain));
  } else {
    components = detectGenericComponents(lower);
    if (components.length) trace.push(`Detected ${components.length} operational objective signal(s).`);
  }

  const objectiveKeys = unique(detectedObjectiveKeys(lower));
  const coreObjectiveCount = objectiveKeys.filter((key) => !["api", "dashboard"].includes(key)).length;
  const hasArchitectureIntent =
    /\b(platform|system|operations|workflow|end-to-end|manage|optimi[sz]e|dashboard|assignment|scheduling)\b/.test(lower);
  const explicitMultiComponent = /\bproject\s*type\s*:\s*multi_component_system\b|\bmulti[- ]component\b|\bmultiple (?:models|machine learning models|ml models|components)\b/.test(lower);
  const hasDecisionAndArchitecture =
    coreObjectiveCount >= 2 &&
    hasArchitectureIntent &&
    (objectiveKeys.includes("optimization") || objectiveKeys.includes("dashboard") || objectiveKeys.includes("api"));
  const shouldOverrideSingleTask =
    !datasetProfile &&
    components.length >= 3 &&
    (selectedTask === "auto" || selectedTask == null || explicitMultiComponent) &&
    (explicitMultiComponent || hasDecisionAndArchitecture);

  if (components.length >= 3) trace.push("Multiple ML/optimization components detected.");
  if (objectiveKeys.length) trace.push(`Explicit objective signal(s): ${objectiveKeys.join(", ")}.`);
  if (explicitMultiComponent) trace.push("Explicit multi-component architecture requested.");
  if (selectedTask !== "auto" && !explicitMultiComponent) trace.push(`User selected task ${selectedTask}; preserving single-task mode unless explicitly auto.`);
  if (shouldOverrideSingleTask) {
    trace.push("Single-task blueprint is insufficient.");
    trace.push("Multi-component ML system selected.");
  } else {
    trace.push("Single-task blueprint selected.");
  }

  return {
    projectType: shouldOverrideSingleTask ? "multi_component_system" : "single_task",
    detectedObjectives: unique(components.map((component) => component.task_type)),
    recommendedComponents: shouldOverrideSingleTask ? components : [],
    candidateComponents: components,
    shouldOverrideSingleTask,
    explanation: shouldOverrideSingleTask
      ? "The idea describes a platform with multiple prediction, optimization, serving, or monitoring objectives. A single ML task would under-specify the system."
      : "The idea can be handled as a single ML task for this pass.",
    decision_trace: trace
  };
}
