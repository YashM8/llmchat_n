import { createTask } from '@repo/orchestrator';
import { format } from 'date-fns';
import { ModelEnum } from '../../models';
import { WorkflowContextSchema, WorkflowEventSchema } from '../flow';
import { ChunkBuffer, generateText, handleError, sendEvents } from '../utils';
import { RetrievedDocument } from './index'; // Assuming it's exported from tasks/index.ts

export const writerTask = createTask<WorkflowEventSchema, WorkflowContextSchema>({
    name: 'writer',
    execute: async ({ trace, events, context, data, signal }) => {
        const analysis = data?.analysis || '';

        const question = context?.get('question') || '';
        const summaries = context?.get('summaries') || [];
        const messages = context?.get('messages') || [];
        const retrieved_documents = context?.get('retrieved_documents') as RetrievedDocument[] | undefined;

        let retrievedContext = '';
        if (retrieved_documents && retrieved_documents.length > 0) {
          retrievedContext = retrieved_documents
            .map(doc => `Document (Score: ${doc.score.toFixed(4)}):
${doc.text}
---`)
            .join('\n\n');
        }

        const { updateStep, nextStepId, updateAnswer, updateStatus } = sendEvents(events);
        const stepId = nextStepId();

        const currentDate = new Date();
        const humanizedDate = format(currentDate, 'MMMM dd, yyyy, h:mm a');

        const prompt = `

    Today is ${humanizedDate}.
You are a Comprehensive Research Writer tasked with providing an extremely detailed and thorough writing about "${question}".
Your goal is to create a comprehensive report based on the research information provided, including any directly retrieved documents that seem relevant to the user's query.

First, carefully read and analyze the following information:

<retrieved_document_context>
${retrievedContext ? retrievedContext : "No directly retrieved documents were found for this query."}
</retrieved_document_context>

<research_findings>
${summaries.map(summary => `<finding>${summary}</finding>`).join('\n')}
</research_findings>

<analysis>
${analysis}
</analysis>

## Report Requirements:
1. Structure and Organization:
   - Begin with a concise executive summary highlighting key developments.
   - **Prioritize information from the <retrieved_document_context> if available and relevant to the query "${question}".**
   - Organize content thematically with clear progression between topics, Group related information into coherent categories
   - Use a consistent hierarchical structure throughout
   - Conclude with analytical insights identifying patterns, implications, and future directions

2. Content and Analysis:
   - Provide specific details, data points, and technical information where relevant
   - Analyze the significance of key findings within the broader context
   - Make connections between related information across different sources
   - Maintain an objective, analytical tone throughout


3. Formatting Standards:
   - Highlight key figures, critical statistics, and significant findings with bold text
   - Construct balanced continuous paragraphs (4-5 sentences per paragraph not more than that) with logical flow instead of shorter sentences.
   - Use headings strategically only for thematic shifts depending on the question asked and content
   - Use lists, tables, links, images when appropriate
   - use bold text for key points
   - Implement markdown tables for comparative data where appropriate
   - Ensure proper spacing between sections for optimal readability

4. Citations:
   - Based on provided references in each findings, you must cite the sources in the report.
   - Use inline citations like [1] to reference the source
   - For example: According to recent findings [1][3], progress in this area has accelerated
   - When information appears in multiple findings, cite all relevant findings using multiple numbers
   - Integrate citations naturally without disrupting reading flow

Note: **Reference list at the end is not required.**


Your report should demonstrate subject matter expertise while remaining intellectually accessible to informed professionals. Focus on providing substantive analysis rather than cataloging facts. Emphasize implications and significance rather than merely summarizing information. **If context from <retrieved_document_context> is available, ensure your report directly addresses the user's query "${question}" using this context first and foremost.**
    `;

        if (stepId) {
            updateStep({
                stepId: stepId + 1,
                stepStatus: 'COMPLETED',
                subSteps: {
                    wrapup: { status: 'COMPLETED' },
                },
            });
        }
        const chunkBuffer = new ChunkBuffer({
            threshold: 150,
            breakOn: ['\n\n', '.', '!', '?'],
            onFlush: (text: string) => {
                updateAnswer({
                    text,
                    status: 'PENDING',
                });
            },
        });

        const answer = await generateText({
            prompt,
            model: ModelEnum.Claude_3_7_Sonnet,
            messages,
            signal,
            onChunk: (chunk, fullText) => {
                chunkBuffer.add(chunk);
            },
        });

        // Make sure to flush any remaining content
        chunkBuffer.flush();

        updateAnswer({
            text: '',
            finalText: answer,
            status: 'COMPLETED',
        });

        context?.get('onFinish')?.({
            answer,
            threadId: context?.get('threadId'),
            threadItemId: context?.get('threadItemId'),
        });

        updateStatus('COMPLETED');

        trace?.span({
            name: 'writer',
            input: prompt,
            output: answer,
            metadata: context?.getAll(),
        });
        context?.update('answer', _ => answer);

        return answer;
    },
    onError: handleError,
    route: ({ result, context }) => {
        if (context?.get('showSuggestions') && !!context?.get('answer')) {
            return 'suggestions';
        }
        return 'end';
    },
});
