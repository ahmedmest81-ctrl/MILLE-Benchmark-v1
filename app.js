let state = {
  audience: "business",
  task: "auto",
  blueprint: null,
  datasetProfile: null,
  datasetCsv: null,
  datasetFilename: null,
  gateAnswers: {}
};

let renderTimer = null;

const ideaInput = document.querySelector("#idea-input");
const taskSelect = document.querySelector("#task-select");
const generateBtn = document.querySelector("#generate-btn");
const exportProjectBtn = document.querySelector("#export-project-btn");
const aiRefineBtn = document.querySelector("#ai-refine-btn");
const datasetInput = document.querySelector("#dataset-input");
const clearDatasetBtn = document.querySelector("#clear-dataset-btn");
const datasetStatus = document.querySelector("#dataset-status");
const datasetGrid = document.querySelector("#dataset-grid");
const summaryList = document.querySelector("#summary-list");
const dataContract = document.querySelector("#data-contract");
const modelPath = document.querySelector("#model-path");
const formulaGrid = document.querySelector("#formula-grid");
const knowledgeGrid = document.querySelector("#knowledge-grid");
const projectTree = document.querySelector("#project-tree");
const codeSelect = document.querySelector("#code-select");
const codeOutput = document.querySelector("#code-output");
const codeTitle = document.querySelector("#code-title");
const agentJson = document.querySelector("#agent-json");
const aiPanel = document.querySelector("#ai-panel");
const blueprintTitle = document.querySelector("#blueprint-title");
const confidencePill = document.querySelector("#confidence-pill");
const blockingBand = document.querySelector("#blocking-band");
const signalTask = document.querySelector("#signal-task");
const signalLoss = document.querySelector("#signal-loss");
const signalMetric = document.querySelector("#signal-metric");
const verdictCard = document.querySelector(".verdict-card");
const verdictFinding = document.querySelector("#verdict-finding");
const verdictBasis = document.querySelector("#verdict-basis");
const protocolList = document.querySelector("#protocol-list");
const decisionTable = document.querySelector("#decision-table");
const openGates = document.querySelector("#open-gates");
const gateResolutionFields = document.querySelector("#gate-resolution-fields");
const applyGateAnswersBtn = document.querySelector("#apply-gate-answers-btn");
const clearGateAnswersBtn = document.querySelector("#clear-gate-answers-btn");
const dataContractCount = document.querySelector("#data-contract-count");
const modelPathCount = document.querySelector("#model-path-count");
const datasetProfileCount = document.querySelector("#dataset-profile-count");
const knowledgeCount = document.querySelector("#knowledge-count");

async function requestBlueprint() {
  const response = await fetch("/api/blueprint", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      idea: ideaInput.value,
      task: taskSelect.value,
      audience: state.audience,
      dataset_profile: state.datasetProfile,
      gate_answers: state.gateAnswers
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Could not generate blueprint.");
  }
  return payload;
}

async function requestProjectZip() {
  const response = await fetch("/api/export-project", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      idea: ideaInput.value,
      task: taskSelect.value,
      audience: state.audience,
      dataset_profile: state.datasetProfile,
      dataset_csv: state.datasetCsv,
      dataset_filename: state.datasetFilename,
      gate_answers: state.gateAnswers
    })
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error || "Could not export project.");
  }

  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/);
  return {
    blob: await response.blob(),
    filename: match ? match[1] : "modelblueprint-project.zip"
  };
}

async function requestAiRefinement() {
  const response = await fetch("/api/ai-blueprint", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      idea: ideaInput.value,
      task: taskSelect.value,
      audience: state.audience,
      dataset_profile: state.datasetProfile,
      gate_answers: state.gateAnswers
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Could not generate AI refinement.");
  }
  return payload;
}

async function requestDatasetProfile(file) {
  const csvText = await file.text();
  const response = await fetch("/api/analyze-dataset", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      csv_text: csvText,
      filename: file.name,
      idea: ideaInput.value
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Could not analyze dataset.");
  }
  return { profile: payload, csvText };
}

function renderSummary(summary) {
  summaryList.innerHTML = "";
  Object.entries(summary).forEach(([label, value]) => {
    const item = document.createElement("div");
    item.className = "summary-item";
    item.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span>`;
    summaryList.appendChild(item);
  });
}

function renderBlockingBand(blueprint) {
  const blocks = [
    ...(blueprint.consequences?.blocking || []),
    ...(blueprint.component_consequences?.blocking || [])
  ];
  const questions = blueprint.generated_questions || [];
  if (!blocks.length) {
    blockingBand.hidden = true;
    blockingBand.innerHTML = "";
    return;
  }
  blockingBand.hidden = false;
  blockingBand.innerHTML = `
    <h3>Needs resolution</h3>
    <ul>
      ${blocks
        .map(
          (block) => `<li><strong>${escapeHtml(block.id)}</strong>: ${escapeHtml(block.message)} ${block.remedy ? `<br>${escapeHtml(formatRemedy(block.remedy))}` : ""}</li>`
        )
        .join("")}
      ${questions.length ? `<li><strong>Missing questions</strong>: ${questions.map(escapeHtml).join(" | ")}</li>` : ""}
    </ul>
  `;
}

function allConsequences(blueprint) {
  return [
    ...(blueprint.consequences?.all || []),
    ...(blueprint.component_consequences?.all || [])
  ];
}

function allBlockingGates(blueprint) {
  return [
    ...(blueprint.consequences?.blocking || []),
    ...(blueprint.component_consequences?.blocking || [])
  ];
}

function firedConsequences(blueprint) {
  return allConsequences(blueprint).filter((item) => item?.fired);
}

function consequenceById(blueprint, id) {
  return allConsequences(blueprint).find((item) => item?.id === id && item.fired);
}

function labelText(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function valueText(value) {
  if (value == null || value === "") return "unset";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function compactComputed(computed = {}) {
  if (!computed || typeof computed !== "object") return "";
  const parts = [];
  if (computed.majority_accuracy != null) parts.push(`majority accuracy ${computed.majority_accuracy}`);
  if (computed.minority_recall != null) parts.push(`minority recall ${computed.minority_recall}`);
  if (computed.macro_recall != null) parts.push(`macro recall ${computed.macro_recall}`);
  if (computed.date_signals?.length) parts.push(`time signals ${computed.date_signals.join(", ")}`);
  if (computed.blocked_columns?.length) parts.push(`blocked columns ${computed.blocked_columns.join(", ")}`);
  if (computed.unvalidated_count != null) parts.push(`${computed.unvalidated_count} unvalidated inputs`);
  return parts.join("; ");
}

function datasetRecord(profile) {
  if (!profile) return "No dataset uploaded";
  const inferred = profile.inferred || {};
  const shape = `${profile.row_count} rows x ${profile.column_count} columns`;
  const target = inferred.target ? `target ${inferred.target}` : "target not detected";
  return `${profile.filename}: ${shape}, ${target}`;
}

function firstExecutableCheck(profile) {
  return profile?.executable_checks?.find((check) => check.executable_consequence) || profile?.executable_checks?.[0] || null;
}

function renderVerdict(blueprint) {
  const blocks = allBlockingGates(blueprint);
  const verdict = blueprint.consequences?.verdict || "ok";
  const decision = blueprint.decision || {};
  const check = firstExecutableCheck(blueprint.dataset_profile);
  const hasBlocks = blocks.length > 0;
  const primaryBlock = blocks[0];

  verdictCard.classList.toggle("needs-resolution", hasBlocks || verdict === "needs_resolution");
  confidencePill.textContent = hasBlocks || verdict === "needs_resolution" ? "Needs resolution" : "Clear to build";

  if (hasBlocks) {
    verdictFinding.textContent = primaryBlock.message;
    verdictBasis.textContent = [
      compactComputed(primaryBlock.computed),
      `Corrected plan: ${decision.task_type || blueprint.task_type}, ${decision.objective || "objective unset"}, ${decision.primary_metric || "metric unset"}, ${decision.split_strategy || "split unset"} split.`,
      datasetRecord(blueprint.dataset_profile)
    ]
      .filter(Boolean)
      .join(" ");
    return;
  }

  verdictFinding.textContent = check?.executable_consequence
    ? `No blocking gate stands open. The model still has to beat the computed baseline: ${check.executable_consequence}`
    : "No blocking gate stands open. The plan is sound as stated and ready to become an implementation record.";
  verdictBasis.textContent = `${datasetRecord(blueprint.dataset_profile)}. Decision: ${decision.task_type || blueprint.task_type}, objective ${decision.objective || "unset"}, metric ${decision.primary_metric || "unset"}, ${decision.split_strategy || "unset"} split.`;
}

function renderProtocol(blueprint) {
  protocolList.innerHTML = "";
  const items = [];
  const decision = blueprint.decision || {};
  const profile = blueprint.dataset_profile;
  const fired = firedConsequences(blueprint);

  items.push({
    label: "Read",
    text: `Interpreted the request as ${blueprint.project_type === "multi_component_system" ? "a multi-component ML system" : `a ${blueprint.task_type} task`}.`
  });

  if (profile) {
    items.push({
      label: "Profiled",
      text: datasetRecord(profile),
      computed: firstExecutableCheck(profile)?.executable_consequence || ""
    });
  } else {
    items.push({
      label: "Profile",
      text: "No CSV was attached, so dataset-aware checks use the stated idea and inferred columns."
    });
  }

  if (fired.length) {
    fired.forEach((item) => {
      items.push({
        label: item.severity === "block" ? "Blocked" : "Warned",
        text: `${labelText(item.id)}: ${item.message}`,
        computed: compactComputed(item.computed)
      });
    });
  } else {
    items.push({
      label: "Cleared",
      text: "Metric validity, split validity, leakage, and runtime data-contract checks produced no blocking gates."
    });
  }

  items.push({
    label: "Corrected",
    text: `Set the build contract to objective ${decision.objective || "unset"}, metric ${decision.primary_metric || "unset"}, and ${decision.split_strategy || "unset"} validation.`
  });

  items.push({
    label: "Export",
    text: "Wrote the same decision, gates, generated questions, and acceptance criteria into the agent spec and project export."
  });

  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<span><strong>${escapeHtml(item.label)}</strong> ${escapeHtml(item.text)}${
      item.computed ? `<span class="computed">${escapeHtml(item.computed)}</span>` : ""
    }</span>`;
    protocolList.appendChild(li);
  });
}

function decisionRow(label, value, options = {}) {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  const td = document.createElement("td");
  th.textContent = label;

  const current = escapeHtml(valueText(value));
  const previous = options.previous ? `<span class="struck">${escapeHtml(options.previous)}</span>` : "";
  td.innerHTML = `<span class="decision-value">${previous}<span class="${options.previous ? "corrected" : ""}">${current}</span></span>${
    options.note ? `<span class="decision-note">${escapeHtml(options.note)}</span>` : ""
  }`;
  tr.append(th, td);
  return tr;
}

function renderDecisionTable(blueprint) {
  decisionTable.innerHTML = "";
  const decision = blueprint.decision || {};
  const metricGate = consequenceById(blueprint, "metric-validity");
  const splitGate = consequenceById(blueprint, "split-validity");
  const leakageGate = consequenceById(blueprint, "target-leakage");
  const dataGate = consequenceById(blueprint, "data-contract-gate");
  const blockedColumns = leakageGate?.computed?.blocked_columns || [];
  const validationFields = dataGate?.computed?.fields || decision.input_constraints || [];

  decisionTable.append(
    decisionRow("Task", decision.task_type || blueprint.task_type),
    decisionRow("Target", decision.target || blueprint.dataset_profile?.inferred?.target || "confirm target"),
    decisionRow("Objective", decision.objective, {
      previous: metricGate ? "accuracy" : "",
      note: metricGate ? "Accuracy was rejected because the baseline made it unsafe." : ""
    }),
    decisionRow("Primary metric", decision.primary_metric, {
      previous: metricGate ? "accuracy" : "",
      note: metricGate ? "Average precision keeps attention on the positive class." : ""
    }),
    decisionRow("Split", decision.split_strategy, {
      previous: splitGate ? "random" : "",
      note: splitGate ? "Time signals require validation against the future, not shuffled rows." : ""
    }),
    decisionRow("Features", decision.features || [], {
      note: blockedColumns.length ? `Excluded leakage columns: ${blockedColumns.join(", ")}.` : "Identifiers and blocked leakage columns are excluded when detected."
    }),
    decisionRow("Input validation", validationFields.map((field) => `${field.field}: ${field.rule}`), {
      note: validationFields.length ? "These runtime checks are carried into validation.py and tests." : "No runtime validation fields were inferred."
    }),
    decisionRow("Threshold policy", decision.threshold_policy
      ? `FN cost ${decision.threshold_policy.false_negative_cost}, FP cost ${decision.threshold_policy.false_positive_cost}, min recall ${decision.threshold_policy.minimum_recall}`
      : blueprint.generated_questions?.some((question) => /cost|recall|threshold/i.test(question)) ? "unset" : "not required", {
      note: decision.threshold_policy
        ? "Business cost answers are now part of the build contract."
        : "Business cost questions remain gates when the operating point cannot be computed safely."
    })
  );
}

function renderOpenGates(blueprint) {
  openGates.innerHTML = "";
  const fired = firedConsequences(blueprint).filter((item) => item.severity === "block" || item.severity === "warn");
  const questions = blueprint.generated_questions || [];

  if (!fired.length && !questions.length) {
    const clear = document.createElement("article");
    clear.className = "gate-card";
    clear.innerHTML = `
      <div class="gate-name">No open gates<span class="severity">clear</span></div>
      <p>MILLE found no blocking consequences. The export still carries the computed decision, data contract, and acceptance criteria.</p>
    `;
    openGates.appendChild(clear);
    return;
  }

  fired.forEach((item) => {
    const card = document.createElement("article");
    const statusClass = ["resolved", "accepted"].includes(item.resolution_status) ? item.resolution_status : "";
    card.className = `gate-card ${item.severity === "block" ? "block" : "warn"} ${statusClass}`.trim();
    const itemQuestions = item.questions || [];
    card.innerHTML = `
      <div class="gate-name">${escapeHtml(item.id)}<span class="severity">${escapeHtml(item.resolution_status || item.severity)}</span></div>
      <p>${escapeHtml(item.message)}</p>
      ${item.resolution_note ? `<p><strong>Status:</strong> ${escapeHtml(item.resolution_note)}</p>` : ""}
      ${item.remedy ? `<p><strong>Remedy:</strong> ${escapeHtml(formatRemedy(item.remedy))}</p>` : ""}
      ${itemQuestions.length ? `<ul>${itemQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>` : ""}
    `;
    openGates.appendChild(card);
  });

  const extraQuestions = questions.filter((question) => !fired.some((item) => (item.questions || []).includes(question)));
  if (extraQuestions.length) {
    const card = document.createElement("article");
    card.className = "gate-card warn";
    card.innerHTML = `
      <div class="gate-name">generated-questions<span class="severity">ask</span></div>
      <p>These questions should be answered before implementation details are treated as final.</p>
      <ul>${extraQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>
    `;
    openGates.appendChild(card);
  }
}

function gateAnswerValue(name, fallback = "") {
  const value = state.gateAnswers?.[name];
  return value == null ? fallback : String(value);
}

function targetLeakageColumns(blueprint) {
  const gate = allConsequences(blueprint).find((item) => item.id === "target-leakage" && item.fired);
  return gate?.computed?.blocked_columns || [];
}

function gateAnswerField({ id, label, type = "text", value = "", placeholder = "", help = "", min = "", max = "", step = "" }) {
  return `
    <div class="gate-answer-field">
      <label for="${id}">${label}</label>
      <input id="${id}" type="${type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${min !== "" ? ` min="${min}"` : ""}${max !== "" ? ` max="${max}"` : ""}${step !== "" ? ` step="${step}"` : ""} />
      ${help ? `<p class="gate-answer-help">${escapeHtml(help)}</p>` : ""}
    </div>
  `;
}

function renderGateResolution(blueprint) {
  const fired = (blueprint.consequences?.all || []).filter((item) => item?.fired && (item.severity === "block" || item.severity === "warn"));
  const leakageColumns = targetLeakageColumns(blueprint);
  const accepted = new Set(state.gateAnswers.accepted_gate_ids || []);
  const leakageAnswers = state.gateAnswers.leakage_field_known_before_prediction || {};
  const gateOptions = fired
    .map(
      (gate) => `
        <label class="gate-answer-option">
          <input type="checkbox" data-accept-gate="${escapeHtml(gate.id)}" ${accepted.has(gate.id) ? "checked" : ""} />
          <span>Accept ${escapeHtml(gate.id)} as a known risk</span>
        </label>
      `
    )
    .join("");
  const leakageControls = leakageColumns
    .map((column) => {
      const current = leakageAnswers[column] === false
        ? "not_known_before_prediction"
        : leakageAnswers[column] === true
          ? "known_before_prediction"
          : "";
      return `
        <div class="gate-answer-field">
          <label for="leakage-${escapeHtml(column)}">${escapeHtml(column)}</label>
          <select id="leakage-${escapeHtml(column)}" data-leakage-field="${escapeHtml(column)}">
            <option value="" ${current === "" ? "selected" : ""}>Unknown</option>
            <option value="not_known_before_prediction" ${current === "not_known_before_prediction" ? "selected" : ""}>Not known before prediction</option>
            <option value="known_before_prediction" ${current === "known_before_prediction" ? "selected" : ""}>Known before prediction</option>
          </select>
        </div>
      `;
    })
    .join("");

  gateResolutionFields.innerHTML = `
    <div class="gate-answer-grid">
      ${gateAnswerField({
        id: "false-negative-cost",
        label: "False negative cost",
        type: "number",
        value: gateAnswerValue("false_negative_cost"),
        placeholder: "500",
        min: "0",
        step: "0.01",
        help: "Cost of missing the positive class."
      })}
      ${gateAnswerField({
        id: "false-positive-cost",
        label: "False positive cost",
        type: "number",
        value: gateAnswerValue("false_positive_cost"),
        placeholder: "25",
        min: "0",
        step: "0.01",
        help: "Cost of a false alarm."
      })}
      ${gateAnswerField({
        id: "minimum-recall",
        label: "Minimum recall",
        type: "number",
        value: gateAnswerValue("minimum_recall"),
        placeholder: "0.85",
        min: "0",
        max: "1",
        step: "0.01",
        help: "Use 0-1, for example 0.85."
      })}
      ${gateAnswerField({
        id: "cutoff-date",
        label: "Cutoff date",
        type: "date",
        value: gateAnswerValue("cutoff_date"),
        help: "Temporal train/test boundary."
      })}
      ${gateAnswerField({
        id: "prediction-horizon",
        label: "Prediction horizon",
        value: gateAnswerValue("prediction_horizon"),
        placeholder: "next 7 days",
        help: "Window the model predicts into."
      })}
      <fieldset class="gate-answer-group">
        <legend>Input validation</legend>
        <label class="gate-answer-option">
          <input id="input-validation-acknowledged" type="checkbox" ${state.gateAnswers.input_validation_acknowledged ? "checked" : ""} />
          <span>Require generated runtime validation before deployment</span>
        </label>
      </fieldset>
      ${
        leakageControls
          ? `<fieldset class="gate-answer-group"><legend>Leakage field timing</legend><p class="gate-answer-help">Fields marked not known before prediction stay excluded and resolve the leakage gate.</p><div class="gate-answer-grid">${leakageControls}</div></fieldset>`
          : ""
      }
      ${
        gateOptions
          ? `<fieldset class="gate-answer-group"><legend>Risk acceptance</legend><p class="gate-answer-help">Accepted gates are carried into the export as known risks instead of blocking implementation.</p>${gateOptions}</fieldset>`
          : ""
      }
    </div>
  `;
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function collectGateAnswers() {
  const leakage = {};
  document.querySelectorAll("[data-leakage-field]").forEach((select) => {
    const field = select.dataset.leakageField;
    if (!field || !select.value) return;
    leakage[field] = select.value === "known_before_prediction";
  });
  const accepted = Array.from(document.querySelectorAll("[data-accept-gate]:checked")).map((input) => input.dataset.acceptGate);
  const answers = {
    false_negative_cost: numberOrNull(document.querySelector("#false-negative-cost")?.value),
    false_positive_cost: numberOrNull(document.querySelector("#false-positive-cost")?.value),
    minimum_recall: numberOrNull(document.querySelector("#minimum-recall")?.value),
    cutoff_date: document.querySelector("#cutoff-date")?.value || "",
    prediction_horizon: document.querySelector("#prediction-horizon")?.value.trim() || "",
    input_validation_acknowledged: Boolean(document.querySelector("#input-validation-acknowledged")?.checked),
    leakage_field_known_before_prediction: leakage,
    accepted_gate_ids: accepted.filter(Boolean)
  };
  Object.keys(answers).forEach((key) => {
    if (answers[key] == null || answers[key] === "") delete answers[key];
  });
  if (!Object.keys(leakage).length) delete answers.leakage_field_known_before_prediction;
  if (!answers.accepted_gate_ids?.length) delete answers.accepted_gate_ids;
  return answers;
}

function formatRemedy(remedy) {
  if (remedy == null) return "";
  if (typeof remedy === "string") return remedy;
  if (Array.isArray(remedy)) return remedy.map(formatRemedy).filter(Boolean).join("; ");
  if (typeof remedy === "object") {
    if (remedy.require_validation && Array.isArray(remedy.constraints)) {
      return `Add validation for ${remedy.constraints.map((item) => `${item.field} (${item.rule})`).join(", ")}.`;
    }
    return Object.entries(remedy)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
      .join("; ");
  }
  return String(remedy);
}

function renderList(target, items) {
  target.innerHTML = "";
  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    target.appendChild(li);
  });
}

function renderFormulas(formulas) {
  formulaGrid.innerHTML = "";
  const safeFormulas = formulas || [];
  safeFormulas.forEach((item) => {
    const card = document.createElement("article");
    card.className = "formula-card";
    card.innerHTML = `
      <span class="tag">${escapeHtml(item.tag)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <div class="formula">${escapeHtml(item.formula)}</div>
      <p>${escapeHtml(item.note)}</p>
    `;
    formulaGrid.appendChild(card);
  });
}

function renderKnowledge(entries) {
  knowledgeGrid.innerHTML = "";
  const safeEntries = entries || [];
  safeEntries.forEach((entry) => {
    const card = document.createElement("article");
    const source = document.createElement("a");
    card.className = "knowledge-card";
    source.href = entry.source?.url || "#";
    source.target = "_blank";
    source.rel = "noreferrer";
    source.textContent = entry.source?.label || "Source";
    card.innerHTML = `
      <div class="knowledge-meta">
        <span>${escapeHtml(entry.type)}</span>
        <span>${escapeHtml(entry.retrieval_method || "keyword")}</span>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="knowledge-formula">${escapeHtml(entry.formula)}</div>
      <dl>
        <dt>Implementation</dt>
        <dd>${escapeHtml(entry.implementation)}</dd>
        <dt>Watch for</dt>
        <dd>${escapeHtml(entry.pitfalls?.[0] || "Review assumptions before implementation.")}</dd>
        ${
          entry.retrieval_warning
            ? `<dt>Status</dt><dd>${escapeHtml(entry.retrieval_warning)}</dd>`
            : ""
        }
      </dl>
    `;
    card.appendChild(source);
    knowledgeGrid.appendChild(card);
  });
}

function renderCode(files) {
  const previousFile = codeSelect.value;
  const filenames = Object.keys(files);
  const selectedFile = filenames.includes(previousFile) ? previousFile : filenames[0];

  codeSelect.innerHTML = "";
  filenames.forEach((filename) => {
    const option = document.createElement("option");
    option.value = filename;
    option.textContent = filename;
    codeSelect.appendChild(option);
  });

  codeSelect.value = selectedFile;
  codeTitle.textContent = selectedFile;
  codeOutput.textContent = files[selectedFile] || "";
}

function renderBlueprint(blueprint) {
  state.blueprint = blueprint;
  state.datasetProfile = blueprint.dataset_profile || state.datasetProfile;
  state.task = blueprint.task_type;

  const signals = decisionSignals(blueprint);
  const verdict = blueprint.consequences?.verdict || "ok";
  blueprintTitle.textContent = blueprint.title;
  signalTask.textContent = signals[0];
  signalLoss.textContent = signals[1];
  signalMetric.textContent = signals[2];

  renderVerdict(blueprint);
  renderBlockingBand(blueprint);
  renderProtocol(blueprint);
  renderDecisionTable(blueprint);
  renderGateResolution(blueprint);
  renderOpenGates(blueprint);
  renderSummary(blueprint.summary);
  renderList(dataContract, blueprint.data_contract);
  renderList(modelPath, blueprint.model_path);
  renderFormulas(blueprint.formulas);
  renderKnowledge(blueprint.retrieved_knowledge || []);
  dataContractCount.textContent = `${blueprint.data_contract?.length || 0} items`;
  modelPathCount.textContent = `${blueprint.model_path?.length || 0} steps`;
  datasetProfileCount.textContent = blueprint.dataset_profile
    ? `${blueprint.dataset_profile.row_count} x ${blueprint.dataset_profile.column_count}`
    : "not uploaded";
  knowledgeCount.textContent = `${blueprint.retrieved_knowledge?.length || 0} sources`;
  renderDatasetProfile(blueprint.dataset_profile || state.datasetProfile);
  projectTree.textContent = blueprint.project_tree;
  renderCode(blueprint.files);
  agentJson.textContent = JSON.stringify(blueprint.agent_spec, null, 2);
  exportProjectBtn.disabled = hasBlockingGates(blueprint);
}

function hasBlockingGates(blueprint) {
  return Boolean((blueprint.consequences?.blocking || []).length || (blueprint.component_consequences?.blocking || []).length);
}

function isMultiComponentBlueprint(blueprint) {
  return blueprint.project_type === "multi_component_system";
}

function uniqueText(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function decisionSignals(blueprint) {
  if (!isMultiComponentBlueprint(blueprint)) {
    return [
      blueprint.decision?.task_type || blueprint.signals[0],
      blueprint.decision?.objective || blueprint.signals[1],
      blueprint.decision?.primary_metric || blueprint.signals[2]
    ];
  }

  const components = blueprint.components || [];
  const taskTypes = uniqueText(components.map((component) => component.task_type));
  const metrics = uniqueText(components.flatMap((component) => component.metrics || []));
  return [
    "multi-component",
    `${components.length} components`,
    metrics.slice(0, 3).join(", ") || taskTypes.join(", ")
  ];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderDatasetProfile(profile) {
  datasetGrid.innerHTML = "";
  if (!profile) {
    datasetGrid.innerHTML = `<article class="panel"><p class="empty-state">Upload a CSV to analyze dataset structure.</p></article>`;
    return;
  }

  const inferred = profile.inferred || {};
  const overview = document.createElement("article");
  overview.className = "panel dataset-card";
  overview.innerHTML = `
    <p class="eyebrow">Overview</p>
    <h2>${escapeHtml(profile.filename)}</h2>
    <dl>
      <dt>Rows</dt><dd>${profile.row_count}</dd>
      <dt>Columns</dt><dd>${profile.column_count}</dd>
      <dt>Task</dt><dd>${escapeHtml(inferred.task_type || "unknown")}</dd>
      <dt>Target</dt><dd>${escapeHtml(inferred.target || "not detected")}</dd>
      ${profile.executable_checks?.[0]?.class_distribution ? `<dt>Class balance</dt><dd>${escapeHtml(formatClassBalance(profile.executable_checks[0].class_distribution))}</dd>` : ""}
      ${profile.executable_checks?.[0]?.majority_accuracy != null ? `<dt>Majority baseline</dt><dd>${escapeHtml(formatPercent(profile.executable_checks[0].majority_accuracy))} accuracy</dd>` : ""}
    </dl>
  `;

  const features = document.createElement("article");
  features.className = "panel dataset-card";
  features.innerHTML = `
    <p class="eyebrow">Feature Groups</p>
    <h2>Generated Schema</h2>
    <dl>
      <dt>Numeric</dt><dd>${escapeHtml((inferred.numeric_features || []).join(", ") || "none")}</dd>
      <dt>Categorical</dt><dd>${escapeHtml((inferred.categorical_features || []).join(", ") || "none")}</dd>
      <dt>Text</dt><dd>${escapeHtml((inferred.text_features || []).join(", ") || "none")}</dd>
      <dt>Dates</dt><dd>${escapeHtml((inferred.date_columns || []).join(", ") || "none")}</dd>
      <dt>Excluded</dt><dd>${escapeHtml((inferred.excluded_features || []).join(", ") || "none")}</dd>
    </dl>
  `;

  const warnings = document.createElement("article");
  warnings.className = "panel dataset-card";
  const warningItems = [...(profile.leakage_warnings || []), ...(profile.quality_warnings || [])];
  warnings.innerHTML = `
    <p class="eyebrow">Warnings</p>
    <h2>Review Before Training</h2>
    <ul>${warningItems.length ? warningItems.map((item) => `<li><strong>${escapeHtml(item.column)}</strong>${item.severity ? ` (${escapeHtml(item.severity)})` : ""}: ${escapeHtml(item.reason)}</li>`).join("") : "<li>No major warnings detected.</li>"}</ul>
  `;

  const executable = document.createElement("article");
  executable.className = "panel dataset-card";
  const checks = profile.executable_checks || [];
  executable.innerHTML = `
    <p class="eyebrow">Executable Checks</p>
    <h2>Computed Baselines</h2>
    <ul>${
      checks.length
        ? checks
            .map((check) => {
              if (check.kind === "classification_majority_baseline") {
                return `<li><strong>Majority baseline</strong>: ${check.majority_accuracy} accuracy, ${check.minority_recall} minority recall, ${check.macro_recall} macro recall.</li>`;
              }
              if (check.kind.includes("regression")) {
                return `<li><strong>Constant baseline</strong>: mean MAE ${check.mean_baseline_mae}, median MAE ${check.median_baseline_mae}, RMSE ${check.mean_baseline_rmse}.</li>`;
              }
              if (check.kind.includes("forecasting")) {
                return `<li><strong>Naive forecast</strong>: previous-value MAE ${check.naive_previous_value_mae}.</li>`;
              }
              return `<li>${escapeHtml(check.executable_consequence || check.kind)}</li>`;
            })
            .join("")
        : "<li>No executable checks available for this dataset/task.</li>"
    }</ul>
  `;

  const columns = document.createElement("article");
  columns.className = "panel dataset-card wide";
  columns.innerHTML = `
    <p class="eyebrow">Columns</p>
    <h2>Profiler Output</h2>
    <div class="column-table">
      ${profile.columns
        .map(
          (column) => `<div>
            <strong>${escapeHtml(column.name)}</strong>
            <span>${escapeHtml(column.kind)}</span>
            <span>${column.unique_count} unique</span>
            <span>${Math.round(column.missing_ratio * 100)}% missing</span>
          </div>`
        )
        .join("")}
    </div>
  `;

  datasetGrid.append(overview, features, executable, warnings, columns);
}

function formatPercent(value) {
  return `${Math.round(Number(value) * 10000) / 100}%`;
}

function formatClassBalance(distribution = []) {
  return distribution.map((item) => `${item.label}: ${item.count} (${formatPercent(item.ratio)})`).join(", ");
}

function listBlock(title, items) {
  const list = document.createElement("ul");
  const section = document.createElement("section");
  const heading = document.createElement("h3");
  heading.textContent = title;
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
  section.append(heading, list);
  return section;
}

function renderAiRefinement(payload) {
  aiPanel.innerHTML = "";
  const ai = payload.ai;
  const header = document.createElement("div");
  header.className = "ai-header";
  header.innerHTML = `<strong>${ai.available ? "AI refinement ready" : "AI unavailable"}</strong><span>${ai.model}</span>`;
  aiPanel.appendChild(header);

  if (!ai.available) {
    const warning = document.createElement("p");
    warning.className = "empty-state";
    warning.textContent = ai.warning || "AI refinement is not available.";
    aiPanel.appendChild(warning);
    return;
  }

  const refinement = ai.refinement;
  const summary = document.createElement("p");
  summary.className = "ai-summary";
  summary.textContent = refinement.custom_summary;
  aiPanel.appendChild(summary);

  const grid = document.createElement("div");
  grid.className = "ai-grid";
  grid.append(
    listBlock("Missing Questions", refinement.missing_questions || []),
    listBlock("Recommended Adjustments", refinement.recommended_adjustments || []),
    listBlock("Implementation Notes", refinement.implementation_notes || []),
    listBlock("Risk Checks", refinement.risk_checks || []),
    listBlock("Acceptance Tests", refinement.acceptance_tests || [])
  );
  aiPanel.appendChild(grid);
}

function renderError(error) {
  blueprintTitle.textContent = "Backend connection needed";
  confidencePill.textContent = "Offline";
  verdictCard.classList.add("needs-resolution");
  verdictFinding.textContent = "MILLE needs the local backend before it can compute a verdict.";
  verdictBasis.textContent = error.message;
  blockingBand.hidden = true;
  blockingBand.innerHTML = "";
  signalTask.textContent = "api";
  signalLoss.textContent = "waiting";
  signalMetric.textContent = "retry";
  protocolList.innerHTML = "";
  const li = document.createElement("li");
  li.innerHTML = `<span><strong>Waiting</strong> ${escapeHtml(error.message)}</span>`;
  protocolList.appendChild(li);
  decisionTable.innerHTML = "";
  decisionTable.append(
    decisionRow("Status", "offline"),
    decisionRow("Action", "start the local server")
  );
  openGates.innerHTML = `
    <article class="gate-card block">
      <div class="gate-name">backend-connection<span class="severity">block</span></div>
      <p>${escapeHtml(error.message)}</p>
    </article>
  `;
  summaryList.innerHTML = "";
  const item = document.createElement("div");
  item.className = "summary-item";
  const label = document.createElement("strong");
  const message = document.createElement("span");
  label.textContent = "Server";
  message.textContent = error.message;
  item.append(label, message);
  summaryList.appendChild(item);
}

async function render() {
  generateBtn.disabled = true;

  try {
    const blueprint = await requestBlueprint();
    renderBlueprint(blueprint);
  } catch (error) {
    renderError(error);
  } finally {
    generateBtn.disabled = false;
  }
}

function scheduleRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(render, 250);
}

function clearGateAnswersForNewContext() {
  state.gateAnswers = {};
}

function copyText(text) {
  navigator.clipboard.writeText(text);
}

function textBlueprint() {
  if (!state.blueprint) return "";
  const blueprint = state.blueprint;
  return `# ${blueprint.title}

Task type: ${blueprint.task_type}
Project type: ${blueprint.project_type || "single_task"}
Audience: ${blueprint.audience}

## Decision Trace
${(blueprint.decision_trace || []).map((item) => `- ${item}`).join("\n") || "- No decision trace returned."}

## Components
${(blueprint.components || [])
  .map((component) => `- ${component.name} (${component.task_type}): ${component.objective}. Target: ${component.target}. Metrics: ${(component.metrics || []).join(", ")}.`)
  .join("\n") || "- Single-task blueprint."}

## Component Consequences
${blueprint.component_consequences?.all?.length
  ? blueprint.component_consequences.all
      .map((item) => `- ${item.component_name}: ${item.severity} ${item.id} - ${item.message}`)
      .join("\n")
  : "- None."}

${Object.entries(blueprint.summary)
  .map(([key, value]) => `## ${key}\n${value}`)
  .join("\n\n")}

## Data Contract
${blueprint.data_contract.map((item) => `- ${item}`).join("\n")}

## Model Path
${blueprint.model_path.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Math
${blueprint.formulas.map((item) => `- ${item.title}: ${item.formula}`).join("\n")}

## Retrieved Knowledge
${(blueprint.retrieved_knowledge || [])
  .map((item) => `- ${item.title} (${item.source.label}): ${item.source.url}`)
  .join("\n")}

## Agent Spec
${JSON.stringify(blueprint.agent_spec, null, 2)}
`;
}

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.audience = button.dataset.audience;
    render();
  });
});

generateBtn.addEventListener("click", render);
taskSelect.addEventListener("change", () => {
  clearGateAnswersForNewContext();
  render();
});
ideaInput.addEventListener("input", () => {
  clearGateAnswersForNewContext();
  if (taskSelect.value === "auto") scheduleRender();
});

codeSelect.addEventListener("change", () => {
  if (!state.blueprint) return;
  const files = state.blueprint.files;
  codeTitle.textContent = codeSelect.value;
  codeOutput.textContent = files[codeSelect.value] || "";
});

document.querySelector("#copy-summary-btn").addEventListener("click", () => copyText(textBlueprint()));
document.querySelector("#copy-agent-btn").addEventListener("click", () => copyText(agentJson.textContent));
document.querySelector("#download-btn").addEventListener("click", () => {
  const blob = new Blob([textBlueprint()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "modelblueprint.md";
  link.click();
  URL.revokeObjectURL(url);
});

exportProjectBtn.addEventListener("click", async () => {
  exportProjectBtn.disabled = true;
  try {
    const { blob, filename } = await requestProjectZip();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    renderError(error);
  } finally {
    exportProjectBtn.disabled = false;
  }
});

aiRefineBtn.addEventListener("click", async () => {
  aiRefineBtn.disabled = true;
  aiPanel.innerHTML = `<p class="empty-state">Generating AI refinement...</p>`;
  try {
    const payload = await requestAiRefinement();
    renderBlueprint(payload.blueprint);
    renderAiRefinement(payload);
  } catch (error) {
    renderError(error);
  } finally {
    aiRefineBtn.disabled = false;
  }
});

applyGateAnswersBtn.addEventListener("click", async () => {
  state.gateAnswers = collectGateAnswers();
  await render();
});

clearGateAnswersBtn.addEventListener("click", async () => {
  state.gateAnswers = {};
  await render();
});

datasetInput.addEventListener("change", async () => {
  const file = datasetInput.files?.[0];
  if (!file) return;
  clearGateAnswersForNewContext();
  datasetStatus.textContent = `Analyzing ${file.name}...`;
  try {
    const { profile, csvText } = await requestDatasetProfile(file);
    state.datasetProfile = profile;
    state.datasetCsv = csvText;
    state.datasetFilename = file.name;
    const baseline = profile.executable_checks?.find((check) => check.kind === "classification_majority_baseline");
    datasetStatus.textContent = baseline
      ? `${file.name}: ${profile.row_count} rows, ${profile.column_count} columns. Target ${profile.inferred?.target || "unknown"}; majority baseline ${formatPercent(baseline.majority_accuracy)} accuracy, minority recall ${baseline.minority_recall}.`
      : `${file.name}: ${profile.row_count} rows, ${profile.column_count} columns. Target ${profile.inferred?.target || "unknown"}.`;
    renderDatasetProfile(profile);
    await render();
  } catch (error) {
    datasetStatus.textContent = error.message;
    renderDatasetProfile(null);
  }
});

clearDatasetBtn.addEventListener("click", async () => {
  state.datasetProfile = null;
  state.datasetCsv = null;
  state.datasetFilename = null;
  clearGateAnswersForNewContext();
  datasetInput.value = "";
  datasetStatus.textContent = "Optional. Upload a CSV to generate dataset-aware schema and code.";
  renderDatasetProfile(null);
  await render();
});

render();
