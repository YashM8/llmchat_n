import {
    createContext,
    createTypedEventEmitter,
    WorkflowBuilder,
    WorkflowConfig,
} from '@repo/orchestrator';
import { ChatMode } from '@repo/shared/config';
import { Geo } from '@vercel/functions';
import { CoreMessage } from 'ai';
import { Langfuse } from 'langfuse';
import {
    analysisTask,
    completionTask,
    modeRoutingTask,
    plannerTask,
    proSearchTask,
    quickSearchTask,
    refineQueryTask,
    reflectorTask,
    suggestionsTask,
    webSearchTask,
    writerTask,
    jinaDocumentRetrievalTask, // Added import
} from './tasks';
import { RetrievedDocument } from './tasks'; // Added import for type

type Status = 'PENDING' | 'COMPLETED' | 'ERROR' | 'HUMAN_REVIEW';

// Define the workflow schema type
export type WorkflowEventSchema = {
    steps?: Record<
        string,
        {
            id: number;
            text?: string;
            steps: Record<
                string,
                {
                    data?: any;
                    status: Status;
                }
            >;
            status: Status;
        }
    >;
    toolCalls?: any[];
    toolResults?: any[];

    answer: {
        text?: string;
        object?: any;
        objectType?: string;
        finalText?: string;
        status: Status;
    };
    sources?: {
        index: number;
        title: string;
        link: string;
    }[];
    object?: Record<string, any>;
    error?: {
        error: string;
        status: Status;
    };
    status: Status;

    suggestions?: string[];
};

// Define the context schema type
export type WorkflowContextSchema = {
    mcpConfig: Record<string, string>;
    question: string;
    search_queries: string[];
    messages: CoreMessage[];
    mode: ChatMode;
    goals: {
        id: number;
        text: string;
        final: boolean;
        status: 'PENDING' | 'COMPLETED' | 'ERROR';
    }[];
    steps: {
        type: string;
        final: boolean;
        goalId: number;
        queries?: string[];
        results?: {
            title: string;
            link: string;
        }[];
    }[];
    webSearch: boolean;
    queries: string[];
    summaries: string[];
    gl?: Geo;
    sources: {
        index: number;
        title: string;
        link: string;
    }[];
    answer: string | undefined;
    threadId: string;
    threadItemId: string;
    showSuggestions: boolean;
    customInstructions?: string;
    onFinish: (data: any) => void;
    retrieved_documents?: RetrievedDocument[]; // <<< ADDED
    tsv_file_path?: string;                   // <<< ADDED
};

export const runWorkflow = ({
    mcpConfig = {},
    mode,
    question,
    threadId,
    threadItemId,
    messages,
    config = {},
    signal,
    webSearch = false,
    showSuggestions = false,
    onFinish,
    customInstructions,
    gl,
}: {
    mcpConfig: Record<string, string>;
    mode: ChatMode;
    question: string;
    threadId: string;
    threadItemId: string;
    messages: CoreMessage[];
    config?: WorkflowConfig;
    signal?: AbortSignal;
    webSearch?: boolean;
    showSuggestions?: boolean;
    onFinish?: (data: any) => void;
    gl?: Geo;
    customInstructions?: string;
}) => {
    const langfuse = new Langfuse();
    const trace = langfuse.trace({
        name: 'deep-research-workflow',
    });

    // Set default values for config
    const workflowConfig: WorkflowConfig = {
        maxIterations: 2,
        timeoutMs: 480000, // Add default timeout of
        ...config,
    };

    // Create typed event emitter with the proper type
    const events = createTypedEventEmitter<WorkflowEventSchema>({
        steps: {},
        toolCalls: [],
        toolResults: [],
        answer: {
            text: '',

            status: 'PENDING',
        },
        sources: [],
        suggestions: [],
        object: {},
        error: {
            error: '',
            status: 'PENDING',
        },
        status: 'PENDING',
    });

    const context = createContext<WorkflowContextSchema>({
        mcpConfig,
        question,
        mode,
        webSearch,
        search_queries: [],
        messages: messages as any,
        goals: [],
        queries: [],
        steps: [],
        gl,
        customInstructions,
        sources: [],
        summaries: [],
        answer: undefined,
        threadId,
        threadItemId,
        showSuggestions,
        onFinish: onFinish as any,
    });

    // Use the typed builder
    const builder = new WorkflowBuilder(threadId, {
        trace,
        initialEventState: events.getAllState(),
        events,
        context,
        config: workflowConfig,
        signal,
    });

    builder.addTasks([
        plannerTask,
        refineQueryTask, 
        jinaDocumentRetrievalTask, // <<< ADD NEW TASK HERE
        webSearchTask, 
        reflectorTask, // webSearchTask was here, reflectorTask is after writerTask in original
        analysisTask,
        writerTask,
        // reflectorTask, // Moved reflectorTask after writerTask as in original
        modeRoutingTask,
        completionTask,
        suggestionsTask,
        quickSearchTask,
        proSearchTask,
    ]);

    return builder.build();
};
