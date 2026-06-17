import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, RenderResult, Sender, Version } from "../lib/api";
import { Badge, Button, Card, Field, Input } from "../components/ui";
import {
  SchemaBuilder,
  SchemaField,
  fieldsToSchema,
  schemaToFields,
} from "../components/SchemaBuilder";

// Build a plausible sample value per field type so preview has something to render.
function sampleFor(f: SchemaField): unknown {
  if (f.type === "integer" || f.type === "number") return 30;
  if (f.type === "boolean") return true;
  if (f.format === "email") return "user@example.com";
  if (f.format === "url") return "https://example.com/reset?token=abc";
  if (f.format === "uuid") return "00000000-0000-0000-0000-000000000000";
  if (f.format === "date-time") return "2026-01-01T12:00:00Z";
  return `sample ${f.key}`;
}

export default function VersionEditorPage() {
  const { versionId = "" } = useParams();
  const qc = useQueryClient();

  const { data: version, isLoading } = useQuery({
    queryKey: ["version", versionId],
    queryFn: () => api.get<Version>(`/versions/${versionId}`),
  });
  const { data: senders = [] } = useQuery({
    queryKey: ["senders"],
    queryFn: () => api.get<Sender[]>("/senders"),
  });

  const [subject, setSubject] = useState("");
  const [mjml, setMjml] = useState("");
  const [senderId, setSenderId] = useState<string | null>(null);
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [sampleData, setSampleData] = useState("{}");
  const [preview, setPreview] = useState<RenderResult | null>(null);

  // Subject/MJML/sender stay editable after publish; only the schema is frozen.
  const schemaLocked = version?.status === "PUBLISHED";
  const isPublished = version?.status === "PUBLISHED";

  useEffect(() => {
    if (!version) return;
    setSubject(version.subject);
    setMjml(version.mjml);
    setSenderId(version.senderId);
    const f = schemaToFields(version.jsonSchema);
    setFields(f);
    const sample: Record<string, unknown> = {};
    for (const fld of f) if (fld.key) sample[fld.key] = sampleFor(fld);
    setSampleData(JSON.stringify(sample, null, 2));
  }, [version]);

  const jsonSchema = useMemo(() => fieldsToSchema(fields), [fields]);

  const save = useMutation({
    mutationFn: () =>
      api.put<Version>(`/versions/${versionId}`, {
        subject,
        mjml,
        senderId,
        // Omit the schema when frozen: the builder is lossy (drops min/max etc.),
        // so resending a rebuilt schema would falsely read as a schema change.
        ...(schemaLocked ? {} : { jsonSchema }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["version", versionId] }),
  });

  const publish = useMutation({
    mutationFn: () => api.post<Version>(`/versions/${versionId}/publish`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["version", versionId] }),
  });

  const doPreview = useMutation({
    mutationFn: () => {
      let data: unknown = {};
      try {
        data = JSON.parse(sampleData);
      } catch {
        throw new Error("Sample data is not valid JSON");
      }
      return api.post<RenderResult>(`/versions/${versionId}/preview`, { data });
    },
    onSuccess: (r) => setPreview(r),
  });

  if (isLoading || !version) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <Link to={`/templates/${version.templateId}`} className="text-sm text-indigo-600">
            ← {version.template?.name}
          </Link>
          <h1 className="text-2xl font-bold mt-1 flex items-center gap-2">
            v{version.version}
            <Badge color={isPublished ? "green" : "amber"}>{version.status}</Badge>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : isPublished ? "Save changes" : "Save draft"}
          </Button>
          {!isPublished && (
            <Button onClick={() => publish.mutate()} disabled={publish.isPending || !senderId}>
              Publish
            </Button>
          )}
        </div>
      </div>

      {isPublished && (
        <Card className="p-3 bg-green-50 border-green-200 text-sm text-green-800">
          Published. Sender, subject and MJML are editable; the schema is frozen — clone into
          a new version to change parameters.
        </Card>
      )}
      {publish.isError && <p className="text-red-600 text-sm">{(publish.error as Error).message}</p>}
      {save.isError && <p className="text-red-600 text-sm">{(save.error as Error).message}</p>}

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Left: definition */}
        <div className="space-y-5">
          <Card className="p-4 space-y-3">
            <Field label="Sender (AWS SES identity)">
              <select
                className="w-full border rounded-md px-3 py-2 text-sm disabled:bg-slate-100"
                value={senderId ?? ""}
                onChange={(e) => setSenderId(e.target.value || null)}
              >
                <option value="">— choose sender —</option>
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject (Handlebars)">
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Reset your password, {{name}}"
              />
            </Field>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-slate-600">
                Schema registry — render parameters
              </h3>
              {schemaLocked && <Badge color="green">frozen</Badge>}
            </div>
            {schemaLocked ? (
              <pre className="text-xs bg-slate-50 p-3 rounded overflow-auto">
                {JSON.stringify(jsonSchema, null, 2)}
              </pre>
            ) : (
              <SchemaBuilder fields={fields} onChange={setFields} />
            )}
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold text-sm text-slate-600 mb-2">MJML source</h3>
            <textarea
              value={mjml}
              onChange={(e) => setMjml(e.target.value)}
              spellCheck={false}
              className="w-full h-72 font-mono text-xs border rounded-md p-3"
              placeholder="<mjml> … </mjml>"
            />
          </Card>
        </div>

        {/* Right: preview */}
        <div className="space-y-5">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm text-slate-600">Sample data (JSON)</h3>
              <Button variant="ghost" onClick={() => doPreview.mutate()} disabled={doPreview.isPending}>
                {doPreview.isPending ? "Rendering…" : "Render preview"}
              </Button>
            </div>
            <textarea
              value={sampleData}
              onChange={(e) => setSampleData(e.target.value)}
              spellCheck={false}
              className="w-full h-32 font-mono text-xs border rounded-md p-3"
            />
            {doPreview.isError && (
              <p className="text-red-600 text-sm mt-2">{(doPreview.error as Error).message}</p>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="font-semibold text-sm text-slate-600 mb-2">Preview</h3>
            {preview ? (
              <>
                <div className="text-xs text-slate-500 mb-2">
                  Subject: <span className="font-medium text-slate-700">{preview.subject}</span>
                </div>
                {preview.errors.length > 0 && (
                  <pre className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-2">
                    {preview.errors.join("\n")}
                  </pre>
                )}
                <iframe
                  title="preview"
                  srcDoc={preview.html}
                  className="w-full h-[480px] border rounded bg-white"
                />
              </>
            ) : (
              <p className="text-slate-400 text-sm">Render to see the email.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
