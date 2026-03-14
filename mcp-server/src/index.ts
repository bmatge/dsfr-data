#!/usr/bin/env node

/**
 * dsfr-data MCP Server
 *
 * Exposes dsfr-data skills to AI tools via the Model Context Protocol.
 * Skills are fetched dynamically from the production server on startup,
 * so the MCP always serves the latest specifications.
 *
 * Two modes:
 *   stdio (default)  - for Claude Desktop, Claude Code, Cursor, etc.
 *   http  (--http)   - for Claude.ai web connectors and remote clients
 *
 * Usage:
 *   npx dsfr-data-mcp                                  # stdio, default URL
 *   npx dsfr-data-mcp --url https://my-domain.com      # stdio, custom URL
 *   npx dsfr-data-mcp --http                            # HTTP on port 3001
 *   npx dsfr-data-mcp --http --port 8080                # HTTP on custom port
 *   npx dsfr-data-mcp --http --skills-file ./skills.json # HTTP, local file
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string[];
  content: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://chartsbuilder.matge.com';
const DEFAULT_PORT = 3001;

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const baseUrl = (getArg('--url') ?? DEFAULT_BASE_URL).replace(/\/$/, '');
const isHttpMode = hasFlag('--http');
const httpPort = parseInt(getArg('--port') ?? String(DEFAULT_PORT), 10);
const skillsFile = getArg('--skills-file');

// ---------------------------------------------------------------------------
// Skills loader
// ---------------------------------------------------------------------------

let skillsCache: Skill[] | null = null;

async function loadSkills(): Promise<Skill[]> {
  if (skillsCache) return skillsCache;

  try {
    if (skillsFile) {
      // Local file mode (Docker / embedded)
      const { readFileSync } = await import('node:fs');
      skillsCache = JSON.parse(readFileSync(skillsFile, 'utf-8')) as Skill[];
      console.error(`[dsfr-data-mcp] Loaded ${skillsCache.length} skills from ${skillsFile}`);
    } else {
      // Remote fetch mode (default)
      const url = `${baseUrl}/dist/skills.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      skillsCache = (await res.json()) as Skill[];
    }
  } catch (err) {
    console.error(`[dsfr-data-mcp] Could not load skills: ${err}`);
    skillsCache = [];
  }

  return skillsCache;
}

function matchSkills(skills: Skill[], message: string): Skill[] {
  const lower = message.toLowerCase();
  return skills.filter(s =>
    s.trigger.some(t => lower.includes(t.toLowerCase())),
  );
}

// ---------------------------------------------------------------------------
// MCP Server (tools registration)
// ---------------------------------------------------------------------------

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'dsfr-data',
    version: '0.1.0',
  });

  // -- Tool: list_skills ----------------------------------------------------

  server.tool(
    'list_skills',
    'List all available dsfr-data skills (id, name, description)',
    async () => {
      const skills = await loadSkills();
      const list = skills.map(s => `- **${s.name}** (${s.id}): ${s.description}`).join('\n');
      return {
        content: [{
          type: 'text' as const,
          text: `## dsfr-data skills (${skills.length})\n\n${list}`,
        }],
      };
    },
  );

  // -- Tool: get_skill ------------------------------------------------------

  server.tool(
    'get_skill',
    'Get the full content of a specific skill by ID',
    { skill_id: z.string().describe('Skill ID (e.g. dsfrDataSource, dsfrDataChart, createChartAction)') },
    async ({ skill_id }) => {
      const skills = await loadSkills();
      const skill = skills.find(s => s.id === skill_id);
      if (!skill) {
        const ids = skills.map(s => s.id).join(', ');
        return {
          content: [{
            type: 'text' as const,
            text: `Skill "${skill_id}" not found. Available: ${ids}`,
          }],
          isError: true,
        };
      }
      return {
        content: [{
          type: 'text' as const,
          text: skill.content,
        }],
      };
    },
  );

  // -- Tool: get_relevant_skills --------------------------------------------

  server.tool(
    'get_relevant_skills',
    'Get skills relevant to a user message (keyword matching). Returns full content of matched skills.',
    { message: z.string().describe('User message to match against skill triggers (e.g. "graphique barres par region")') },
    async ({ message }) => {
      const skills = await loadSkills();
      const matched = matchSkills(skills, message);
      if (matched.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No skills matched. Try broader keywords, or use list_skills to see all available skills.',
          }],
        };
      }
      const text = matched.map(s => s.content).join('\n\n---\n\n');
      return {
        content: [{
          type: 'text' as const,
          text: `## ${matched.length} skill(s) matched\n\n${text}`,
        }],
      };
    },
  );

  // -- Tool: generate_widget_code -------------------------------------------

  server.tool(
    'generate_widget_code',
    'Get the full specification needed to generate dsfr-data HTML code: composition patterns, CDN dependencies, component docs, and troubleshooting tips.',
    {
      chart_type: z.string().optional().describe('Optional chart type to focus on (bar, line, pie, map, kpi, datalist, etc.)'),
    },
    async ({ chart_type }) => {
      const skills = await loadSkills();

      const ids = ['compositionPatterns', 'dsfrDataSource', 'dsfrDataChart', 'apiProviders', 'troubleshooting'];

      if (chart_type) {
        const lower = chart_type.toLowerCase();
        if (lower === 'kpi') ids.push('dsfrDataKpi');
        if (lower === 'datalist' || lower === 'tableau') ids.push('dsfrDataList');
        if (lower === 'map' || lower === 'map-reg') ids.push('dsfrColors');
        if (lower.includes('bar') || lower.includes('pie') || lower.includes('line')) ids.push('chartTypes');
      } else {
        ids.push('dsfrDataKpi', 'dsfrDataList', 'dsfrDataQuery', 'chartTypes', 'dsfrColors');
      }

      if (!ids.includes('dsfrDataQuery')) ids.push('dsfrDataQuery');

      const contents = [...new Set(ids)]
        .map(id => skills.find(s => s.id === id))
        .filter(Boolean)
        .map(s => s!.content);

      return {
        content: [{
          type: 'text' as const,
          text: contents.join('\n\n---\n\n'),
        }],
      };
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Start: stdio mode
// ---------------------------------------------------------------------------

async function startStdio() {
  await loadSkills();
  console.error(`[dsfr-data-mcp] stdio mode — ${skillsCache?.length ?? 0} skills from ${baseUrl}`);

  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ---------------------------------------------------------------------------
// Start: HTTP mode (for Claude.ai remote connectors)
// ---------------------------------------------------------------------------

async function startHttp() {
  await loadSkills();
  console.error(`[dsfr-data-mcp] HTTP mode — ${skillsCache?.length ?? 0} skills from ${baseUrl}`);

  // Map to store transports by session ID
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  const httpServer = createServer(async (req, res) => {
    // CORS headers for Claude.ai
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', skills: skillsCache?.length ?? 0 }));
      return;
    }

    // Only handle /mcp path
    if (req.url !== '/mcp') {
      res.writeHead(404);
      res.end('Not found. Use /mcp for MCP protocol or /health for status.');
      return;
    }

    // Get or create session
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Existing session
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
    } else if (!sessionId && req.method === 'POST') {
      // New session (initialization)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
      });

      const server = createMcpServer();
      await server.connect(transport);

      // Store session after connection (session ID is set after handling init request)
      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
          console.error(`[dsfr-data-mcp] Session ${transport.sessionId} closed (${sessions.size} active)`);
        }
      };

      await transport.handleRequest(req, res);

      // Store session with the generated ID
      if (transport.sessionId) {
        sessions.set(transport.sessionId, { server, transport });
        console.error(`[dsfr-data-mcp] New session ${transport.sessionId} (${sessions.size} active)`);
      }
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request. Missing or unknown session ID.' }));
    }
  });

  httpServer.listen(httpPort, () => {
    console.error(`[dsfr-data-mcp] Listening on http://0.0.0.0:${httpPort}/mcp`);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(isHttpMode ? startHttp() : startStdio()).catch((err) => {
  console.error('[dsfr-data-mcp] Fatal error:', err);
  process.exit(1);
});
