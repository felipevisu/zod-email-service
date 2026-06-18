import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { h } from "../lib/http.js";

export const logs = Router();

const query = z.object({
  status: z.enum(["SENT", "FAILED"]).optional(),
  category: z.string().optional(),
  template: z.string().optional(),
  search: z.string().optional(), // matches subject or recipient
  from: z.coerce.date().optional(), // inclusive lower bound on createdAt
  to: z.coerce.date().optional(), // inclusive upper bound on createdAt
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

function buildWhere(q: z.infer<typeof query>): Prisma.EmailLogWhereInput {
  const where: Prisma.EmailLogWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.category) where.category = q.category;
  if (q.template) where.template = q.template;
  if (q.search) {
    where.OR = [
      { subject: { contains: q.search, mode: "insensitive" } },
      { to: { has: q.search } },
    ];
  }
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt.gte = q.from;
    if (q.to) where.createdAt.lte = q.to;
  }
  return where;
}

// GET /api/logs — paginated list with filters.
logs.get(
  "/",
  h(async (req, res) => {
    const q = query.parse(req.query);
    const where = buildWhere(q);
    const [items, total] = await Promise.all([
      prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: q.take,
        skip: q.skip,
      }),
      prisma.emailLog.count({ where }),
    ]);
    res.json({ items, total, take: q.take, skip: q.skip });
  })
);

// GET /api/logs/stats — aggregate counts for the dashboard header.
logs.get(
  "/stats",
  h(async (_req, res) => {
    const grouped = await prisma.emailLog.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    const sent = grouped.find((g) => g.status === "SENT")?._count._all ?? 0;
    const failed = grouped.find((g) => g.status === "FAILED")?._count._all ?? 0;
    res.json({ sent, failed, total: sent + failed });
  })
);
