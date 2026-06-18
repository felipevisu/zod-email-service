import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiKeys, ApiKey, CreatedApiKey, Template } from "../lib/api";
import { Badge, Button, Card, Field, Input } from "../components/ui";

function statusBadge(k: ApiKey) {
  if (k.revokedAt) return <Badge color="red">Revoked</Badge>;
  if (k.expiresAt && new Date(k.expiresAt) <= new Date()) return <Badge color="amber">Expired</Badge>;
  return <Badge color="green">Active</Badge>;
}

function CreatedKeyModal({ created, onClose }: { created: CreatedApiKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
      <Card className="w-full max-w-lg p-6 space-y-4">
        <h2 className="font-bold text-lg">API key created</h2>
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          Copy this key now — it is shown <strong>only once</strong> and cannot be retrieved again.
        </p>
        <div className="flex gap-2">
          <code className="flex-1 bg-slate-100 rounded-md px-3 py-2 text-xs break-all">{created.key}</code>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(created.key).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api-keys"],
    queryFn: apiKeys.list,
  });
  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<Template[]>("/templates"),
  });

  const [name, setName] = useState("");
  const [scope, setScope] = useState<"ALL" | "SELECTED">("ALL");
  const [templateIds, setTemplateIds] = useState<string[]>([]);
  const [permanent, setPermanent] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiKeys.create({
        name,
        scope,
        templateIds: scope === "SELECTED" ? templateIds : undefined,
        expiresAt: permanent || !expiresAt ? undefined : new Date(expiresAt).toISOString(),
      }),
    onSuccess: (key) => {
      setCreated(key);
      setName("");
      setScope("ALL");
      setTemplateIds([]);
      setPermanent(true);
      setExpiresAt("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiKeys.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiKeys.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const canCreate = name.trim() && (scope === "ALL" || templateIds.length > 0) && !create.isPending;

  function toggleTemplate(id: string) {
    setTemplateIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">API keys</h1>
      <p className="text-sm text-slate-500">
        Keys authorize internal services to call the send API. Give a key full access to every
        template, or scope it to a specific set. Scope is fixed once created — to change it, revoke
        and create a new key.
      </p>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold text-sm text-slate-600">Create key</h2>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <Field label="Name">
              <Input placeholder="billing-service prod" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="w-48">
            <Field label="Access">
              <select
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={scope}
                onChange={(e) => setScope(e.target.value as "ALL" | "SELECTED")}
              >
                <option value="ALL">All templates</option>
                <option value="SELECTED">Selected templates</option>
              </select>
            </Field>
          </div>
        </div>

        {scope === "SELECTED" && (
          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1">Templates</span>
            <div className="max-h-48 overflow-auto border rounded-md p-2 space-y-1">
              {templates.length === 0 && <p className="text-sm text-slate-400 px-1">No templates yet.</p>}
              {templates.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm px-1 py-0.5">
                  <input
                    type="checkbox"
                    checked={templateIds.includes(t.id)}
                    onChange={() => toggleTemplate(t.id)}
                  />
                  <span className="font-medium">{t.name}</span>
                  <span className="text-slate-400">
                    {t.category?.slug}/{t.slug}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={permanent} onChange={() => setPermanent(true)} />
            Permanent
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={!permanent} onChange={() => setPermanent(false)} />
            Expires
          </label>
          {!permanent && (
            <input
              type="date"
              className="border rounded-md px-3 py-2 text-sm"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          )}
          <Button className="ml-auto" onClick={() => create.mutate()} disabled={!canCreate}>
            Create key
          </Button>
        </div>
        {create.isError && <p className="text-red-600 text-sm">{(create.error as Error).message}</p>}
      </Card>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <Card key={k.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{k.name}</span>
                    {statusBadge(k)}
                    <Badge color={k.scope === "ALL" ? "slate" : "amber"}>
                      {k.scope === "ALL" ? "All templates" : "Selected"}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    <code>{k.hint}</code>
                    {" · "}
                    {k.expiresAt ? `expires ${new Date(k.expiresAt).toLocaleDateString()}` : "permanent"}
                    {" · "}
                    {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : "never used"}
                  </div>
                  {k.scope === "SELECTED" && (
                    <div className="text-xs text-slate-500 mt-1">
                      {k.templates.map((t) => `${t.template.slug}`).join(", ") || "—"}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {!k.revokedAt && (
                    <Button variant="ghost" onClick={() => revoke.mutate(k.id)}>
                      Revoke
                    </Button>
                  )}
                  <Button variant="danger" onClick={() => remove.mutate(k.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {keys.length === 0 && <p className="text-slate-400">No API keys yet.</p>}
        </div>
      )}

      {created && <CreatedKeyModal created={created} onClose={() => setCreated(null)} />}
    </div>
  );
}
