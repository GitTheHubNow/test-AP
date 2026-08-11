import { z } from 'zod';

/**
 * Validation schemas
 * Clean single-definition version
 */

/* ---------------- Memorial Schemas ---------------- */

export const CreateMemorialSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200).trim(),
  description: z.string().max(2000).trim().optional().nullable(),
});

export type CreateMemorialInput = z.infer<typeof CreateMemorialSchema>;

/* ---------------- Memory Schemas ---------------- */

export const SubmitMemorySchema = z.object({
  authorName: z.string().max(100).trim().optional().nullable(),
  message: z.string().min(1).max(5000).trim(),
});

export type SubmitMemoryInput = z.infer<typeof SubmitMemorySchema>;

/* ---------------- Batch Moderation ---------------- */

export const BatchOperationSchema = z.object({
  memoryIds: z.array(z.string()).min(1).max(50),
  action: z.enum(['approve', 'reject']),
});

export type BatchOperationInput = z.infer<typeof BatchOperationSchema>;

/* ---------------- ReadOnly Toggle ---------------- */

export const ToggleReadOnlySchema = z.object({
  readOnly: z.boolean(),
});

export type ToggleReadOnlyInput = z.infer<typeof ToggleReadOnlySchema>;

/* ---------------- Route Params ---------------- */

export const MemorialIdSchema = z.string().min(1);
export const MemoryIdSchema = z.string().min(1);
export const GuestBookIdSchema = z.string().min(1);
export const QrTokenSchema = z.string().min(20).max(200);

/* ---------------- Validation Helpers ---------------- */

export function validateParam<T>(
  value: unknown,
  schema: z.ZodSchema<T>
):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Invalid parameter',
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

export async function parseBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<
  | { success: true; data: T }
  | { success: false; error: string }
> {
  try {
    const json = await request.json();

    const result = schema.safeParse(json);

    if (!result.success) {
      return {
        success: false,
        error: result.error.errors[0]?.message || 'Invalid request body',
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch {
    return {
      success: false,
      error: 'Invalid JSON body',
    };
  }
}
