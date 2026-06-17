import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { h } from "../lib/http.js";

export const categories = Router();

const slug = z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, dashes only");

const categoryInput = z.object({
  slug,
  name: z.string().min(1),
});

categories.get(
  "/",
  h(async (_req, res) => {
    res.json(
      await prisma.category.findMany({
        orderBy: { slug: "asc" },
        include: { _count: { select: { templates: true } } },
      })
    );
  })
);

categories.post(
  "/",
  h(async (req, res) => {
    const data = categoryInput.parse(req.body);
    res.status(201).json(await prisma.category.create({ data }));
  })
);

categories.put(
  "/:id",
  h(async (req, res) => {
    const data = categoryInput.partial().parse(req.body);
    res.json(await prisma.category.update({ where: { id: req.params.id }, data }));
  })
);

categories.delete(
  "/:id",
  h(async (req, res) => {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
