const DEFAULT_MODEL = "text-embedding-3-small";
const EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function createEmbeddings(inputs, { model = DEFAULT_MODEL } = {}) {
  if (!hasOpenAIKey()) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const response = await fetch(EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      input: inputs,
      model
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI embeddings request failed.");
  }

  return payload.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

export async function createEmbedding(input, options) {
  const [embedding] = await createEmbeddings([input], options);
  return embedding;
}

export { DEFAULT_MODEL as DEFAULT_EMBEDDING_MODEL };
