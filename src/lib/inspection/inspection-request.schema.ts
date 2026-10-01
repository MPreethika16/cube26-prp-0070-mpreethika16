import { z } from "zod";
import {
  workOrderSpecificationSchema,
  type WorkOrderSpecification,
} from "@/lib/compliance/work-order.schema";

export const imageInputSchema = z.object({
  imageId: z.string().min(1, "imageId is required"),
  mimeType: z.string().min(1, "mimeType is required"),
  imageData: z.string().min(1, "imageData is required"),
});

export const inspectionRequestSchema = z.object({
  unitId: z.string().min(1, "unitId is required"),
  orgId: z.string().optional(),
  workOrder: workOrderSpecificationSchema.optional(),
  images: z.array(imageInputSchema).min(1, "At least one image is required"),
});

export type InspectionRequestBody = z.infer<typeof inspectionRequestSchema>;
export type { WorkOrderSpecification };
