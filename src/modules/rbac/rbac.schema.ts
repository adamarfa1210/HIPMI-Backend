import { z } from "zod";

export const updatePermissionItemSchema = z.object({
  moduleId: z.string().uuid(),
  canRead: z.boolean(),
  canCreate: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  canApprove: z.boolean(),
});

export const updateMatrixSchema = z.object({
  permissions: z.array(updatePermissionItemSchema).min(1),
});

export type UpdateMatrixInput = z.infer<typeof updateMatrixSchema>;
