import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { h, HttpError } from "../lib/http.js";

export const templates = Router();

const slug = z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, numbers, dashes only");

const templateInput = z.object({
  slug,
  name: z.string().min(1),
  categoryId: z.string().min(1),
});

// List templates, optionally filtered by category.
templates.get(
  "/",
  h(async (req, res) => {
    const categoryId = req.query.categoryId as string | undefined;
    res.json(
      await prisma.template.findMany({
        where: categoryId ? { categoryId } : undefined,
        orderBy: { slug: "asc" },
        include: {
          category: true,
          _count: { select: { versions: true } },
        },
      })
    );
  })
);

templates.get(
  "/:id",
  h(async (req, res) => {
    const template = await prisma.template.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        versions: {
          orderBy: { version: "desc" },
          include: { sender: true },
        },
      },
    });
    if (!template) throw new HttpError(404, "template_not_found");
    res.json(template);
  })
);

templates.post(
  "/",
  h(async (req, res) => {
    const data = templateInput.parse(req.body);
    res.status(201).json(await prisma.template.create({ data }));
  })
);

templates.put(
  "/:id",
  h(async (req, res) => {
    const data = templateInput.partial().parse(req.body);
    res.json(await prisma.template.update({ where: { id: req.params.id }, data }));
  })
);

templates.delete(
  "/:id",
  h(async (req, res) => {
    await prisma.template.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
