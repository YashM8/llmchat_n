import { Task, WorkflowContext } from '@repo/orchestrator';
import { WorkflowContextSchema, WorkflowEventSchema } from '../flow'; // Adjust path if necessary
import { getJinaEmbeddings } from '../../jina-embedder'; // Adjust path
import { readTsvFile, Document as DocReaderDocument } from '../../document-readers'; // Adjust path

// Define a type for retrieved documents with scores
export interface RetrievedDocument extends DocReaderDocument {
  score: number;
}

// Define the state for this task if it needs to be persisted or evented
// For now, we'll keep it simple and store results in the context.

// --- Configuration ---
// TODO: Make this configurable, perhaps via WorkflowContext or environment variable
// The path should be resolvable from the context where this task executes.
// If running from monorepo root, 'packages/ai/data/docs.tsv' might work.
// Consider using path.resolve(__dirname, '../../data/docs.tsv') if the structure is stable
// and this file is compiled to a `dist` folder within `packages/ai/workflow/tasks`.
const DEFAULT_TSV_FILE_PATH = 'packages/ai/data/docs.tsv';
const TOP_N_DOCUMENTS = 3;

/**
 * Calculates cosine similarity between two vectors.
 * @param vecA Embedding vector A.
 * @param vecB Embedding vector B.
 * @returns Cosine similarity score.
 */
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const jinaDocumentRetrievalTask: Task<WorkflowContext<WorkflowContextSchema>, WorkflowEventSchema> = {
  name: 'jina-document-retrieval',
  config: {}, // No specific config for the task itself yet
  initialState: {}, // No specific initial state for the task yet
  preconditions: async (context) => {
    // This task should run if there's a query and the necessary services are available.
    // For now, let's assume it always runs if added to a workflow.
    // We might add a flag in context like `enable_document_retrieval`.
    return context.get('question') ? true : false;
  },
  execute: async (context, _events, _config) => {
    const question = context.get('question');
    if (!question) {
      console.warn('Jina Document Retrieval: No question found in context.');
      return { nextTasks: [], status: 'COMPLETED' }; // Or 'SKIPPED'
    }

    context.updateExecutionState({
        status: 'RUNNING',
        currentTask: 'Jina Document Retrieval',
        progress: 0,
    });
    // Emit an event if the orchestrator uses them for detailed step tracking
    // events.emit('update', { step: 'jina-retrieval-started', message: 'Starting document retrieval...' });

    console.log(`Jina Document Retrieval: Processing question: "${question}"`);

    // 1. Get query embedding
    const queryEmbeddingResponse = await getJinaEmbeddings([question]);
    if (!queryEmbeddingResponse || !queryEmbeddingResponse.data || queryEmbeddingResponse.data.length === 0) {
      console.error('Jina Document Retrieval: Failed to get embedding for the query.');
      // events.emit('update', { step: 'jina-retrieval-error', message: 'Failed to embed query.' });
      context.updateExecutionState({ status: 'ERROR', error: 'Failed to embed query' });
      return { nextTasks: [], status: 'ERROR' };
    }
    const queryEmbedding = queryEmbeddingResponse.data[0].embedding;
    // events.emit('update', { step: 'jina-retrieval-query-embedded', message: 'Query embedded.' });
    context.updateExecutionState({ progress: 0.25 });


    // 2. Read documents from TSV
    // TODO: Get TSV file path from context or a more robust configuration mechanism.
    const tsvFilePath = context.get('tsv_file_path') || DEFAULT_TSV_FILE_PATH;
    const documents = await readTsvFile(tsvFilePath);

    if (!documents) {
      console.error('Jina Document Retrieval: Failed to read documents from TSV file:', tsvFilePath);
      // events.emit('update', { step: 'jina-retrieval-error', message: 'Failed to read documents.' });
      context.updateExecutionState({ status: 'ERROR', error: 'Failed to read documents' });
      return { nextTasks: [], status: 'ERROR' };
    }
    if (documents.length === 0) {
      console.warn('Jina Document Retrieval: No documents found in TSV file:', tsvFilePath);
      // events.emit('update', { step: 'jina-retrieval-nodocs', message: 'No documents found.' });
      context.set('retrieved_documents', []); // Set empty array
      return { nextTasks: [], status: 'COMPLETED' };
    }
    // events.emit('update', { step: 'jina-retrieval-docs-read', message: `Read ${documents.length} documents.` });
    context.updateExecutionState({ progress: 0.5 });

    // 3. Get document embeddings (extract 'text' field for embedding)
    const documentTexts = documents.map(doc => doc.text).filter(text => text); // Ensure text exists
    if (documentTexts.length === 0) {
        console.warn('Jina Document Retrieval: No text content found in documents to embed.');
        context.set('retrieved_documents', []);
        return { nextTasks: [], status: 'COMPLETED' };
    }
    const documentEmbeddingsResponse = await getJinaEmbeddings(documentTexts);
    if (!documentEmbeddingsResponse || !documentEmbeddingsResponse.data || documentEmbeddingsResponse.data.length === 0) {
      console.error('Jina Document Retrieval: Failed to get embeddings for the documents.');
      // events.emit('update', { step: 'jina-retrieval-error', message: 'Failed to embed documents.' });
      context.updateExecutionState({ status: 'ERROR', error: 'Failed to embed documents' });
      return { nextTasks: [], status: 'ERROR' };
    }
    const documentEmbeddings = documentEmbeddingsResponse.data.map(emb => emb.embedding);
    // events.emit('update', { step: 'jina-retrieval-docs-embedded', message: 'Documents embedded.' });
    context.updateExecutionState({ progress: 0.75 });

    // 4. Calculate similarities and find top N
    const scoredDocuments: RetrievedDocument[] = [];
    for (let i = 0; i < documentEmbeddings.length; i++) {
      // Ensure we have a corresponding original document for the embedding
      // This assumes documentEmbeddings and documents (after filtering for text) align
      if (documents[i] && documentEmbeddings[i]) {
         scoredDocuments.push({
          ...documents[i], // Spread the original document content
          score: cosineSimilarity(queryEmbedding, documentEmbeddings[i]),
        });
      }
    }

    scoredDocuments.sort((a, b) => b.score - a.score); // Sort by score descending
    const topDocuments = scoredDocuments.slice(0, TOP_N_DOCUMENTS);

    // 5. Store results in context AND emit an event
    context.set('retrieved_documents', topDocuments);
    console.log('Jina Document Retrieval: Top documents:', topDocuments.map(d => ({text: d.text.slice(0,50)+"...", score: d.score})));

    // Emit an event that stream-handlers.ts can forward to the client.
    // We'll use the 'answer' event type, but primarily populate its 'object' field.
    if (_events && typeof _events.emit === 'function') { // Renamed events to _events in execute signature
        _events.emit('answer', {
            text: '', // Main text answer will come from writerTask later
            object: topDocuments,
            objectType: 'retrieved_documents', // Custom type to identify this data on client
            status: 'PENDING', // Or 'COMPLETED' for this piece of data
        });
    } else {
        console.warn('Jina Document Retrieval: Events emitter not available or not a function.');
    }
    
    context.updateExecutionState({ status: 'COMPLETED', progress: 1 });

    return { nextTasks: [], status: 'COMPLETED' }; // Or specify next tasks
  },
  postconditions: async (context) => {
    // Check if the results were stored as expected
    return context.get('retrieved_documents') ? true : false;
  },
};

// Make sure to add this task to the WorkflowBuilder in flow.ts
// And also export it from an index.ts in the tasks directory if that's the pattern.
