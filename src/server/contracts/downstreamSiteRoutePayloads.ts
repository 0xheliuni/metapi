import { z } from 'zod';

const downstreamSitePayloadSchema = z.object({
  name: z.string().optional(),
  hostSiteId: z.union([z.number(), z.string()]).optional(),
  baseUrlOverride: z.union([z.string(), z.null()]).optional(),
  authMode: z.string().optional(),
  adminCredential: z.union([z.string(), z.null()]).optional(),
  adminUserId: z.union([z.number(), z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  enabled: z.boolean().optional(),
}).passthrough();

export type DownstreamSitePayload = z.output<typeof downstreamSitePayloadSchema>;

function formatPayloadError(error: z.ZodError): string {
  const firstIssue = error.issues[0];
  const [firstPath] = firstIssue?.path ?? [];
  if (!firstPath) return '参数无效：请求体必须是对象';
  if (firstPath === 'name') return 'Invalid name. Expected string.';
  if (firstPath === 'hostSiteId') return 'Invalid hostSiteId. Expected number or string.';
  if (firstPath === 'baseUrlOverride') return 'Invalid baseUrlOverride. Expected string or null.';
  if (firstPath === 'authMode') return 'Invalid authMode. Expected string.';
  if (firstPath === 'adminCredential') return 'Invalid adminCredential. Expected string or null.';
  if (firstPath === 'adminUserId') return 'Invalid adminUserId. Expected number, string, or null.';
  if (firstPath === 'description') return 'Invalid description. Expected string or null.';
  if (firstPath === 'enabled') return 'Invalid enabled. Expected boolean.';
  return '参数无效';
}

export function parseDownstreamSitePayload(input: unknown):
{ success: true; data: DownstreamSitePayload } | { success: false; error: string } {
  const result = downstreamSitePayloadSchema.safeParse(input === undefined ? {} : input);
  if (!result.success) {
    return { success: false, error: formatPayloadError(result.error) };
  }
  return { success: true, data: result.data };
}
