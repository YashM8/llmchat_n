import { jinaDocumentRetrievalTask, RetrievedDocument } from './jina-document-retrieval'; // Adjust path
import { getJinaEmbeddings } from '../../jina-embedder'; // Adjust path
import { readTsvFile, Document as DocReaderDocument } from '../../document-readers'; // Adjust path
import { createContext, WorkflowContext } from '@repo/orchestrator'; // Assuming these are needed for context
import { WorkflowContextSchema, WorkflowEventSchema } from '../flow'; // Adjust path
import { TypedEventEmitter } from '@repo/orchestrator/dist/events'; // Or actual path to TypedEventEmitter

// Mock dependencies
jest.mock('../../jina-embedder');
jest.mock('../../document-readers');

describe('jinaDocumentRetrievalTask', () => {
  const mockGetJinaEmbeddings = getJinaEmbeddings as jest.Mock;
  const mockReadTsvFile = readTsvFile as jest.Mock;
  let mockContext: WorkflowContext<WorkflowContextSchema>;
  let mockEvents: jest.Mocked<TypedEventEmitter<WorkflowEventSchema>>;


  beforeEach(() => {
    // Reset mocks
    mockGetJinaEmbeddings.mockReset();
    mockReadTsvFile.mockReset();

    // Mock context
    // Create a simplified mock context for testing.
    // You might need to expand this if the task relies on more context fields.
    const initialContextData: Partial<WorkflowContextSchema> = {
      question: 'What is AI?',
      // tsv_file_path can be omitted to test default path usage if needed
    };
    mockContext = createContext<WorkflowContextSchema>(initialContextData as WorkflowContextSchema);
    
    // If the real createContext is complex or has side effects, you might need a more custom mock:
    // mockContext = {
    //   get: jest.fn((key) => initialContextData[key]),
    //   set: jest.fn(),
    //   getAll: jest.fn(() => initialContextData),
    //   update: jest.fn(),
    //   updateExecutionState: jest.fn(),
    //   // ... any other methods used by the task
    // } as unknown as WorkflowContext<WorkflowContextSchema>;


    // Mock events emitter
    mockEvents = {
      emit: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      once: jest.fn(),
      onAll: jest.fn(),
      offAll: jest.fn(),
      getAllState: jest.fn(),
      removeAllListeners: jest.fn(),
      listenerCount: jest.fn(),
      listeners: jest.fn(),
      rawListeners: jest.fn(),
      prependListener: jest.fn(),
      prependOnceListener: jest.fn(),
    } as unknown as jest.Mocked<TypedEventEmitter<WorkflowEventSchema>>;

  });

  it('should successfully retrieve and rank documents', async () => {
    const question = 'Tell me about AI ethics.';
    mockContext.set('question', question);

    const mockQueryEmbedding = {
      model: 'jina-v3', data: [{ embedding: [1, 0, 0], index: 0 }], usage: { total_tokens: 1 }
    };
    const mockDocumentEmbeddings = {
      model: 'jina-v3',
      data: [
        { embedding: [0.9, 0.1, 0], index: 0 }, // High similarity to query [1,0,0]
        { embedding: [0, 1, 0], index: 1 },   // Low similarity
        { embedding: [0.8, 0.2, 0], index: 2 }, // Medium similarity
        { embedding: [0.95, 0.05, 0], index: 3 } // Highest similarity
      ],
      usage: { total_tokens: 4 }
    };
    mockGetJinaEmbeddings
      .mockResolvedValueOnce(mockQueryEmbedding)
      .mockResolvedValueOnce(mockDocumentEmbeddings);

    const mockDocuments: DocReaderDocument[] = [
      { text: 'AI ethics explained simply.' },
      { text: 'A history of machine learning.' },
      { text: 'The impact of AI on society.' },
      { text: 'Deep dive into AI ethics considerations.' },
    ];
    mockReadTsvFile.mockResolvedValue(mockDocuments);
    
    // Call the task's execute function
    // The actual DEFAULT_TSV_FILE_PATH will be used from the module
    const result = await jinaDocumentRetrievalTask.execute(mockContext, mockEvents, {});

    expect(mockReadTsvFile).toHaveBeenCalledWith('packages/ai/data/docs.tsv'); // Or the actual default path
    expect(mockGetJinaEmbeddings).toHaveBeenCalledWith([question]);
    expect(mockGetJinaEmbeddings).toHaveBeenCalledWith(mockDocuments.map(d => d.text));
    
    const retrievedDocs = mockContext.get('retrieved_documents') as RetrievedDocument[] | undefined;
    expect(retrievedDocs).toBeDefined();
    expect(retrievedDocs?.length).toBe(3); // TOP_N_DOCUMENTS is 3

    // Check if documents are sorted by score (highest first)
    expect(retrievedDocs?.[0].text).toBe('Deep dive into AI ethics considerations.'); // Highest score: [0.95, ...]
    expect(retrievedDocs?.[1].text).toBe('AI ethics explained simply.');      // Next score: [0.9, ...]
    expect(retrievedDocs?.[2].text).toBe('The impact of AI on society.');     // Next score: [0.8, ...]
    
    expect(retrievedDocs?.[0].score).toBeCloseTo(0.95); // Approx based on [1,0,0] vs [0.95,0.05,0]
    expect(retrievedDocs?.[1].score).toBeCloseTo(0.9);
    expect(retrievedDocs?.[2].score).toBeCloseTo(0.8);

    // Check if event was emitted
    expect(mockEvents.emit).toHaveBeenCalledWith('answer', {
        text: '',
        object: retrievedDocs, // The actual retrieved documents
        objectType: 'retrieved_documents',
        status: 'PENDING',
    });
    expect(result.status).toBe('COMPLETED');
  });

  it('should handle failure in query embedding', async () => {
    mockGetJinaEmbeddings.mockResolvedValueOnce(null); // Simulate failure
    mockReadTsvFile.mockResolvedValue([{ text: 'doc1' }]);

    const result = await jinaDocumentRetrievalTask.execute(mockContext, mockEvents, {});
    expect(result.status).toBe('ERROR');
    expect(mockContext.get('retrieved_documents')).toBeUndefined();
  });

  it('should handle failure in document reading', async () => {
    mockReadTsvFile.mockResolvedValue(null); // Simulate failure
    
    const result = await jinaDocumentRetrievalTask.execute(mockContext, mockEvents, {});
    expect(result.status).toBe('ERROR');
    expect(mockContext.get('retrieved_documents')).toBeUndefined();
  });
  
  it('should handle no documents found in TSV', async () => {
    mockReadTsvFile.mockResolvedValue([]); // No documents
    mockGetJinaEmbeddings.mockResolvedValueOnce({ data: [{ embedding: [1,0,0] }] } as any); // Query embedding success

    const result = await jinaDocumentRetrievalTask.execute(mockContext, mockEvents, {});
    expect(result.status).toBe('COMPLETED');
    expect(mockContext.get('retrieved_documents')).toEqual([]);
    expect(mockEvents.emit).toHaveBeenCalledWith('answer', expect.objectContaining({ object: [] }));
  });

  it('should handle failure in document embedding', async () => {
    mockGetJinaEmbeddings
      .mockResolvedValueOnce({ data: [{ embedding: [1,0,0] }] } as any) // Query embedding success
      .mockResolvedValueOnce(null); // Document embeddings fail
    mockReadTsvFile.mockResolvedValue([{ text: 'doc1' }, { text: 'doc2' }]);

    const result = await jinaDocumentRetrievalTask.execute(mockContext, mockEvents, {});
    expect(result.status).toBe('ERROR');
    expect(mockContext.get('retrieved_documents')).toBeUndefined();
  });
  
  it('should skip if no question is in context', async () => {
    mockContext.set('question', undefined as any); // No question
    const result = await jinaDocumentRetrievalTask.execute(mockContext, mockEvents, {});
    expect(result.status).toBe('COMPLETED'); // Or 'SKIPPED' if task has such a status
    expect(mockReadTsvFile).not.toHaveBeenCalled();
    expect(mockGetJinaEmbeddings).not.toHaveBeenCalled();
  });
});
