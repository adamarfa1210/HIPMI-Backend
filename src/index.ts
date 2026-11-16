import { serve } from "@hono/node-server";
import { app } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;

if (process.env.NODE_ENV !== "test") {
  serve(
    {
      fetch: app.fetch,
      port: PORT,
    },
    (info) => {
      console.log(`[HIPMI-API] Server listening on port ${info.port}`);
    }
  );
}

export { app };
export default app;
