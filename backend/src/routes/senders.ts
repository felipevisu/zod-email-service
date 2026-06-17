import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { h, HttpError } from "../lib/http.js";

export const senders = Router();

const senderInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  region: z.string().min(1).default("us-east-1"),
});

senders.get(
  "/",
  h(async (_req, res) => {
    res.json(await prisma.sender.findMany({ orderBy: { createdAt: "desc" } }));
  })
);

senders.post(
  "/",
  h(async (req, res) => {
    const data = senderInput.parse(req.body);
    res.status(201).json(await prisma.sender.create({ data }));
  })
);

senders.put(
  "/:id",
  h(async (req, res) => {
    const data = senderInput.partial().parse(req.body);
    res.json(await prisma.sender.update({ where: { id: req.params.id }, data }));
  })
);

senders.delete(
  "/:id",
  h(async (req, res) => {
    await prisma.sender.delete({ where: { id: req.params.id } }).catch(() => {
      throw new HttpError(404, "sender_not_found");
    });
    res.status(204).end();
  })
);
