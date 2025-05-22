import * as https from 'https';
import { Writable } from 'stream';
import { getJinaEmbeddings } from './jina-embedder'; // Adjust path as necessary
import { getApiKey } from './providers';

// Mock the https module
jest.mock('https');
// Mock the providers module, specifically getApiKey
jest.mock('./providers', () => ({
  getApiKey: jest.fn(),
}));

describe('getJinaEmbeddings', () => {
  let mockRequest: jest.Mock;
  let mockOn: jest.Mock;
  let mockWrite: jest.Mock;
  let mockEnd: jest.Mock;
  const mockGetApiKey = getApiKey as jest.Mock;

  beforeEach(() => {
    // Reset mocks for each test
    mockWrite = jest.fn();
    mockEnd = jest.fn();
    mockOn = jest.fn();

    // Simulate the https.request call
    mockRequest = https.request as jest.Mock;
    mockRequest.mockImplementation((options, callback) => {
      // Simulate the response stream
      const res = new Writable() as any; // Using Writable to easily simulate stream events
      res.statusCode = 200;
      res.on = mockOn;
      
      // Call the callback with the fake response object
      // Use a timeout to simulate async behavior of the actual request
      setTimeout(() => callback(res), 0);

      // Simulate 'data' and 'end' events on the response
      // This will be controlled by individual tests
      
      return {
        on: mockOn, // For request error handling
        write: mockWrite,
        end: mockEnd,
      };
    });
    mockGetApiKey.mockReturnValue('test-jina-api-key'); // Default mock API key
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return embeddings on successful API call', async () => {
    const mockTexts = ['hello world', 'another text'];
    const mockApiResponse = {
      model: 'jina-embeddings-v3',
      data: [
        { object: 'embedding', embedding: [0.1, 0.2], index: 0 },
        { object: 'embedding', embedding: [0.3, 0.4], index: 1 },
      ],
      usage: { total_tokens: 5, prompt_tokens: 5 },
    };

    // Configure mock response stream behavior for this test
    mockOn.mockImplementation((event, handler) => {
      if (event === 'data') {
        handler(Buffer.from(JSON.stringify(mockApiResponse)));
      }
      if (event === 'end') {
        handler();
      }
      return this; // Return `this` to allow chaining .on calls
    });
    
    const result = await getJinaEmbeddings(mockTexts);

    expect(mockGetApiKey).toHaveBeenCalledWith('jina');
    expect(https.request).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith(JSON.stringify({
      model: 'jina-embeddings-v3',
      task: 'retrieval.passage',
      input: mockTexts,
    }));
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(result).toEqual(mockApiResponse);
  });

  it('should return null if API key is not configured', async () => {
    mockGetApiKey.mockReturnValue(null); // Simulate no API key
    const result = await getJinaEmbeddings(['test']);
    expect(result).toBeNull();
    expect(https.request).not.toHaveBeenCalled();
  });

  it('should return null on API request error (e.g., network issue)', async () => {
    // Simulate request error
    mockOn.mockImplementation((event, handler) => {
      if (event === 'error') {
        handler(new Error('Network error'));
      }
      return this;
    });

    const result = await getJinaEmbeddings(['test']);
    expect(result).toBeNull();
  });

  it('should return null if API returns non-2xx status code', async () => {
    mockRequest.mockImplementation((options, callback) => {
      const res = new Writable() as any;
      res.statusCode = 500; // Simulate server error
      res.on = mockOn;
      setTimeout(() => callback(res), 0);
      return { on: mockOn, write: mockWrite, end: mockEnd };
    });
    
    mockOn.mockImplementation((event, handler) => {
      if (event === 'data') {
        handler(Buffer.from('Server error details'));
      }
      if (event === 'end') {
        handler();
      }
      return this;
    });

    const result = await getJinaEmbeddings(['test']);
    expect(result).toBeNull();
  });

  it('should return null if API response is not valid JSON', async () => {
    mockOn.mockImplementation((event, handler) => {
      if (event === 'data') {
        handler(Buffer.from('this is not json'));
      }
      if (event === 'end') {
        handler();
      }
      return this;
    });

    const result = await getJinaEmbeddings(['test']);
    expect(result).toBeNull();
  });
});
