import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { KNOWLEDGE_BASE, retrieveKnowledgeByKeyword } from "./knowledge-base.mjs";
import { createEmbedding, hasOpenAIKey } from "./openai-embeddings.mjs";

const INDEX_URL = new URL("./embeddings/knowledge-index.json", import.meta.url);
const INDEX_PATH = fileURLToPath(INDEX_URL);

let cachedIndex = null;

function loadIndex() {
  if (cachedIndex) return cachedIndex;
  if (!existsSync(INDEX_PATH)) return null;
  cachedIndex = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  return cachedIndex;
}

function dot(left, right) {
  let total = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

function magnitude(vector) {
  return Math.sqrt(dot(vector, vector));
}

function cosineSimilarity(left, right) {
  const denominator = magnitude(left) * magnitude(right);
  return denominator === 0 ? 0 : dot(left, right) / denominator;
}

function keywordMap({ idea, taskType }) {
  return new Map(
    retrieveKnowledgeByKeyword({ idea, taskType, limit: KNOWLEDGE_BASE.length }).map((entry) => [
      entry.id,
      entry.keyword_score || 0
    ])
  );
}

function keywordFallback({ idea, taskType, limit, reason }) {
  return retrieveKnowledgeByKeyword({ idea, taskType, limit }).map((entry) => ({
    ...entry,
    retrieval_method: reason ? "keyword_fallback" : "keyword",
    retrieval_warning: reason
  }));
}

export function embeddingIndexStatus() {
  const index = loadIndex();
  return {
    available: Boolean(index),
    path: INDEX_PATH,
    model: index?.model || null,
    chunks: index?.chunks?.length || 0,
    openai_key_available: hasOpenAIKey()
  };
}

export async function retrieveKnowledgeSemantic({ idea = "", taskType = "classification", limit = 5 } = {}) {
  const index = loadIndex();
  if (!index) {
    return keywordFallback({ idea, taskType, limit, reason: "No embeddings index found. Run scripts/index-knowledge.mjs." });
  }

  if (!hasOpenAIKey()) {
    return keywordFallback({ idea, taskType, limit, reason: "OPENAI_API_KEY is not set; semantic query embedding skipped." });
  }

  try {
    const queryEmbedding = await createEmbedding(`Idea: ${idea}\nTask type: ${taskType}`, { model: index.model });
    const keywords = keywordMap({ idea, taskType });
    const vectorById = new Map(index.chunks.map((chunk) => [chunk.id, chunk.embedding]));

    return KNOWLEDGE_BASE.map((entry) => {
      const semanticScore = vectorById.has(entry.id)
        ? cosineSimilarity(queryEmbedding, vectorById.get(entry.id))
        : 0;
      const keywordScore = keywords.get(entry.id) || 0;
      const taskBoost = entry.task_tags.includes(taskType) ? 0.08 : 0;
      const combinedScore = semanticScore + taskBoost + keywordScore / 100;

      return {
        ...entry,
        relevance: Number((combinedScore * 100).toFixed(2)),
        keyword_score: keywordScore,
        semantic_score: Number(semanticScore.toFixed(4)),
        retrieval_method: "semantic"
      };
    })
      .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title))
      .slice(0, limit);
  } catch (error) {
    return keywordFallback({ idea, taskType, limit, reason: error.message });
  }
}
