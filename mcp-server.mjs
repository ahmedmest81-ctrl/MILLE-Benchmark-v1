#!/usr/bin/env node
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { generateBlueprint } from "./blueprint-engine.mjs";
import { analyzeDataset } from "./dataset-profiler.mjs";
import { retrieveKnowledgeByKeyword } from "./knowledge-base.mjs";
import { buildProjectFiles, buildProjectZip, exportFilename } from "./project-export.mjs";
import {
  validateBlueprintContract,
  validateDatasetProfileContract
} from "./schema-contracts.mjs";

export const PROTOCOL_VERSION = "2025-06-18";

const agentTaskInputSchema = {
  type: "object",
  required: ["idea"],
  additionalProperties: false,
  properties: {
    idea: { type: "string", minLength: 3 },
    task: {
      type: "string",
      default: "auto",
      enum: ["auto", "classification", "regression", "forecasting", "recommendation", "clustering"]
    },
    audience: {
      type: "string",
      default: "technical",
      enum: ["technical", "business", "executive"]
    },
    dataset_profile: { type: ["object", "null"] },
    gate_answers: {
      type: "object",
      additionalProperties: true,
      properties: {
        false_negative_cost: { type: "number", minimum: 0 },
        false_positive_cost: { type: "number", minimum: 0 },
        minimum_recall: { type: "number", minimum: 0, maximum: 1 },
        cutoff_date: { type: "string" },
        prediction_horizon: { type: "string" },
        group_split_column: { type: "string" },
        input_validation_acknowledged: { type: "boolean" },
        leakage_field_known_before_prediction: {
          type: "object",
          additionalProperties: { type: "boolean" }
        },
        accepted_gate_ids: {
          type: "array",
          items: { type: "string" }
        }
      }
    }
  }
};

export const tools = [
  {
    name: "mille_generate_blueprint",
    description: "Generate a MILLE ML system blueprint from a plain-language project idea.",
    inputSchema: agentTaskInputSchema
  },
  {
    name: "mille_profile_dataset",
    description: "Profile CSV text and infer target, task type, feature groups, leakage warnings, and executable baselines.",
    inputSchema: {
      type: "object",
      required: ["csv_text"],
      additionalProperties: false,
      properties: {
        csv_text: { type: "string", minLength: 1 },
        filename: { type: "string", default: "uploaded.csv" },
        idea: { type: "string", default: "" },
        holdout_csv_text: { type: "string" },
        holdout_filename: { type: "string", default: "holdout.csv" }
      }
    }
  },
  {
    name: "mille_search_knowledge",
    description: "Retrieve curated ML knowledge chunks used by MILLE for source-backed blueprint reasoning.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", default: "" },
        task_type: {
          type: "string",
          default: "classification",
          enum: ["classification", "regression", "forecasting", "recommendation", "clustering"]
        },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 5 }
      }
    }
  },
  {
    name: "mille_validate_contract",
    description: "Validate a MILLE blueprint or dataset profile against the public agent contracts.",
    inputSchema: {
      type: "object",
      required: ["kind", "value"],
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["blueprint", "dataset_profile"] },
        value: { type: "object" }
      }
    }
  },
  {
    name: "mille_score_blueprint",
    description: "Score a generated blueprint for agent readiness using MILLE contract, gate, data, and knowledge checks.",
    inputSchema: {
      type: "object",
      required: ["blueprint"],
      additionalProperties: false,
      properties: {
        blueprint: { type: "object" }
      }
    }
  },
  {
    name: "mille_export_project",
    description: "Generate a starter project manifest, and optionally a base64 ZIP, from a MILLE blueprint request.",
    inputSchema: {
      type: "object",
      required: ["idea"],
      additionalProperties: false,
      properties: {
        idea: { type: "string", minLength: 3 },
        task: {
          type: "string",
          default: "auto",
          enum: ["auto", "classification", "regression", "forecasting", "recommendation", "clustering"]
        },
        audience: {
          type: "string",
          default: "technical",
          enum: ["technical", "business", "executive"]
        },
        dataset_profile: { type: ["object", "null"] },
        gate_answers: agentTaskInputSchema.properties.gate_answers,
        dataset_csv: { type: "string" },
        dataset_filename: { type: "string", default: "training.csv" },
        include_zip_base64: { type: "boolean", default: false }
      }
    }
  }
];

class ToolValidationError extends Error {
  constructor(toolName, errors) {
    super(`Invalid arguments for ${toolName}: ${errors.join("; ")}`);
    this.code = -32602;
    this.data = { tool: toolName, errors };
  }
}

function okMessage(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function failMessage(id, code, message, data = undefined) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function parseArgs(args = {}) {
  return args && typeof args === "object" ? args : {};
}

function schemaTypeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  return true;
}

function validateAgainstSchema(value, schema = {}, path = "arguments", errors = []) {
  const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (allowedTypes.length && !allowedTypes.some((type) => schemaTypeMatches(value, type))) {
    errors.push(`${path} must be ${allowedTypes.join(" or ")}`);
    return errors;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of ${schema.enum.join(", ")}`);
  }

  if (typeof value === "string" && schema.minLength != null && value.length < schema.minLength) {
    errors.push(`${path} must have length >= ${schema.minLength}`);
  }

  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
  }

  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${path}[${index}]`, errors));
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties || {};
    for (const required of schema.required || []) {
      if (!(required in value)) errors.push(`${path}.${required} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path} has unexpected property ${key}`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in value) validateAgainstSchema(value[key], child, `${path}.${key}`, errors);
    }
    if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) validateAgainstSchema(value[key], schema.additionalProperties, `${path}.${key}`, errors);
      }
    }
  }
  return errors;
}

function schemaForTool(name) {
  return tools.find((tool) => tool.name === name)?.inputSchema || null;
}

function validateToolArguments(name, args) {
  const schema = schemaForTool(name);
  if (!schema) return;
  const errors = validateAgainstSchema(args, schema);
  if (errors.length) throw new ToolValidationError(name, errors);
}

function toolResult(payload, text = null) {
  const rendered = text || JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text", text: rendered }],
    structuredContent: payload
  };
}

function blockingGates(blueprint) {
  return [...(blueprint.consequences?.blocking || []), ...(blueprint.component_consequences?.blocking || [])].map(
    (gate) => ({
      id: gate.id,
      severity: gate.severity,
      message: gate.message,
      component_id: gate.component_id,
      component_name: gate.component_name
    })
  );
}

function scoreBlueprint(blueprint) {
  const contract = validateBlueprintContract(blueprint);
  const gates = blockingGates(blueprint);
  const checks = [
    { id: "contract", passed: contract.ok, weight: 35, errors: contract.errors },
    { id: "no_blocking_gates", passed: gates.length === 0, weight: 20, blocking_gates: gates },
    { id: "data_contract", passed: (blueprint.data_contract || []).length >= 3, weight: 15 },
    { id: "implementation_files", passed: Object.keys(blueprint.files || {}).length > 0, weight: 10 },
    { id: "knowledge_grounding", passed: (blueprint.retrieved_knowledge || []).length > 0, weight: 10 },
    { id: "agent_acceptance_criteria", passed: (blueprint.agent_spec?.acceptance_criteria || []).length > 0, weight: 10 }
  ];
  const score = checks.reduce((total, check) => total + (check.passed ? check.weight : 0), 0);
  return {
    score,
    max_score: 100,
    verdict: score >= 85 ? "ready" : score >= 65 ? "needs_review" : "not_ready",
    checks
  };
}

export async function callTool(name, rawArgs) {
  const args = parseArgs(rawArgs);
  validateToolArguments(name, args);
  if (name === "mille_generate_blueprint") {
    const blueprint = generateBlueprint(args);
    return toolResult({ blueprint, contract: validateBlueprintContract(blueprint) });
  }

  if (name === "mille_profile_dataset") {
    const profile = analyzeDataset({
      csvText: args.csv_text,
      filename: args.filename || "uploaded.csv",
      idea: args.idea || "",
      holdoutCsvText: args.holdout_csv_text || null,
      holdoutFilename: args.holdout_filename || "holdout.csv"
    });
    return toolResult({ profile, contract: validateDatasetProfileContract(profile) });
  }

  if (name === "mille_search_knowledge") {
    const entries = retrieveKnowledgeByKeyword({
      idea: args.query || "",
      taskType: args.task_type || "classification",
      limit: args.limit || 5
    });
    return toolResult({ entries });
  }

  if (name === "mille_validate_contract") {
    const result =
      args.kind === "blueprint" ? validateBlueprintContract(args.value) : validateDatasetProfileContract(args.value);
    return toolResult({ kind: args.kind, ...result });
  }

  if (name === "mille_score_blueprint") {
    return toolResult(scoreBlueprint(args.blueprint));
  }

  if (name === "mille_export_project") {
    const blueprint = generateBlueprint(args);
    const gates = blockingGates(blueprint);
    const files = buildProjectFiles(blueprint, {
      datasetCsv: args.dataset_csv || null,
      datasetFilename: args.dataset_filename || "training.csv"
    });
    const manifest = {
      export_allowed: gates.length === 0,
      filename: exportFilename(blueprint),
      file_count: files.length,
      blocking_gates: gates,
      files: files.map((entry) => ({ path: entry.path, bytes: entry.bytes.length }))
    };
    if (args.include_zip_base64 && gates.length === 0) {
      manifest.zip_base64 = Buffer.from(
        buildProjectZip(blueprint, {
          datasetCsv: args.dataset_csv || null,
          datasetFilename: args.dataset_filename || "training.csv"
        })
      ).toString("base64");
    }
    return toolResult(manifest);
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function handleMcpJsonRpc(message) {
  if (!message || message.jsonrpc !== "2.0") return null;
  const id = message.id;

  if (message.method === "notifications/initialized") return null;
  if (message.id === undefined) return null;

  try {
    if (message.method === "initialize") {
      return okMessage(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "mille-modelblueprint", version: "0.1.0" }
      });
    }

    if (message.method === "ping") {
      return okMessage(id, {});
    }

    if (message.method === "tools/list") {
      return okMessage(id, { tools });
    }

    if (message.method === "tools/call") {
      const params = parseArgs(message.params);
      return okMessage(id, await callTool(params.name, params.arguments));
    }

    return failMessage(id, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    return failMessage(id, error.code || -32000, error.message || "MILLE MCP tool failed.", error.data);
  }
}

function startStdioServer() {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  input.on("line", (line) => {
    if (!line.trim()) return;
    try {
      void handleMcpJsonRpc(JSON.parse(line)).then((message) => {
        if (message) write(message);
      });
    } catch (error) {
      write(failMessage(null, -32700, error.message || "Parse error"));
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startStdioServer();
}
