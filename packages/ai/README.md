# Agentic Graph System

A flexible and powerful system for building AI agent workflows using a graph-based architecture.

## Features

- Graph-based workflow management
- Multiple specialized node types:
  - Executor Node: For task execution
  - Router Node: For intelligent routing
  - Memory Node: For state management
  - Observer Node: For monitoring and analysis
- Event-driven architecture
- Support for multiple LLM providers:
  - OpenAI
  - Anthropic
  - Together AI
- Embedding generation via Jina AI

## Getting Started

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Set up environment variables:

   - Copy `.env.example` to `.env.local`:
     ```bash
     cp .env.example .env.local
     ```
   - Fill in your API keys and preferences in `.env.local`

3. Run the customer support example:
   ```bash
   ts-node examples/customer-support-workflow.ts
   ```

## Example Usage

The customer support workflow example demonstrates how to:

1. Create a workflow with specialized nodes
2. Set up routing logic
3. Store interaction history
4. Monitor and analyze system behavior

```typescript
import { handleCustomerSupport } from './examples/customer-support-workflow';

// Handle a customer inquiry
const inquiry = "I can't log into my account";
const result = await handleCustomerSupport(inquiry);
console.log(result);
```

## Node Types

### Executor Node

- Handles specific tasks
- Processes input and generates responses
- Can be specialized for different roles

### Router Node

- Analyzes input and routes to appropriate nodes
- Uses confidence scoring
- Supports multiple routing strategies

### Memory Node

- Stores interaction history
- Manages short-term and long-term memory
- Provides context for decision-making

### Observer Node

- Monitors system behavior
- Analyzes patterns and performance
- Generates insights and recommendations

## Event System

The system provides comprehensive event handling:

- `workflow.started`
- `workflow.completed`
- `workflow.error`
- `node.processing`
- `node.processed`
- `node.error`
- And more...

## Configuration

Environment variables (see `.env.example`):

- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (default: gpt-4)
- `ANTHROPIC_API_KEY` (optional)
- `ANTHROPIC_MODEL` (optional)
- `TOGETHER_API_KEY` (optional)
- `TOGETHER_MODEL` (optional)
- `JINA_API_KEY` (optional, for document retrieval feature): Your Jina AI API key.
- `TEMPERATURE` (default: 0.7)
- `MAX_TOKENS` (default: 4000)

## Document Retrieval with Jina AI

This system can perform semantic search over a local document collection using Jina AI embeddings.

- **Document Source**: Documents are expected to be in a TSV file located at `packages/ai/data/docs.tsv`. The TSV must contain at least a 'text' column for the content to be embedded. Other columns like 'id', 'title', 'source_url' can also be included and will be returned with the retrieved documents.
- **Functionality**: When a query is processed by a workflow that includes the `jina-document-retrieval` task, the system will:
    1. Embed the user's query using Jina AI.
    2. Embed the documents from `docs.tsv` (embeddings are currently generated on first use per session/process, not persistently cached across restarts unless implemented separately).
    3. Calculate similarity between the query and document embeddings.
    4. Retrieve the top N most relevant documents.
    5. These documents are then added to the context for use by downstream LLM tasks (e.g., to help formulate an answer).
- **Configuration**: Requires `JINA_API_KEY` to be set in the environment. The default path to the TSV file is `packages/ai/data/docs.tsv` and can be configured within the `jina-document-retrieval` task or by setting `tsv_file_path` in the workflow context.

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT
