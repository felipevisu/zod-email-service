import { createApp } from "./app.js";

const app = createApp();

const port = Number(process.env.PORT ?? 4000);
// Bind 0.0.0.0 so Railway's proxy/healthcheck can reach the container.
app.listen(port, "0.0.0.0", () => console.log(`backend listening on 0.0.0.0:${port}`));
