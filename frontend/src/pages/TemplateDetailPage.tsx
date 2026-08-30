import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Template, Version } from "../lib/api";
import { Badge, Button, Card } from "../components/ui";

// Builds an example payload from a version's JSON Schema properties.
function exampleData(schema: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries<any>(schema?.properties ?? {})) {
    if (prop.type === "integer" || prop.type === "number") out[key] = prop.minimum ?? 1;
    else if (prop.type === "boolean") out[key] = true;
    else if (prop.format === "url") out[key] = "https://example.com/...";
    else out[key] = prop.description ?? "text";
  }
  return out;
}

function SendDocs({ version, base }: { version: Version; base: string }) {
  const url = `${window.location.origin}${base}/v${version.version}`;
  const required: string[] = version.jsonSchema?.required ?? [];
  const props = Object.entries<any>(version.jsonSchema?.properties ?? {});
  const body = { to: "user@example.com", data: exampleData(version.jsonSchema) };

  const curl = [
    `curl -X POST ${url} \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "x-api-key: es_xxxx_xxxxxxxxxxxx" \\`,
    `  -d '${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}'`,
  ].join("\n");

  return (
    <Card className="p-4 space-y-4">
      <h2 className="font-semibold text-slate-600">How to send (v{version.version})</h2>
      <p className="text-sm text-slate-500">
        Authenticate with an <Link to="/api-keys" className="text-indigo-600">API key</Link> belonging
        to this template's sender, via the <code>x-api-key</code> header (or{" "}
        <code>Authorization: Bearer</code>). The key identifies the sender, so slugs only need to be
        unique within it.
        <code className="ml-1">to</code> accepts a string or an array of emails.
      </p>

      <pre className="bg-slate-900 text-slate-100 text-xs rounded p-3 overflow-x-auto">{curl}</pre>

      {props.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-1">data parameters</h3>
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="pr-4 font-medium">name</th>
                <th className="pr-4 font-medium">type</th>
                <th className="pr-4 font-medium">required</th>
                <th className="font-medium">description</th>
              </tr>
            </thead>
            <tbody>
              {props.map(([name, p]) => (
                <tr key={name} className="border-t border-slate-100">
                  <td className="pr-4 py-1 font-mono">{name}</td>
                  <td className="pr-4 py-1">{p.type ?? "any"}{p.format ? ` (${p.format})` : ""}</td>
                  <td className="pr-4 py-1">{required.includes(name) ? "yes" : "no"}</td>
                  <td className="py-1 text-slate-500">{p.description ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-slate-600 mb-1">Response — 200</h3>
        <pre className="bg-slate-50 text-xs rounded p-3 overflow-x-auto">{JSON.stringify(
          {
            ok: true,
            messageId: "0100019...-...",
            dryRun: false,
            to: "user@example.com",
            subject: version.subject || "...",
          },
          null,
          2
        )}</pre>
        <p className="text-xs text-slate-500 mt-2">
          Errors: <code>401 invalid_api_key</code>, <code>403 template_not_authorized</code>,{" "}
          <code>404 email_version_not_found</code>, <code>409 version_not_published</code>,{" "}
          <code>422 validation_error</code> (with <code>issues</code>). All as{" "}
          <code>{'{ "error": "...", "details": ... }'}</code>.
        </p>
      </div>
    </Card>
  );
}

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

  const deleteVersion = useMutation({
    mutationFn: (id: string) => api.del(`/versions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["template", templateId] }),
  });

  function confirmDelete(v: Version) {
    const warning =
      v.status === "PUBLISHED"
        ? `Delete PUBLISHED version v${v.version}? Services calling POST ${base}/v${v.version} will start getting 404s. This cannot be undone.`
        : `Delete draft version v${v.version}? This cannot be undone.`;
    if (window.confirm(warning)) deleteVersion.mutate(v.id);
  }

  if (isLoading || !template) return <p className="text-slate-400">Loading…</p>;

  const base = `/${template.category?.slug}/${template.slug}`;
  // Document the newest published version; fall back to the newest draft.
  const docsVersion = (template.versions ?? []).find((v) => v.status === "PUBLISHED") ?? latest;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/senders/${template.category?.senderId}`} className="text-sm text-indigo-600">
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
              </div>
              <div className="text-sm text-slate-500 mt-1">{v.subject || <em>no subject</em>}</div>
              {v.status === "PUBLISHED" && (
                <code className="text-xs text-indigo-600">
                  POST {base}/v{v.version}
                </code>
              )}
            </div>
            <div className="flex gap-2">
              <Link to={`/versions/${v.id}`}>
                <Button variant="ghost">Edit</Button>
              </Link>
              <Button variant="danger" onClick={() => confirmDelete(v)} disabled={deleteVersion.isPending}>
                Delete
              </Button>
            </div>
          </Card>
        ))}
        {(template.versions ?? []).length === 0 && (
          <p className="text-slate-400">No versions yet. Create the first one.</p>
        )}
      </div>

      {docsVersion && <SendDocs version={docsVersion} base={base} />}
    </div>
  );
}
