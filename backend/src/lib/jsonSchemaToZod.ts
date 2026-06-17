import { z, ZodTypeAny } from "zod";

/**
 * Converts a JSON Schema subset into a Zod schema at runtime.
 * No eval, no codegen. Supported keywords:
 *   - type: object | string | number | integer | boolean | array
 *   - properties, required (for objects)
 *   - items (for arrays)
 *   - enum
 *   - format: "email" | "url" | "uuid" | "date-time" (for strings)
 *   - minimum / maximum (numbers), minLength / maxLength (strings)
 *   - description
 *   - nullable
 */
export type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: (string | number)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
  nullable?: boolean;
  additionalProperties?: boolean;
};

function leaf(schema: JsonSchema): ZodTypeAny {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const values = schema.enum.map(String) as [string, ...string[]];
    return z.enum(values);
  }

  switch (schema.type) {
    case "string": {
      let s = z.string();
      if (schema.format === "email") s = s.email();
      else if (schema.format === "url") s = s.url();
      else if (schema.format === "uuid") s = s.uuid();
      else if (schema.format === "date-time") s = s.datetime();
      if (typeof schema.minLength === "number") s = s.min(schema.minLength);
      if (typeof schema.maxLength === "number") s = s.max(schema.maxLength);
      return s;
    }
    case "integer":
    case "number": {
      let n = z.number();
      if (schema.type === "integer") n = n.int();
      if (typeof schema.minimum === "number") n = n.min(schema.minimum);
      if (typeof schema.maximum === "number") n = n.max(schema.maximum);
      return n;
    }
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(schema.items ? jsonSchemaToZod(schema.items) : z.any());
    case "object":
      return objectSchema(schema);
    default:
      return z.any();
  }
}

function objectSchema(schema: JsonSchema): ZodTypeAny {
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const shape: Record<string, ZodTypeAny> = {};

  for (const [key, propSchema] of Object.entries(props)) {
    let field = jsonSchemaToZod(propSchema);
    if (propSchema.description) field = field.describe(propSchema.description);
    if (!required.has(key)) field = field.optional();
    shape[key] = field;
  }

  const obj = z.object(shape);
  return schema.additionalProperties === false ? obj.strict() : obj;
}

export function jsonSchemaToZod(schema: JsonSchema): ZodTypeAny {
  let result = schema.type === "object" ? objectSchema(schema) : leaf(schema);
  if (schema.nullable) result = result.nullable();
  return result;
}
