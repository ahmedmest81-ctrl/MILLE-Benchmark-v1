const DEFAULT_MODEL = "gpt-4.1-mini";
const RESPONSES_URL = "https://api.openai.com/v1/responses";

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function compactKnowledge(blueprint) {
  return (blueprint.retrieved_knowledge || []).map((entry) => ({
    title: entry.title,
    type: entry.type,
    summary: entry.summary,
    formula: entry.formula,
    implementation: entry.implementation,
    assumptions: entry.assumptions,
    pitfalls: entry.pitfalls,
    source: entry.source
  }));
}

function responseText(payload) {
  if (payload.output_text) return payload.output_text;

  return (payload.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("\n")
    .trim();
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model did not return a JSON object.");
    return JSON.parse(match[0]);
  }
}

function buildPrompt(blueprint) {
  return `You are an expert ML architect. Generate a practical refinement for the supplied ML blueprint.

Return JSON only with this exact shape:
{
  "custom_summary": "one concise paragraph",
  "missing_questions": ["question"],
  "recommended_adjustments": ["adjustment"],
  "implementation_notes": ["note"],
  "risk_checks": ["risk"],
  "acceptance_tests": ["test"]
}

Rules:
- Use only the blueprint and retrieved knowledge below.
- Treat executable_checks as hard numeric facts from the user's CSV, not narrative hints.
- Treat decision, consequences, and component_consequences as the already-corrected deterministic plan.
- Never reintroduce a blocked metric, split, or feature from consequences.blocking.
- Never ignore component_consequences.blocking; every component-level blocker must become a missing question, adjustment, or acceptance test.
- If executable_checks show high majority baseline accuracy with zero minority recall, do not recommend accuracy as the primary metric.
- If consequences.verdict is needs_resolution, explain the unresolved decision points without contradicting decision.primary_metric, decision.split_strategy, or decision.features.
- Route around computed baseline failures with concrete alternative metrics, thresholds, splits, and acceptance tests.
- Do not invent source names.
- Keep recommendations concrete and implementation-oriented.
- Prefer conservative scikit-learn style code unless the blueprint clearly needs another stack.
- Keep each array to 3-5 items.

Blueprint:
${JSON.stringify(
  {
    title: blueprint.title,
    engine_name: blueprint.engine_name,
    project_type: blueprint.project_type,
    task_type: blueprint.task_type,
    audience: blueprint.audience,
    decision_trace: blueprint.decision_trace,
    components: blueprint.components,
    component_consequences: blueprint.component_consequences,
    summary: blueprint.summary,
    decision: blueprint.decision,
    consequences: blueprint.consequences,
    gate_answers: blueprint.gate_answers,
    gate_resolution: blueprint.gate_resolution,
    generated_questions: blueprint.generated_questions,
    data_contract: blueprint.data_contract,
    model_path: blueprint.model_path,
    formulas: blueprint.formulas,
    dataset_profile: blueprint.dataset_profile,
    executable_checks: blueprint.dataset_profile?.executable_checks || []
  },
  null,
  2
)}

Retrieved knowledge:
${JSON.stringify(compactKnowledge(blueprint), null, 2)}
`;
}

export async function generateAiRefinement(blueprint, { model = process.env.OPENAI_BLUEPRINT_MODEL || DEFAULT_MODEL } = {}) {
  if (!hasOpenAIKey()) {
    return {
      available: false,
      model,
      warning: "OPENAI_API_KEY is not set.",
      refinement: null
    };
  }

  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      input: buildPrompt(blueprint),
      max_output_tokens: 1200,
      model
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI blueprint refinement failed.");
  }

  const refinement = parseJsonObject(responseText(payload));
  return {
    available: true,
    model,
    warning: null,
    refinement
  };
}
