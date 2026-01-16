"use client";

import { useEffect, useRef, useState } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";

// Lazy load collaboration modules only when needed
let Y: typeof import("yjs") | null = null;
let WebsocketProvider: typeof import("y-websocket").WebsocketProvider | null = null;
let yCollab: typeof import("y-codemirror.next").yCollab | null = null;
let yUndoManagerKeymap: typeof import("y-codemirror.next").yUndoManagerKeymap | null = null;

async function loadCollabModules() {
    if (!Y) {
        const [yjsModule, wsModule, cmModule] = await Promise.all([
            import("yjs"),
            import("y-websocket"),
            import("y-codemirror.next"),
        ]);
        Y = yjsModule;
        WebsocketProvider = wsModule.WebsocketProvider;
        yCollab = cmModule.yCollab;
        yUndoManagerKeymap = cmModule.yUndoManagerKeymap;
    }
}

// User colors for presence
const COLORS = [
    "#30bced", "#6eeb83", "#ffbc42", "#ff6b6b",
    "#c56cf0", "#17c0eb", "#ff9f43", "#ee5a24",
];

function getRandomColor(): string {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export interface CollaborativeEditorProps {
    /** Unique document ID */
    documentId: string;
    /** Initial content (only used on first mount) */
    initialContent?: string;
    /** Callback when content changes */
    onChange?: (content: string) => void;
    /** CSS class name */
    className?: string;
    /** Enable real-time collaboration */
    enableCollaboration?: boolean;
    /** WebSocket server URL */
    serverUrl?: string;
    /** User name for presence */
    userName?: string;
}

export function CollaborativeEditor({
    documentId,
    initialContent = "",
    onChange,
    className = "",
    enableCollaboration = false,
    serverUrl = typeof window !== "undefined"
        ? window.location.protocol === "https:"
            ? `wss://${window.location.host}/collab/`
            : `ws://${window.location.hostname}:1234`
        : "ws://localhost:1234",
    userName = "Anonymous",
}: CollaborativeEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);

    // Use refs for callbacks to avoid recreating editor
    const onChangeRef = useRef(onChange);
    const initialContentRef = useRef(initialContent);

    // Track collaboration state
    const [collabReady, setCollabReady] = useState(!enableCollaboration);

    // Keep onChange ref updated
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    // Update initial content ref when documentId changes
    useEffect(() => {
        initialContentRef.current = initialContent;
    }, [documentId, initialContent]);

    // Load collaboration modules if needed
    useEffect(() => {
        if (enableCollaboration && !collabReady) {
            loadCollabModules().then(() => setCollabReady(true));
        }
    }, [enableCollaboration, collabReady]);

    // Create editor
    useEffect(() => {
        if (!editorRef.current) return;
        if (enableCollaboration && !collabReady) return; // Wait for collab modules

        // Cleanup previous
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }

        let ydoc: InstanceType<typeof import("yjs").Doc> | null = null;
        let provider: InstanceType<typeof import("y-websocket").WebsocketProvider> | null = null;
        let view: EditorView | null = null;

        const extensions = [
            lineNumbers(),
            highlightActiveLine(),
            drawSelection(),
            history(),
            keymap.of([
                ...defaultKeymap,
                ...historyKeymap,
            ]),
            oneDark,
            EditorView.theme({
                "&": {
                    height: "100%",
                    fontSize: "14px",
                    backgroundColor: "transparent",
                },
                ".cm-scroller": {
                    overflow: "auto",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                },
                ".cm-gutters": {
                    backgroundColor: "transparent",
                    borderRight: "1px solid rgba(255,255,255,0.1)",
                },
                ".cm-content": {
                    padding: "8px 0",
                },
                ".cm-line": {
                    padding: "0 8px",
                },
                ".cm-ySelectionInfo": {
                    padding: "2px 4px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: "500",
                },
            }),
            EditorView.updateListener.of((update) => {
                if (update.docChanged && onChangeRef.current) {
                    onChangeRef.current(update.state.doc.toString());
                }
            }),
        ];

        let doc = initialContentRef.current;

        // Add collaboration if enabled
        if (enableCollaboration && Y && WebsocketProvider && yCollab && yUndoManagerKeymap) {
            ydoc = new Y.Doc();
            provider = new WebsocketProvider(serverUrl, documentId, ydoc);

            const ytext = ydoc.getText("content");

            // Initialize content if empty
            if (ytext.length === 0 && initialContentRef.current) {
                ytext.insert(0, initialContentRef.current);
            }

            // Set awareness
            provider.awareness.setLocalStateField("user", {
                name: userName,
                color: getRandomColor(),
            });

            // Add collab extension
            extensions.push(yCollab(ytext, provider.awareness));
            extensions.push(keymap.of(yUndoManagerKeymap));

            doc = ytext.toString();
        }

        // Create editor
        const state = EditorState.create({ doc, extensions });
        view = new EditorView({ state, parent: editorRef.current });
        viewRef.current = view;

        // Store cleanup function
        cleanupRef.current = () => {
            view?.destroy();
            provider?.disconnect();
            provider?.destroy();
            ydoc?.destroy();
            viewRef.current = null;
        };

        return () => {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, [documentId, enableCollaboration, collabReady, serverUrl, userName]);

    return (
        <div
            ref={editorRef}
            className={`h-full w-full overflow-hidden rounded-md border border-foreground/10 ${className}`}
        />
    );
}

export default CollaborativeEditor;
