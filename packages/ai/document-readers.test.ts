import * as fs from 'fs'; // Use 'node:fs' for newer Node versions if preferred
import { readTsvFile, Document } from './document-readers'; // Adjust path as necessary

// Mock the fs module
jest.mock('fs');

describe('readTsvFile', () => {
  const mockReadFile = fs.readFile as jest.Mock;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should read and parse a valid TSV file correctly', async () => {
    const filePath = 'dummy.tsv';
    const mockTsvContent = 'id\ttitle\ttext\n' +
                           '1\tDoc1\tHello world\n' +
                           '2\tDoc2\tAnother document';
    
    mockReadFile.mockImplementation((path, options, callback) => {
      if (path === filePath) {
        callback(null, Buffer.from(mockTsvContent));
      } else {
        callback(new Error('File not found'));
      }
    });

    const expectedDocuments: Document[] = [
      { id: '1', title: 'Doc1', text: 'Hello world' },
      { id: '2', title: 'Doc2', text: 'Another document' },
    ];

    const result = await readTsvFile(filePath);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, { encoding: 'utf-8' }, expect.any(Function));
    expect(result).toEqual(expectedDocuments);
  });

  it("should return null if the 'text' column is missing", async () => {
    const filePath = 'no_text_column.tsv';
    const mockTsvContent = 'id\ttitle\tsummary\n1\tDoc1\tSome summary';
    
    mockReadFile.mockImplementation((path, options, callback) => {
      callback(null, Buffer.from(mockTsvContent));
    });

    const result = await readTsvFile(filePath);
    expect(result).toBeNull();
  });

  it('should return an empty array for an empty TSV file (only headers)', async () => {
    const filePath = 'empty.tsv';
    const mockTsvContent = 'id\ttitle\ttext'; // Only headers
    
    mockReadFile.mockImplementation((path, options, callback) => {
      callback(null, Buffer.from(mockTsvContent));
    });

    const result = await readTsvFile(filePath);
    expect(result).toEqual([]);
  });
  
  it('should return an empty array for a TSV file with no lines', async () => {
    const filePath = 'no_lines.tsv';
    const mockTsvContent = ''; // Completely empty
    
    mockReadFile.mockImplementation((path, options, callback) => {
      callback(null, Buffer.from(mockTsvContent));
    });

    const result = await readTsvFile(filePath);
    expect(result).toEqual([]);
  });

  it('should handle TSV files with trailing newlines', async () => {
    const filePath = 'trailing_newline.tsv';
    const mockTsvContent = 'text\nFirst doc\nSecond doc\n\n'; // Extra newlines
    
    mockReadFile.mockImplementation((path, options, callback) => {
      callback(null, Buffer.from(mockTsvContent));
    });
    
    const expectedDocuments: Document[] = [
        { text: 'First doc' },
        { text: 'Second doc' },
    ];

    const result = await readTsvFile(filePath);
    expect(result).toEqual(expectedDocuments);
  });


  it('should return null on file read error', async () => {
    const filePath = 'error.tsv';
    mockReadFile.mockImplementation((path, options, callback) => {
      callback(new Error('Read error'), null);
    });

    const result = await readTsvFile(filePath);
    expect(result).toBeNull();
  });

  it('should return null on TSV parsing error (e.g., unexpected structure)', async () => {
    const filePath = 'parse_error.tsv';
    // Simulate content that might cause a parsing error if not robustly handled,
    // though our current simple parser is quite lenient.
    // For a truly robust test, you might need more complex content or error simulation.
    // Here, we can simulate an error during the split operations by making data null.
     mockReadFile.mockImplementation((path, options, callback) => {
      // This will cause error when doing data.trim()
      callback(null, null as any); 
    });
    const result = await readTsvFile(filePath);
    expect(result).toBeNull();
  });
  
  it('should correctly parse documents with varying numbers of columns, prioritizing headers', async () => {
    const filePath = 'varied_columns.tsv';
    const mockTsvContent = 
      'id\ttext\tauthor\n' + // Headers
      '1\tText1\tAuthor1\n' + // Matches headers
      '2\tText2\n' +           // Fewer columns than headers
      '3\tText3\tAuthor3\tExtraColumnData'; // More columns than headers
    
    mockReadFile.mockImplementation((path, options, callback) => {
      callback(null, Buffer.from(mockTsvContent));
    });

    const result = await readTsvFile(filePath);
    
    // Line 2 (id=2) will be skipped due to column mismatch if strict,
    // or text might be undefined if not handled.
    // Our current implementation logs a warning and skips.
    // Line 3 (id=3) will only include fields matching headers.
    const expectedDocuments: Document[] = [
      { id: '1', text: 'Text1', author: 'Author1' },
      // Line with id '2' is skipped by the implementation due to mismatched columns
      // Line with id '3' will have its extra column ignored
      { id: '3', text: 'Text3', author: 'Author3' }, 
    ];
    
    // Filter out any undefined results from the actual processing if lines are skipped
    const filteredResult = result?.filter(doc => doc !== null && doc !== undefined) || [];

    expect(filteredResult).toEqual(expectedDocuments);
  });
});
