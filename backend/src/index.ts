import express from "express";
import cors from "cors";
import { errorMiddleware } from "./lib/http.js";
import { senders } from "./routes/senders.js";
import { categories } from "./routes/categories.js";
import { templates } from "./routes/templates.js";
import { versions } from "./routes/versions.js";
import { send } from "./routes/send.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Management API (consumed by the UI).
app.use("/api/senders", senders);
app.use("/api/categories", categories);
app.use("/api/templates", templates);
app.use("/api", versions); // /api/templates/:id/versions, /api/versions/:id, ...

// Public send API (consumed by other services): /:category/:template/:version
app.use("/", send);

app.use(errorMiddleware);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`backend on http://localhost:${port}`));
