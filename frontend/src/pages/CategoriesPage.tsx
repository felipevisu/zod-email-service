import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Category, TemplateWithSenders } from "../lib/api";
import { Badge, Button, Card, Field, Input } from "../components/ui";

// The sender a template belongs to: its published version's sender,
// falling back to the latest version's (versions come newest-first).
function templateSender(t: TemplateWithSenders) {
  const published = t.versions.find((v) => v.status === "PUBLISHED" && v.sender);
  return published?.sender ?? t.versions.find((v) => v.sender)?.sender ?? null;
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  });
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<TemplateWithSenders[]>("/templates"),
  });

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => api.post<Category>("/categories", { slug, name }),
    onSuccess: () => {
      setSlug("");
      setName("");
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  // Group templates under their sender; key "" = no sender assigned.
  const groups = new Map<string, { label: string; templates: TemplateWithSenders[] }>();
  for (const t of templates) {
    const s = templateSender(t);
    const key = s?.id ?? "";
    const label = s ? `${s.name} <${s.email}>` : "No sender";
    if (!groups.has(key)) groups.set(key, { label, templates: [] });
    groups.get(key)!.templates.push(t);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a === "" ? 1 : b === "" ? -1 : groups.get(a)!.label.localeCompare(groups.get(b)!.label)
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Templates by sender</h1>

      {templatesLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="text-slate-400">No templates yet. Create a category, then add templates to it.</p>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(([key, group]) => (
            <div key={key || "none"}>
              <h2 className="font-semibold text-sm text-slate-600 mb-2">{group.label}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.templates.map((t) => (
                  <Link key={t.id} to={`/templates/${t.id}`}>
                    <Card className="p-4 hover:border-indigo-400 transition">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{t.name}</span>
                        <Badge>{t._count?.versions ?? 0} versions</Badge>
                      </div>
                      <code className="text-xs text-slate-400">
                        /{t.category?.slug}/{t.slug}
                      </code>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-6 space-y-4">
        <h2 className="text-lg font-bold">Categories</h2>

        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm text-slate-600">New category</h3>
          <div className="flex gap-3 items-end">
            <div className="w-48">
              <Field label="Slug (URL segment)">
                <Input placeholder="accounts" value={slug} onChange={(e) => setSlug(e.target.value)} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Name">
                <Input placeholder="Accounts" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            </div>
            <Button onClick={() => create.mutate()} disabled={!slug || !name || create.isPending}>
              Create
            </Button>
          </div>
          {create.isError && <p className="text-red-600 text-sm mt-2">{(create.error as Error).message}</p>}
        </Card>

        {isLoading ? (
          <p className="text-slate-400">Loading…</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((c) => (
              <Link key={c.id} to={`/categories/${c.id}`}>
                <Card className="p-4 hover:border-indigo-400 transition">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.name}</span>
                    <Badge>{c._count?.templates ?? 0} emails</Badge>
                  </div>
                  <code className="text-xs text-slate-400">/{c.slug}</code>
                </Card>
              </Link>
            ))}
            {categories.length === 0 && <p className="text-slate-400">No categories yet.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
