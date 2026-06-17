import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Category } from "../lib/api";
import { Badge, Button, Card, Field, Input } from "../components/ui";

export default function CategoriesPage() {
  const qc = useQueryClient();
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories"),
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Categories</h1>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 text-sm text-slate-600">New category</h2>
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
  );
}
