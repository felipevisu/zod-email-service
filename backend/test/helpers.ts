import request from "supertest";
import type { Express } from "express";
import { TEST_USERNAME, TEST_PASSWORD } from "./setup.js";

/**
 * Returns a supertest agent that has logged in and carries the session cookie,
 * so it can call the protected /api/* management routes.
 */
export async function authedAgent(app: Express) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ username: TEST_USERNAME, password: TEST_PASSWORD });
  if (res.status !== 200) throw new Error(`test login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
