import { z } from 'zod';
import { insertModelSchema, models } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  models: {
    list: {
      method: 'GET' as const,
      path: '/api/models' as const,
      responses: {
        200: z.array(z.custom<typeof models.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/models/:id' as const,
      responses: {
        200: z.custom<typeof models.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    upload: {
      method: 'POST' as const,
      path: '/api/models' as const,
      // Input is FormData, handled via middleware, schema validates metadata
      input: z.any(), 
      responses: {
        201: z.custom<typeof models.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/models/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    // Special endpoint for file content
    file: {
      method: 'GET' as const,
      path: '/api/models/:id/file' as const,
      responses: {
        200: z.any(), // Stream
        404: errorSchemas.notFound,
      },
    },
    // Get IFC properties for a specific expressId
    properties: {
      method: 'GET' as const,
      path: '/api/models/:id/properties/:expressId' as const,
      responses: {
        200: z.any(), // JSONB properties
        404: errorSchemas.notFound,
      },
    },
    // Get all IFC properties for a model
    allProperties: {
      method: 'GET' as const,
      path: '/api/models/:id/properties' as const,
      responses: {
        200: z.array(z.any()), // Array of all properties
        404: errorSchemas.notFound,
      },
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
