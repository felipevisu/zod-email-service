import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Template, Version } from "../lib/api";
import { Badge, Button, Card } from "../components/ui";

export default function TemplateDetailPage() {
  const { templateId = "" } = useParams();
  const qc = useQueryClient();
  const nav = useNavigate();

  const { data: template, isLoading } = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => api.get<Template>(`/templates/${templateId}`),
  });

  const latest = template?.versions?.[0];

  const createVersion = useMutation({
    mutationFn: () => {
      const from = latest ? `?from=${latest.id}` : "";
      return api.post<Version>(`/templates/${templateId}/versions${from}`, {});
    },
    onSuccess: (v) => {
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      nav(`/versions/${v.id}`);
    },
  });

  if (isLoading || !template) return <p className="text-slate-400">Loading…</p>;

  const base = `/${template.category?.slug}/${template.slug}`;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/categories/${template.categoryId}`} className="text-sm text-indigo-600">
          ← {template.category?.name}
        </Link>
        <h1 className="text-2xl font-bold mt-1">{template.name}</h1>
        <code className="text-xs text-slate-400">{base}</code>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-600">Versions</h2>
        <Button onClick={() => createVersion.mutate()} disabled={createVersion.isPending}>
          {latest ? "New version (clone latest)" : "Create first version"}
        </Button>
      </div>

      <div className="space-y-3">
        {(template.versions ?? []).map((v) => (
          <Card key={v.id} className="p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold">v{v.version}</span>
                <Badge color={v.status === "PUBLISHED" ? "green" : "amber"}>{v.status}</Badge>
                {v.sender && <span className="text-xs text-slate-400">via {v.sender.email}</span>}
              </div>
              <div className="text-sm text-slate-500 mt-1">{v.subject || <em>no subject</em>}</div>
              {v.status === "PUBLISHED" && (
                <code className="text-xs text-indigo-600">
                  POST {base}/v{v.version}
                </code>
              )}
            </div>
            <Link to={`/versions/${v.id}`}>
              <Button variant="ghost">Edit</Button>
            </Link>
          </Card>
        ))}
        {(template.versions ?? []).length === 0 && (
          <p className="text-slate-400">No versions yet. Create the first one.</p>
        )}
      </div>
    </div>
  );
}
