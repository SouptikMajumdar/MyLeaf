#!/usr/bin/env node
/**
 * y-websocket collaboration server for MyLeaf
 * Run with: node scripts/collab-server.js
 *
 * Features:
 * - Real-time document synchronization using Yjs
 * - Session-based authentication via cookies
 * - Project access control (owner/editor can edit, viewer read-only)
 */

const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const cookie = require('cookie');

const PORT = process.env.WS_PORT || 1234;
const DATABASE_URL = process.env.DATABASE_URL;

// Lazy-load Prisma client (only if DATABASE_URL is set)
let prisma = null;
async function getDb() {
    if (!DATABASE_URL) return null;
    if (!prisma) {
        const { PrismaClient } = require('@prisma/client');
        prisma = new PrismaClient();
    }
    return prisma;
}

// Store documents in memory
const docs = new Map();

const messageSync = 0;
const messageAwareness = 1;

function getYDoc(docName) {
    if (!docs.has(docName)) {
        const doc = new Y.Doc();
        docs.set(docName, { doc, awareness: new awarenessProtocol.Awareness(doc), conns: new Set() });
    }
    return docs.get(docName);
}

function send(conn, message) {
    if (conn.readyState === WebSocket.OPEN) {
        conn.send(message);
    }
}

// Parse session ID from cookie
function getSessionFromCookies(cookieHeader) {
    if (!cookieHeader) return null;
    const cookies = cookie.parse(cookieHeader);
    return cookies.myleaf_session || null;
}

// Parse room name to extract project and file IDs
// Format: project:{projectId}:file:{fileId}
function parseRoomName(roomName) {
    const match = roomName.match(/^project:([^:]+):file:([^:]+)$/);
    if (match) {
        return { projectId: match[1], fileId: match[2] };
    }
    // Legacy format: just documentId
    return { projectId: null, fileId: roomName };
}

// Validate session and get user
async function validateSession(sessionId) {
    if (!sessionId) return null;

    const db = await getDb();
    if (!db) return null;

    try {
        const session = await db.session.findUnique({
            where: { id: sessionId },
            include: { user: true }
        });

        if (!session || session.expiresAt < new Date()) {
            return null;
        }

        return session.user;
    } catch (err) {
        console.error('Session validation error:', err);
        return null;
    }
}

// Check if user has access to project
async function checkProjectAccess(userId, projectId) {
    if (!userId || !projectId) return null;

    const db = await getDb();
    if (!db) return 'editor'; // Allow access if no DB (demo mode)

    try {
        // Check if owner
        const project = await db.project.findUnique({
            where: { id: projectId }
        });

        if (!project) return null;
        if (project.ownerId === userId) return 'owner';

        // Check if collaborator
        const collab = await db.projectCollaborator.findUnique({
            where: {
                projectId_userId: { projectId, userId }
            }
        });

        return collab?.role || null;
    } catch (err) {
        console.error('Access check error:', err);
        return null;
    }
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('MyLeaf Collaboration Server');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', async (conn, req) => {
    // Get document name from URL path
    const docName = decodeURIComponent(req.url?.slice(1) || 'default');
    const { projectId, fileId } = parseRoomName(docName);

    // Get session from cookies
    const sessionId = getSessionFromCookies(req.headers.cookie);
    const user = await validateSession(sessionId);

    // Check project access if this is a project document
    let accessRole = 'editor'; // Default for non-project docs (demo mode)
    if (projectId) {
        if (!user) {
            // Reject unauthenticated users for project documents
            conn.close(4001, 'Authentication required');
            return;
        }

        accessRole = await checkProjectAccess(user.id, projectId);
        if (!accessRole) {
            conn.close(4003, 'Access denied');
            return;
        }
    }

    // Store user info and access level on connection
    conn.user = user;
    conn.accessRole = accessRole;
    conn.isReadOnly = accessRole === 'viewer';

    const { doc, awareness, conns } = getYDoc(docName);
    conns.add(conn);

    // Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc);
    send(conn, encoding.toUint8Array(encoder));

    // Send awareness states
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()))
    );
    send(conn, encoding.toUint8Array(awarenessEncoder));

    conn.on('message', (message) => {
        const data = new Uint8Array(message);
        const decoder = decoding.createDecoder(data);
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
            case messageSync: {
                // Block sync updates from read-only users
                if (conn.isReadOnly) {
                    // Still allow sync step 1 (request) and step 2 (response)
                    // but ignore actual updates
                    const syncEncoder = encoding.createEncoder();
                    encoding.writeVarUint(syncEncoder, messageSync);
                    const syncMessageType = syncProtocol.readSyncMessage(decoder, syncEncoder, doc, conn);

                    // Only send response for sync steps, not for updates
                    if (encoding.length(syncEncoder) > 1 && syncMessageType !== syncProtocol.messageYjsUpdate) {
                        send(conn, encoding.toUint8Array(syncEncoder));
                    }
                    return;
                }

                const syncEncoder = encoding.createEncoder();
                encoding.writeVarUint(syncEncoder, messageSync);
                const syncMessageType = syncProtocol.readSyncMessage(decoder, syncEncoder, doc, conn);
                if (encoding.length(syncEncoder) > 1) {
                    send(conn, encoding.toUint8Array(syncEncoder));
                }
                // Broadcast to other clients
                if (syncMessageType === syncProtocol.messageYjsUpdate) {
                    const update = decoding.readVarUint8Array(decoding.createDecoder(data.slice(1)));
                    const broadcastEncoder = encoding.createEncoder();
                    encoding.writeVarUint(broadcastEncoder, messageSync);
                    syncProtocol.writeUpdate(broadcastEncoder, update);
                    const broadcastMessage = encoding.toUint8Array(broadcastEncoder);
                    conns.forEach(c => { if (c !== conn) send(c, broadcastMessage); });
                }
                break;
            }
            case messageAwareness: {
                const update = decoding.readVarUint8Array(decoder);
                awarenessProtocol.applyAwarenessUpdate(awareness, update, conn);
                // Broadcast awareness to all clients
                const awarenessEncoder = encoding.createEncoder();
                encoding.writeVarUint(awarenessEncoder, messageAwareness);
                encoding.writeVarUint8Array(awarenessEncoder, update);
                const awarenessMessage = encoding.toUint8Array(awarenessEncoder);
                conns.forEach(c => { if (c !== conn) send(c, awarenessMessage); });
                break;
            }
        }
    });

    conn.on('close', () => {
        conns.delete(conn);
        awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
    });
});

server.listen(PORT, () => {
    console.log(`Collaboration server running on ws://localhost:${PORT}`);
    if (DATABASE_URL) {
        console.log('Database authentication enabled');
    } else {
        console.log('Running in demo mode (no authentication)');
    }
});

process.on('SIGINT', () => {
    console.log('\nShutting down collaboration server...');
    if (prisma) {
        prisma.$disconnect();
    }
    server.close();
    process.exit(0);
});
