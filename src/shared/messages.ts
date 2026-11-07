import { z } from 'zod';
import { CaptureSchema, FolderLayoutSchema, PlatformSchema, SlugSchema, SubmissionIdSchema } from './schemas';
import { VERDICTS } from './verdict';

/** Messages from content scripts (validated in the service worker; senders are untrusted). */
export const ContentMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content/detected'), platform: PlatformSchema, submissionId: SubmissionIdSchema, slug: SlugSchema.nullable() }),
  z.object({
    type: z.literal('content/verdict'),
    platform: PlatformSchema,
    submissionId: SubmissionIdSchema,
    verdict: z.enum(VERDICTS),
    capture: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('content/capture-failed'),
    platform: PlatformSchema,
    submissionId: SubmissionIdSchema,
    code: z.enum(['CODE_UNAVAILABLE', 'UNSUPPORTED_LANGUAGE', 'METADATA_UNAVAILABLE', 'VERDICT_MISMATCH']),
    message: z.string().max(300),
  }),
  z.object({ type: z.literal('content/pending'), platform: PlatformSchema }),
]);
export type ContentMessage = z.infer<typeof ContentMessageSchema>;

/** Messages from extension pages (popup / dashboard). */
export const UiMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ui/connect') }),
  z.object({ type: z.literal('ui/disconnect') }),
  z.object({ type: z.literal('ui/delete-account') }),
  z.object({ type: z.literal('ui/refresh') }),
  z.object({ type: z.literal('ui/repos') }),
  z.object({ type: z.literal('ui/branches'), repositoryId: z.string().regex(/^\d{1,20}$/) }),
  z.object({
    type: z.literal('ui/save-repo'),
    repositoryId: z.string().regex(/^\d{1,20}$/),
    branch: z.string().min(1).max(200),
    rootFolder: z.string().max(200),
    layout: FolderLayoutSchema,
  }),
  z.object({ type: z.literal('ui/test-repo') }),
  z.object({ type: z.literal('ui/retry'), key: z.string().max(100) }),
  z.object({ type: z.literal('ui/sync-held') }),
  z.object({ type: z.literal('ui/ping') }),
]);
export type UiMessage = z.infer<typeof UiMessageSchema>;

export type RuntimeMessage = ContentMessage | UiMessage;

export type RuntimeResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  return (
    typeof value === 'object' && value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    /^(content|ui)\//.test((value as { type: string }).type)
  );
}

export { CaptureSchema };
