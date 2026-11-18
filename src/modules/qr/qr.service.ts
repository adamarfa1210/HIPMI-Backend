import { AppError } from "../../middlewares/error.middleware.js";
import type { AuthUser } from "../../middlewares/auth.middleware.js";
import { calendarService } from "../calendar/calendar.service.js";
import {
  erpQrEnvelopeSchema,
  meetingAttendanceQrSchema,
} from "./qr.schema.js";

export class QrService {
  async processScan(rawPayload: string, user: AuthUser) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawPayload);
    } catch {
      throw new AppError(
        400,
        "INVALID_QR_FORMAT",
        "QR Code tidak dikenali. Pastikan QR berasal dari sistem ERP HIPMI PT Telkom."
      );
    }

    const envelope = erpQrEnvelopeSchema.safeParse(parsedJson);
    if (!envelope.success) {
      throw new AppError(
        400,
        "INVALID_QR_SOURCE",
        envelope.error.issues[0]?.message ||
          "QR Code bukan berasal dari sistem ERP HIPMI PT Telkom"
      );
    }

    switch (envelope.data.type) {
      case "MEETING_ATTENDANCE": {
        const meetingData = meetingAttendanceQrSchema.safeParse(parsedJson);
        if (!meetingData.success) {
          throw new AppError(
            400,
            "INVALID_QR_PAYLOAD",
            meetingData.error.issues[0]?.message ||
              "Struktur QR absensi agenda tidak valid"
          );
        }
        return await calendarService.scanMeetingAttendanceQr(
          meetingData.data.eventId,
          meetingData.data.token,
          user
        );
      }

      default:
        throw new AppError(
          400,
          "UNSUPPORTED_QR_TYPE",
          `Jenis QR ERP [${envelope.data.type}] belum didukung oleh modul scanner ini.`
        );
    }
  }
}

export const qrService = new QrService();
