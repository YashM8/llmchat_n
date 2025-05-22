import * as fs from 'fs';
import * as path from 'path';

// Define a simple type for a document
export interface Document {
  [key: string]: string; // Allows arbitrary columns, e.g., { text: "...", source: "..." }
}

/**
 * Reads a TSV file and extracts documents, expecting a 'text' column.
 * @param filePath The absolute path to the TSV file.
 * @returns A Promise that resolves to an array of Document objects or null if an error occurs.
 */
export async function readTsvFile(filePath: string): Promise<Document[] | null> {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, { encoding: 'utf-8' }, (err, data) => {
      if (err) {
        console.error('Error reading TSV file:', filePath, err);
        resolve(null); // Resolve with null on file read error
        return;
      }

      try {
        const lines = data.trim().split('\n');
        if (lines.length === 0) {
          resolve([]);
          return;
        }

        const headers = lines[0].split('\t').map(header => header.trim());
        const textColumnIndex = headers.indexOf('text');

        if (textColumnIndex === -1) {
          console.error("TSV file must contain a 'text' column. Headers found:", headers);
          resolve(null);
          return;
        }

        const documents: Document[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split('\t');
          if (values.length === headers.length) {
            const doc: Document = {};
            headers.forEach((header, index) => {
              doc[header] = values[index];
            });
            // Ensure the 'text' field is present, even if it was mapped to another property
            // This is slightly redundant given the loop structure but acts as a safeguard.
            if (doc.text) {
                documents.push(doc);
            } else if (values[textColumnIndex]) {
                // If 'text' wasn't a header but we know the index
                documents.push({ ...doc, text: values[textColumnIndex]});
            }
          } else {
            console.warn(`Skipping line ${i+1} due to mismatched column count.`);
          }
        }
        resolve(documents);
      } catch (parseError) {
        console.error('Error parsing TSV data:', parseError);
        resolve(null); // Resolve with null on parsing error
      }
    });
  });
}

// Example usage (can be removed or kept for testing)
/*
async function testReadTsv() {
  // Create a dummy TSV file for testing
  const dummyTsvPath = path.join(__dirname, 'dummy_documents.tsv');
  const dummyTsvContent = "id\ttitle\ttext\n" +
                          "1\tDoc1\tThis is the first document.\n" +
                          "2\tDoc2\tThis is the second document, it has some more text.\n" +
                          "3\tDoc3\tAnother one to test with.";
  
  fs.writeFileSync(dummyTsvPath, dummyTsvContent);

  console.log('Testing TSV Reader...');
  const documents = await readTsvFile(dummyTsvPath);

  if (documents) {
    console.log('Documents read successfully:');
    documents.forEach(doc => console.log(doc));
  } else {
    console.log('Failed to read documents from TSV.');
  }

  // Clean up dummy file
  fs.unlinkSync(dummyTsvPath);
}

// To run this test:
// Ensure you are in the `packages/ai` directory or adjust paths.
// Run: ts-node document-readers.ts
// testReadTsv();
*/
