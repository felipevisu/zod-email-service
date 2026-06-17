import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Category, Template } from "../lib/api";
import { Badge, Button, Card, Field, Input } from "../components/ui";

export default function TemplatesPage() {
  const { categoryId = "" } = useParams();
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
  });
  const category = categories.find((c) => c.id === categoryId);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["templates", categoryId],
    queryFn: () => api.get<Template[]>(`/templates?categoryId=${categoryId}`),
  });

  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => api.post<Template>("/templates", { slug, name, categoryId }),
    onSuccess: () => {
      setSlug("");
      setName("");
      qc.invalidateQueries({ queryKey: ["templates", categoryId] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-indigo-600">
          ← Categories
        </Link>
        <h1 className="text-2xl font-bold mt-1">{category?.name ?? "Category"}</h1>
        <code className="text-xs text-slate-400">/{category?.slug}</code>
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 text-sm text-slate-600">New email template</h2>
        <div className="flex gap-3 items-end">
          <div className="w-56">
            <Field label="Slug (URL segment)">
              <Input placeholder="password-recovery" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Name">
              <Input placeholder="Password Recovery" value={name} onChange={(e) => setName(e.target.value)} />
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
        <div className="grid sm:grid-cols-2 gap-4">
          {templates.map((t) => (
            <Link key={t.id} to={`/templates/${t.id}`}>
              <Card className="p-4 hover:border-indigo-400 transition">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t.name}</span>
                  <Badge>{t._count?.versions ?? 0} versions</Badge>
                </div>
                <code className="text-xs text-slate-400">
                  /{category?.slug}/{t.slug}
                </code>
              </Card>
            </Link>
          ))}
          {templates.length === 0 && <p className="text-slate-400">No email templates yet.</p>}
        </div>
      )}
    </div>
  );
}
