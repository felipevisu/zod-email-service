import { Button, Input } from "./ui";

// A flat field used by the editor UI.
export type SchemaField = {
  key: string;
  type: "string" | "integer" | "number" | "boolean";
  format?: "" | "email" | "url" | "uuid" | "date-time";
  required: boolean;
  description?: string;
};

export type JsonSchema = {
  type: "object";
  additionalProperties: false;
  required: string[];
  properties: Record<string, any>;
};

export function schemaToFields(schema: any): SchemaField[] {
  const props = schema?.properties ?? {};
  const required: string[] = schema?.required ?? [];
  return Object.entries(props).map(([key, p]: [string, any]) => ({
    key,
    type: p.type ?? "string",
    format: p.format ?? "",
    required: required.includes(key),
    description: p.description ?? "",
  }));
}

export function fieldsToSchema(fields: SchemaField[]): JsonSchema {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const f of fields) {
    if (!f.key) continue;
    const p: any = { type: f.type };
    if (f.type === "string" && f.format) p.format = f.format;
    if (f.description) p.description = f.description;
    properties[f.key] = p;
    if (f.required) required.push(f.key);
  }
  return { type: "object", additionalProperties: false, required, properties };
}

export function SchemaBuilder({
  fields,
  onChange,
}: {
  fields: SchemaField[];
  onChange: (f: SchemaField[]) => void;
}) {
  const update = (i: number, patch: Partial<SchemaField>) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(fields.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...fields, { key: "", type: "string", format: "", required: true, description: "" }]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_120px_120px_70px_32px] gap-2 text-xs font-medium text-slate-400 px-1">
        <span>Parameter</span>
        <span>Type</span>
        <span>Format</span>
        <span>Required</span>
        <span />
      </div>
      {fields.map((f, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_120px_70px_32px] gap-2 items-center">
          <Input
            placeholder="name"
            value={f.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <select
            className="border rounded-md px-2 py-2 text-sm"
            value={f.type}
            onChange={(e) => update(i, { type: e.target.value as SchemaField["type"] })}
          >
            <option value="string">string</option>
            <option value="integer">integer</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
          </select>
          <select
            className="border rounded-md px-2 py-2 text-sm disabled:opacity-40"
            value={f.format}
            disabled={f.type !== "string"}
            onChange={(e) => update(i, { format: e.target.value as SchemaField["format"] })}
          >
            <option value="">—</option>
            <option value="email">email</option>
            <option value="url">url</option>
            <option value="uuid">uuid</option>
            <option value="date-time">date-time</option>
          </select>
          <input
            type="checkbox"
            className="h-4 w-4 mx-auto"
            checked={f.required}
            onChange={(e) => update(i, { required: e.target.checked })}
          />
          <button
            onClick={() => remove(i)}
            className="text-slate-400 hover:text-red-600 text-lg leading-none"
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={add}>
        + Add parameter
      </Button>
    </div>
  );
}
