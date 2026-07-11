
import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { DuckDBStore } from "@mastra/duckdb";
import { MastraCompositeStore } from '@mastra/core/storage';
import { Observability, MastraStorageExporter, MastraPlatformExporter, SensitiveDataFilter } from '@mastra/observability';
import { weatherWorkflow } from './workflows/weather-workflow';
import { weatherAgent } from './agents/weather-agent';
import { researchPublisherAgent } from './agents/research-publisher-agent';
import { researcherAgent } from './agents/researcher-agent';
import { toolCallAppropriatenessScorer, completenessScorer, translationScorer } from './scorers/weather-scorer';

export const mastra = new Mastra({
  // Serve on port 3003 (handoff service map) + a health endpoint. Stock weather
  // agent/workflow are kept as the scaffold record; the research-and-publish
  // demo agent is registered alongside.
  server: {
    port: 3003,
    apiRoutes: [
      // NOTE: Mastra ships a built-in GET /health that returns {"success":true}
      // and shadows a custom /health. We expose the richer demo health at
      // /demo/health so registerApiRoute is actually exercised.
      registerApiRoute('/demo/health', {
        method: 'GET',
        handler: (c) =>
          c.json({
            status: 'ok',
            backend: 'mastra',
            agents: ['research-publisher', 'researcher', 'weather-agent'],
          }),
      }),
    ],
  },
  workflows: { weatherWorkflow },
  agents: { weatherAgent, researchPublisherAgent, researcherAgent },
  scorers: { toolCallAppropriatenessScorer, completenessScorer, translationScorer },
  storage: new MastraCompositeStore({
    id: 'composite-storage',
    default: new LibSQLStore({
      id: "mastra-storage",
      url: "file:./mastra.db",
    }),
    domains: {
      observability: await new DuckDBStore().getStore('observability'),
    }
  }),
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [
          new MastraStorageExporter(), // Persists observability events to Mastra Storage
          new MastraPlatformExporter(), // Sends observability events to Mastra Platform (if MASTRA_PLATFORM_ACCESS_TOKEN is set)
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(), // Redacts sensitive data like passwords, tokens, keys
        ],
      },
    },
  }),
});
