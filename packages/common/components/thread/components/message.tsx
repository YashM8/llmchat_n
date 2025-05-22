import { ChatEditor, markdownStyles } from '@repo/common/components';
import { useAgentStream, useChatEditor, useCopyText } from '@repo/common/hooks';
import { useChatStore } from '@repo/common/store';
import { ThreadItem } from '@repo/shared/types'; // Assuming ThreadItem has answer.object and answer.objectType
import { Button, cn } from '@repo/ui';
import { IconCheck, IconCopy, IconPencil } from '@tabler/icons-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageMessage } from './image-message';
// Local interface for retrieved documents
interface DisplayRetrievedDocument {
  text: string;
  score: number;
  // Add any other fields from the original DocReaderDocument if they are needed for display
  // For example, if there was a 'title' or 'source_url' in your TSV.
}

type MessageProps = {
    message: string;
    imageAttachment?: string;
    threadItem: ThreadItem;
};

export const Message = memo(({ message, imageAttachment, threadItem }: MessageProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const messageRef = useRef<HTMLDivElement>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [showExpandButton, setShowExpandButton] = useState(false);
    const { copyToClipboard, status } = useCopyText();
    const maxHeight = 120;
    const isGenerating = useChatStore(state => state.isGenerating);
    useEffect(() => {
        if (messageRef.current) {
            setShowExpandButton(messageRef.current.scrollHeight > maxHeight);
        }
    }, [message]);

    const handleCopy = useCallback(() => {
        if (messageRef.current) {
            copyToClipboard(messageRef.current);
        }
    }, [copyToClipboard]);

    const toggleExpand = useCallback(() => setIsExpanded(prev => !prev), []);

    return (
        <div className="flex w-full flex-col items-end gap-2 pt-4">
            {imageAttachment && <ImageMessage imageAttachment={imageAttachment} />}
            <div
                className={cn(
                    'text-foreground bg-tertiary group relative max-w-[80%] overflow-hidden rounded-lg',
                    isEditing && 'border-hard'
                )}
            >
                {!isEditing && (
                    <>
                        <div
                            ref={messageRef}
                            className={cn('prose-sm relative px-3 py-1.5 font-normal', {
                                'pb-12': isExpanded,
                                markdownStyles,
                            })}
                            style={{
                                maxHeight: isExpanded ? 'none' : maxHeight,
                                transition: 'max-height 0.3s ease-in-out',
                            }}
                        >
                            {message}
                        </div>
                        <div
                            className={cn(
                                'absolute bottom-0 left-0 right-0 hidden flex-col items-center  group-hover:flex',
                                showExpandButton && 'flex'
                            )}
                        >
                            <div className="via-tertiary/85 to-tertiary flex w-full items-center justify-end gap-1 bg-gradient-to-b from-transparent p-1.5">
                                {showExpandButton && (
                                    <Button
                                        variant="secondary"
                                        size="xs"
                                        rounded="full"
                                        className="pointer-events-auto relative z-10 px-4"
                                        onClick={toggleExpand}
                                    >
                                        {isExpanded ? 'Show less' : 'Show more'}
                                    </Button>
                                )}
                                <Button
                                    variant="bordered"
                                    size="icon-sm"
                                    onClick={handleCopy}
                                    tooltip={status === 'copied' ? 'Copied' : 'Copy'}
                                >
                                    {status === 'copied' ? (
                                        <IconCheck size={14} strokeWidth={2} />
                                    ) : (
                                        <IconCopy size={14} strokeWidth={2} />
                                    )}
                                </Button>
                                <Button
                                    disabled={
                                        isGenerating ||
                                        threadItem.status === 'QUEUED' ||
                                        threadItem.status === 'PENDING'
                                    }
                                    variant="bordered"
                                    size="icon-sm"
                                    tooltip="Edit"
                                    onClick={() => setIsEditing(true)}
                                >
                                    <IconPencil size={14} strokeWidth={2} />
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                {isEditing && (
                    <EditMessage
                        width={messageRef.current?.offsetWidth}
                        message={message}
                        threadItem={threadItem}
                        onCancel={() => {
                            setIsEditing(false);
                        }}
                    />
                )}
            </div>
            {/* Display Retrieved Documents if available */}
            {threadItem.role === 'assistant' && threadItem.answer?.objectType === 'retrieved_documents' && threadItem.answer?.object && (
              <div className="retrieved-documents-container mt-3 w-full max-w-[80%] self-end rounded-lg border bg-muted/30 p-3">
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Retrieved Context:</h4>
                <ul className="space-y-2">
                  {(threadItem.answer.object as DisplayRetrievedDocument[]).map((doc, index) => (
                    <li key={index} className="text-xs rounded-md border bg-background p-2 shadow-sm">
                      <p className="font-medium text-muted-foreground">Score: <span className="font-normal text-foreground">{doc.score.toFixed(4)}</span></p>
                      <p className="text-muted-foreground line-clamp-3">{doc.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
    );
});

export type TEditMessage = {
    message: string;
    onCancel: () => void;
    threadItem: ThreadItem;
    width?: number;
};

export const EditMessage = memo(({ message, onCancel, threadItem, width }: TEditMessage) => {
    const { handleSubmit } = useAgentStream();
    const removeFollowupThreadItems = useChatStore(state => state.removeFollowupThreadItems);
    const getThreadItems = useChatStore(state => state.getThreadItems);

    const { editor } = useChatEditor({
        defaultContent: message,
    });

    const handleSave = async (query: string) => {
        if (!query.trim()) {
            toast.error('Please enter a message');
            return;
        }
        removeFollowupThreadItems(threadItem.id);

        const formData = new FormData();
        formData.append('query', query);
        formData.append('imageAttachment', threadItem.imageAttachment || '');
        const threadItems = await getThreadItems(threadItem.threadId);

        handleSubmit({
            formData,
            existingThreadItemId: threadItem.id,
            messages: threadItems,
            newChatMode: threadItem.mode,
            useWebSearch: false, //
        });
    };

    return (
        <div className="relative flex max-w-full flex-col items-end gap-2">
            <div
                className={cn(' relative px-3 py-0 text-base font-normal', {})}
                style={{
                    minWidth: width,
                    transition: 'max-height 0.3s ease-in-out',
                }}
            >
                <ChatEditor
                    maxHeight="100px"
                    editor={editor}
                    sendMessage={() => {
                        handleSave(editor?.getText() || '');
                    }}
                    className={cn('prose-sm max-w-full overflow-y-scroll !p-0', markdownStyles)}
                />
            </div>
            <div className={cn('flex-col items-center  group-hover:flex')}>
                <div className=" flex w-full items-center justify-end gap-1 bg-gradient-to-b from-transparent p-1.5">
                    <Button
                        size="xs"
                        onClick={() => {
                            handleSave(editor?.getText() || '');
                        }}
                        tooltip={status === 'copied' ? 'Copied' : 'Copy'}
                    >
                        Save
                    </Button>
                    <Button variant="bordered" size="xs" tooltip="Edit" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    );
});

Message.displayName = 'Message';
