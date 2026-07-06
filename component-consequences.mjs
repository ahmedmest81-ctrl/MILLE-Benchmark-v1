import { buildSplitValidityCheck } from "./consequence-core.mjs";

function consequence({ id, severity = "warn", message, remedy, questions = [], computed = {} }) {
  return { id, severity, fired: true, message, remedy, questions, computed };
}

function hasMetric(component, pattern) {
  return (component.metrics || []).some((metric) => pattern.test(metric));
}

function hasDataNeed(component, pattern) {
  return (component.data_needs || []).some((need) => pattern.test(need));
}

function evaluateClassification(component) {
  const items = [];
  if (!hasMetric(component, /recall|PR-AUC|precision|calibration/i)) {
    items.push(
      consequence({
        id: "classification-metric-gate",
        message: `${component.name} must define classification metrics beyond accuracy.`,
        remedy: "Use recall, precision, PR-AUC, and calibration where appropriate.",
        questions: ["What is the positive class?", "What recall or precision threshold is acceptable?"]
      })
    );
  }
  items.push(
    consequence({
      id: "classification-threshold-gate",
      message: `${component.name} needs a positive class, operating threshold, and class balance report before implementation.`,
      remedy: "Define positive class semantics, compute class balance, and choose threshold criteria.",
      questions: ["What is the positive class?", "Minimum acceptable recall?", "Cost of false positives vs false negatives?"],
      computed: { target: component.target }
    })
  );
  return items;
}

function evaluateRegression(component) {
  return [
    consequence({
      id: "regression-baseline-gate",
      message: `${component.name} must beat mean/median constant baselines for ${component.target}.`,
      remedy: "Compute baseline MAE/RMSE and require candidate models to improve on them.",
      questions: ["What unit is the target measured in?", "What MAE is operationally acceptable?"],
      computed: { target: component.target }
    })
  ];
}

function evaluateForecasting(component) {
  const temporalSignals = Array.from(
    new Set([
      "forecast",
      ...(component.data_needs || []).filter((need) => /timestamp|time|date/i.test(need))
    ])
  );
  const temporalValidation = buildSplitValidityCheck({
    signals: temporalSignals,
    splitStrategy: "random",
    id: "forecast-temporal-validation-gate",
    context: `${component.name} forecasting component`
  });
  const items = [
    consequence({
      id: "forecast-horizon-gate",
      severity: "block",
      message: `${component.name} needs an explicit prediction horizon for ${component.target}.`,
      remedy: "Define the forecast horizon, granularity, and rolling backtest windows.",
      questions: ["Prediction horizon?", "Forecast granularity?", "Backtest cutoff dates?"],
      computed: { target: component.target }
    }),
    {
      ...temporalValidation,
      message: `${component.name} requires temporal validation. ${temporalValidation.message}`,
      questions: ["Which timestamp defines availability?", ...(temporalValidation.questions || [])]
    }
  ];
  if (!hasDataNeed(component, /timestamp|time|date/i)) {
    items.push(
      consequence({
        id: "forecast-timestamp-gate",
        severity: "block",
        message: `${component.name} needs a timestamp/date field in its data contract.`,
        remedy: "Add timestamp requirements and define known-future covariates.",
        questions: ["Which timestamp column anchors the forecast?"]
      })
    );
  }
  return items;
}

function evaluateRecommendation(component) {
  return [
    consequence({
      id: "recommendation-interaction-gate",
      severity: "block",
      message: `${component.name} requires user, item, interaction, and time structure before collaborative filtering is valid.`,
      remedy: "Define user_id, item_id, event/rating, timestamp, cold-start strategy, and top-k metrics.",
      questions: ["What is the interaction signal?", "How should cold-start users/items be handled?"],
      computed: { data_needs: component.data_needs }
    })
  ];
}

function evaluateOptimization(component) {
  const hasConstraints = (component.constraints || []).length > 0;
  const items = [];
  if (!component.objective || component.objective.length < 12) {
    items.push(
      consequence({
        id: "optimization-objective-gate",
        severity: "block",
        message: `${component.name} needs a concrete objective function.`,
        remedy: "Define what is minimized/maximized and how tradeoffs are weighted.",
        questions: ["What is the objective function?", "How are competing goals weighted?"]
      })
    );
  }
  if (!hasConstraints) {
    items.push(
      consequence({
        id: "optimization-constraint-gate",
        severity: "block",
        message: `${component.name} needs explicit capacity, assignment, and feasibility constraints.`,
        remedy: "List resources, capacities, hard constraints, soft constraints, and infeasible states.",
        questions: ["What constraints are hard?", "What capacities or shift limits apply?"]
      })
    );
  }
  items.push(
    consequence({
      id: "optimization-solver-gate",
      message: `${component.name} needs a solver strategy and fallback policy.`,
      remedy: "Choose heuristic, MILP/CP-SAT, greedy baseline, or simulation depending on constraints.",
      questions: ["Is exact optimization required or is a heuristic acceptable?"]
    })
  );
  return items;
}

function evaluateAnomaly(component) {
  return [
    consequence({
      id: "anomaly-alert-volume-gate",
      message: `${component.name} needs an alert-volume budget and investigation workflow.`,
      remedy: "Define acceptable alert count, escalation policy, and precision-at-alert evaluation.",
      questions: ["How many alerts can operators review per day?", "What incidents count as true positives?"]
    })
  ];
}

function evaluateApi(component) {
  return [
    consequence({
      id: "api-contract-gate",
      severity: "block",
      message: `${component.name} needs request/response schemas, latency target, auth, logging, and versioning.`,
      remedy: "Define endpoint payloads, response fields, SLA, audit logs, and model/version metadata.",
      questions: ["Latency target?", "Authentication and audit requirements?", "Batch or online endpoint?"]
    })
  ];
}

function evaluateDashboard(component) {
  return [
    consequence({
      id: "dashboard-kpi-gate",
      message: `${component.name} needs KPIs, refresh cadence, roles, and alert thresholds.`,
      remedy: "Define dashboard users, decisions supported, refresh frequency, and alert criteria.",
      questions: ["Which KPIs must managers see?", "Refresh cadence?", "Which alerts require action?"]
    })
  ];
}

function evaluateComponent(component) {
  switch (component.task_type) {
    case "classification":
      return evaluateClassification(component);
    case "regression":
      return evaluateRegression(component);
    case "forecasting":
      return evaluateForecasting(component);
    case "recommendation":
      return evaluateRecommendation(component);
    case "optimization":
      return evaluateOptimization(component);
    case "anomaly_detection":
      return evaluateAnomaly(component);
    case "api":
      return evaluateApi(component);
    case "dashboard":
      return evaluateDashboard(component);
    default:
      return [
        consequence({
          id: "component-contract-gate",
          message: `${component.name} needs a component-level contract before implementation.`,
          remedy: "Define target/output, metrics, data needs, and acceptance tests.",
          questions: ["What does this component consume and produce?"]
        })
      ];
  }
}

export function evaluateComponentConsequences({ components = [] } = {}) {
  const byComponent = {};
  const all = [];
  const blocking = [];
  const generatedQuestions = [];

  for (const component of components) {
    const results = evaluateComponent(component);
    const enrichedResults = results.map((item) => ({
      ...item,
      component_id: component.id,
      component_name: component.name,
      task_type: component.task_type
    }));
    byComponent[component.id] = enrichedResults;
    for (const enriched of enrichedResults) {
      all.push(enriched);
      if (enriched.severity === "block") blocking.push(enriched);
      for (const question of enriched.questions || []) {
        const scoped = `${component.name}: ${question}`;
        if (!generatedQuestions.includes(scoped)) generatedQuestions.push(scoped);
      }
    }
  }

  return {
    verdict: blocking.length ? "needs_resolution" : all.length ? "needs_component_resolution" : "ok",
    by_component: byComponent,
    blocking,
    all,
    generated_questions: generatedQuestions
  };
}
