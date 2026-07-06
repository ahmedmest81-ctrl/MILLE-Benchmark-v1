#!/usr/bin/env node
import { resolve } from "node:path";

import {
  defaultOutputDir,
  defaultRecordsPath,
  readJsonl,
  runBenchmark,
  writeBenchmarkOutputs
} from "./mille-benchmark-core.mjs";

function parseArgs(argv) {
  const args = {
    input: defaultRecordsPath(),
    outputDir: defaultOutputDir(),
    provider: "local-engine",
    failOnGate: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      args.input = resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--out-dir") {
      args.outputDir = resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--provider") {
      args.provider = argv[index + 1];
      index += 1;
    } else if (arg === "--no-fail") {
      args.failOnGate = false;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/run-mille-benchmark.mjs [options]",
    "",
    "Options:",
    "  --input <path>      JSONL benchmark records path",
    "  --out-dir <path>    Directory for results.json and report.md",
    "  --provider <name>   Benchmark provider, currently local-engine",
    "  --no-fail           Always exit 0 after writing reports",
    "  --help              Show this message"
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}

const records = readJsonl(args.input);
const run = runBenchmark(records, { provider: args.provider });
const outputs = writeBenchmarkOutputs(run, args.outputDir);

console.log(
  JSON.stringify(
    {
      provider: run.provider,
      records: records.length,
      passed: run.summary.passed,
      metrics: run.summary.metrics,
      outputs
    },
    null,
    2
  )
);

if (!run.summary.passed && args.failOnGate) {
  process.exitCode = 1;
}
