// pages/api/mcp-proxy/[server]/sse.ts
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';

// Store sessions globally for access across requests
declare global {
  var _mcpSessions: Record<string, string>;
}
global._mcpSessions = global._mcpSessions || {};

export async function GET(request: NextRequest) {
  const serverUrl = request.nextUrl.searchParams.get('server');
  if (!serverUrl) {
    return NextResponse.json(
      { error: 'Messages should be sent using POST method' },
      { status: 405 }
    );
  }

  // Generate a new session ID for this connection
  const newSessionId = randomUUID();
  global._mcpSessions[newSessionId] = serverUrl;
  console.log(`Created session ${newSessionId} for server ${serverUrl}`);

  try {
    const response = await fetch(serverUrl, {
      method: 'GET',
      headers: {
        ...Object.fromEntries(request.headers),
        host: new URL(serverUrl).host,
      },
    });

    if (!response.body) {
      throw new Error('No response body from MCP server');
    }

    const nodeReadable = response.body as unknown as Readable;
    const stream = new ReadableStream({
      start(controller) {
        nodeReadable.on('data', (chunk) => {
          const chunkString = chunk.toString('utf-8');
          const sessionIdMatch = chunkString.match(/sessionId=([^&]+)/);
          if (sessionIdMatch) {
            const sessionId = sessionIdMatch[1];
            console.log(`Mapping session ${sessionId} → ${serverUrl}`);
            global._mcpSessions[sessionId] = serverUrl;
          }
          controller.enqueue(chunk);
        });

        nodeReadable.on('end', () => {
          controller.close();
          delete global._mcpSessions[newSessionId];
          console.log(`Session ${newSessionId} closed normally`);
        });

        nodeReadable.on('error', (err) => {
          controller.error(err);
          delete global._mcpSessions[newSessionId];
          console.error(`Stream error for session ${newSessionId}:`, err);
        });
      },
      cancel() {
        nodeReadable.destroy();
        delete global._mcpSessions[newSessionId];
        console.log(`Session ${newSessionId} canceled`);
      },
    });

    const transformedStream = new Response(stream as any).body;
    return new NextResponse(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error proxying SSE request:', error);
    delete global._mcpSessions[newSessionId];
    return NextResponse.json(
      { error: 'Failed to connect to MCP server' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32602, message: 'Missing sessionId parameter' },
        id: null,
      },
      { status: 400 }
    );
  }

  const targetUrl = global._mcpSessions[sessionId];
  if (!targetUrl) {
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32602, message: 'Invalid or expired sessionId' },
        id: null,
      },
      { status: 404 }
    );
  }

  try {
    const bodyText = await request.text();
    let jsonRpcRequest;
    try {
      jsonRpcRequest = JSON.parse(bodyText);
      if (
        jsonRpcRequest.jsonrpc !== '2.0' ||
        typeof jsonRpcRequest.method !== 'string'
      ) {
        throw new Error('Invalid JSONRPC request');
      }
    } catch {
      return NextResponse.json(
        {
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null,
        },
        { status: 400 }
      );
    }

    const upstream = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        host: new URL(targetUrl).host,
      },
      body: JSON.stringify(jsonRpcRequest),
    });

    const text = await upstream.text();
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(text);
    } catch {
      jsonResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error: invalid JSON from server',
        },
        id: jsonRpcRequest.id ?? null,
      };
    }

    return NextResponse.json(jsonResponse, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (err) {
    console.error('Error in POST handler:', err);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id: null,
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
