#!/usr/bin/env node
/**
 * y-websocket collaboration server for MyLeaf
 * Run with: node scripts/collab-server.js
 */

const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

const PORT = process.env.WS_PORT || 1234;

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

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('MyLeaf Collaboration Server');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
    // Get document name from URL path
    const docName = req.url?.slice(1) || 'default';
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
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, messageSync);
                const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
                if (encoding.length(encoder) > 1) {
                    send(conn, encoding.toUint8Array(encoder));
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
    console.log(`📡 Collaboration server running on ws://localhost:${PORT}`);
});

process.on('SIGINT', () => {
    console.log('\n👋 Shutting down collaboration server...');
    server.close();
    process.exit(0);
});
