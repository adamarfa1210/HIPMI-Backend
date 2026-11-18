import { z } from "zod";

export const scanQrSchema = z.object({
  payload: z
    .string()
    .trim()
    .min(2, "Payload QR Code tidak boleh kosong")
    .max(2048, "Payload QR Code terlalu panjang"),
});

export const erpQrEnvelopeSchema = z
  .object({
    app: z.literal("HIPMI_ERP", {
      errorMap: () => ({
        message: "QR Code bukan berasal dari sistem resmi ERP HIPMI PT Telkom",
      }),
    }),
    v: z.number().int().positive().default(1),
    type: z.string().trim().min(1),
  })
  .passthrough();

export const meetingAttendanceQrSchema = z.object({
  eventId: z.string().uuid("ID agenda pada QR Code tidak valid"),
  token: z.string().trim().min(8, "Token QR Code tidak valid"),
});

export type ScanQrInput = z.infer<typeof scanQrSchema>;
