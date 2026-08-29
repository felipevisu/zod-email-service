import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Category, Sender, Template, Version } from "../lib/api";
import { Badge, Button, Card, Field, Input } from "../components/ui";

function NewCategoryForm({ senderId, onDone }: { senderId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: () => api.post<Category>("/categories", { slug, name, senderId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories", senderId] });
      onDone();
    },
  });

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3 text-sm text-slate-600">New category</h3>
      <div className="flex gap-3 items-end flex-wrap">
        <div className="w-48">
          <Field label="Slug (URL segment)">
            <Input placeholder="accounts" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </Field>
        </div>
        <div className="flex-1 min-w-[180px]">
          <Field label="Name">
            <Input placeholder="Accounts" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <Button onClick={() => create.mutate()} disabled={!slug || !name || create.isPending}>
          Create
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {create.isError && <p className="text-red-600 text-sm mt-2">{(create.error as Error).message}</p>}
    </Card>
  );
}

function NewEmailForm({ category, onDone }: { category: Category; onDone: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const template = await api.post<Template>("/templates", { slug, name, categoryId: category.id });
      return api.post<Version>(`/templates/${template.id}/versions`, {});
    },
    onSuccess: (version) => {
      qc.invalidateQueries({ queryKey: ["categories", category.senderId] });
      navigate(`/versions/${version.id}`);
    },
  });

  return (
    <div className="flex gap-3 items-end flex-wrap mb-3">
      <div className="flex-1 min-w-[180px]">
        <Field label="Name">
          <Input placeholder="Password Recovery" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <div className="w-48">
        <Field label="Slug (URL segment)">
          <Input placeholder="password-recovery" value={slug} onChange={(e) => setSlug(e.target.value)} />
        </Field>
      </div>
      <Button onClick={() => create.mutate()} disabled={!name || !slug || create.isPending}>
        Create
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {create.isError && <p className="text-red-600 text-sm w-full">{(create.error as Error).message}</p>}
    </div>
  );
}

export default function SenderDetailPage() {
  const { senderId = "" } = useParams();
  const qc = useQueryClient();

  const { data: senders = [] } = useQuery({
    queryKey: ["senders"],
    queryFn: () => api.get<Sender[]>("/senders"),
  });
  const sender = senders.find((s) => s.id === senderId);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["categories", senderId],
    queryFn: () => api.get<Category[]>(`/categories?senderId=${senderId}`),
  });

  const [addingCategory, setAddingCategory] = useState(false);
  const [addingEmailIn, setAddingEmailIn] = useState<string | null>(null);

  const removeCategory = useMutation({
    mutationFn: (id: string) => api.del(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories", senderId] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-indigo-600">
          ← Senders
        </Link>
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{sender?.name ?? "Sender"}</h1>
            {sender && (
              <>
                <span className="text-slate-500">&lt;{sender.email}&gt;</span>
                <Badge color={sender.provider === "RESEND" ? "purple" : "blue"}>{sender.provider}</Badge>
              </>
            )}
          </div>
          <Button onClick={() => setAddingCategory(true)}>New category</Button>
        </div>
      </div>

      {addingCategory && <NewCategoryForm senderId={senderId} onDone={() => setAddingCategory(false)} />}

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : categories.length === 0 ? (
        <p className="text-slate-400">No categories yet. Create one to start adding emails.</p>
      ) : (
        <div className="space-y-6">
          {categories.map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-3 mb-2">
                <h2 className="font-semibold text-slate-700">{c.name}</h2>
                <code className="text-xs text-slate-400">/{c.slug}</code>
                <Button variant="ghost" onClick={() => setAddingEmailIn(addingEmailIn === c.id ? null : c.id)}>
                  + New email
                </Button>
                {(c.templates ?? []).length === 0 && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (window.confirm(`Delete empty category "${c.name}"?`)) removeCategory.mutate(c.id);
                    }}
                  >
                    Delete
                  </Button>
                )}
              </div>
              {addingEmailIn === c.id && <NewEmailForm category={c} onDone={() => setAddingEmailIn(null)} />}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(c.templates ?? []).map((t) => (
                  <Link key={t.id} to={`/templates/${t.id}`}>
                    <Card className="p-4 hover:border-indigo-400 transition">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{t.name}</span>
                        <Badge>{t._count?.versions ?? 0} versions</Badge>
                      </div>
                      <code className="text-xs text-slate-400">
                        /{c.slug}/{t.slug}
                      </code>
                    </Card>
                  </Link>
                ))}
                {(c.templates ?? []).length === 0 && <p className="text-slate-400 text-sm">No emails yet.</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
