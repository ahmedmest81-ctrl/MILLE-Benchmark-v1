# MILLE Agent Integration

MILLE is now shaped for three surfaces:

- Hugging Face Space for the browser UI.
- MCP stdio server for agents.
- Hugging Face Dataset records for evals and adoption proof.

## MCP Server

Run the local MCP server:

```powershell
node mcp-server.mjs
```

The server uses newline-delimited JSON-RPC over stdio and exposes:

- `mille_generate_blueprint`
- `mille_profile_dataset`
- `mille_search_knowledge`
- `mille_validate_contract`
- `mille_score_blueprint`
- `mille_export_project`

The public contracts live in `schemas/`:

- `schemas/mille-agent-task.schema.json`
- `schemas/mille-blueprint.schema.json`
- `schemas/mille-dataset-profile.schema.json`
- `schemas/mille-eval-record.schema.json`

## Dataset Plan

Create a Hugging Face dataset with JSONL records that follow `schemas/mille-eval-record.schema.json`.
Each record should include:

- `id`
- `prompt`
- `task`
- `input_schema`
- `expected_blueprint`
- `rubric`
- `failure_modes`

Start with 20-50 high-quality examples covering fraud, churn, hospital operations, revenue forecasting, recommendations, logistics, and multi-component systems.
