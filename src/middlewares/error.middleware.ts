import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errorHandler = (err: Error, c: Context) => {
  if (err instanceof ZodError) {
    const errorList = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    const message = "Validation failed: " + err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return c.json(
      {
        success: false,
        message,
        error: {
          code: "VALIDATION_ERROR",
          message,
          details: errorList,
        },
        errors: errorList,
      },
      400
    );
  }

  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        message: err.message,
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      },
      err.statusCode as any
    );
  }

  if (err instanceof HTTPException) {
    const codeMap: Record<number, string> = {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      422: "UNPROCESSABLE_ENTITY",
    };
    return c.json(
      {
        success: false,
        message: err.message,
        error: {
          code: codeMap[err.status] || "HTTP_EXCEPTION",
          message: err.message,
        },
      },
      err.status
    );
  }

  console.error("[Unhandled Exception]:", err);
  const internalMessage = process.env.NODE_ENV === "production" ? "Internal server error" : err.message;
  return c.json(
    {
      success: false,
      message: internalMessage,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: internalMessage,
      },
    },
    500
  );
};

export const notFoundHandler = (c: Context) => {
  const message = `Route ${c.req.method} ${c.req.path} not found`;
  return c.json(
    {
      success: false,
      message,
      error: {
        code: "NOT_FOUND",
        message,
      },
    },
    404
  );
};
