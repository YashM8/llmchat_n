import * as https from 'https';
import { getApiKey } from './providers'; // Assuming getApiKey can be used for 'jina'

// Define types for the Jina API request and response
interface JinaEmbeddingRequest {
  model: string;
  task: string;
  input: string[];
}

interface JinaEmbedding {
  object: string;
  embedding: number[];
  index: number;
}

interface JinaUsage {
  total_tokens: number;
  prompt_tokens: number;
}

interface JinaEmbeddingResponse {
  model: string;
  data: JinaEmbedding[];
  usage: JinaUsage;
}

/**
 * Calls the Jina AI Embeddings API to get embeddings for the given texts.
 * @param texts An array of strings to embed.
 * @returns A Promise that resolves to the Jina API response or null if an error occurs.
 */
export async function getJinaEmbeddings(texts: string[]): Promise<JinaEmbeddingResponse | null> {
  const apiKey = getApiKey('jina'); // Fetches JINA_API_KEY

  if (!apiKey) {
    console.error('Jina API key is not configured.');
    return null;
  }

  const data = JSON.stringify({
    model: 'jina-embeddings-v3', // As specified in the issue, make this configurable if needed later
    task: 'retrieval.passage', // As specified in the issue
    input: texts,
  });

  const options = {
    hostname: 'api.jina.ai',
    port: 443,
    path: '/v1/embeddings',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(data), // Use Buffer.byteLength for accurate length
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            const parsedResponse: JinaEmbeddingResponse = JSON.parse(responseData);
            resolve(parsedResponse);
          } else {
            console.error(`Jina API request failed with status ${res.statusCode}:`, responseData);
            resolve(null); // Resolve with null on API error status
          }
        } catch (error) {
          console.error('Error parsing Jina API response:', error);
          resolve(null); // Resolve with null on parsing error
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error with Jina API request:', error);
      resolve(null); // Resolve with null on request error
    });

    // Write the data to the request body
    req.write(data);
    req.end();
  });
}

// Example usage (can be removed or kept for testing)
/*
async function testGetEmbeddings() {
  console.log('Testing Jina Embeddings...');
  // Ensure JINA_API_KEY is set in your environment if running this directly
  const embeddings = await getJinaEmbeddings([
    "Organic skincare for sensitive skin with aloe vera and chamomile: Imagine the soothing embrace of nature with our organic skincare range, crafted specifically for sensitive skin. Infused with the calming properties of aloe vera and chamomile, each product provides gentle nourishment and protection. Say goodbye to irritation and hello to a glowing, healthy complexion."
  ]);

  if (embeddings && embeddings.data && embeddings.data.length > 0) {
    console.log('Embeddings retrieved successfully:');
    console.log(JSON.stringify(embeddings.data[0].embedding.slice(0, 10), null, 2) + '... (first 10 dimensions)');
    console.log('Total tokens:', embeddings.usage.total_tokens);
  } else {
    console.log('Failed to retrieve embeddings.');
  }
}

// To run this test, you would typically execute this file with ts-node,
// e.g., from the root: `ts-node packages/ai/jina-embedder.ts`
// Make sure JINA_API_KEY is available in the environment for the test.
// testGetEmbeddings();
*/
