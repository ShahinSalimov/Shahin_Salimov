import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { env } from "./lib/env";
import { loadUser } from "./lib/auth";
import { HttpError, errorHandler } from "./lib/http";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Behind Replit/hosting proxies: needed for secure cookies and per-IP rate limits.
app.set("trust proxy", 1);
// Same-origin by default. Set CORS_ORIGIN only if the web app is served from another origin.
if (env.corsOrigin) app.use(cors({ origin: env.corsOrigin, credentials: true }));
// Reference-image uploads arrive as base64 JSON (≤ 5 MB file → ~7 MB body); everything else stays small.
app.use("/api/uploads", express.json({ limit: "8mb" }));
// Keep the raw body so payment webhooks can verify signatures.
app.use(
  express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
// Some gateways (e.g. Epoint) post callbacks as form fields.
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());

// CSRF guard: state-changing calls must be JSON (forms from other sites cannot send that with cookies).
app.use("/api", (req, _res, next) => {
  const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  // Header check (not req.is): req.is() is null for empty bodies, which would block body-less POSTs.
  const isJson = (req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json");
  // Gateway callbacks are server-to-server (form posts) and are authenticated by signature instead.
  if (mutating && req.path !== "/payment/callback" && !isJson) {
    return next(new HttpError(415, "invalid_input"));
  }
  next();
});
app.use("/api", loadUser);
app.use("/api", router);
app.use("/api", (_req, _res, next) => next(new HttpError(404, "not_found")));
app.use(errorHandler);

export default app;
