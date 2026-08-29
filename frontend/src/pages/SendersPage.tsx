import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Sender, SenderProvider } from "../lib/api";
import { Badge, Button, Card, Field, Input } from "../components/ui";

export default function SendersPage() {
  const qc = useQueryClient();
  const { data: senders = [], isLoading } = useQuery({
    queryKey: ["senders"],
    queryFn: () => api.get<Sender[]>("/senders"),
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<SenderProvider>("SES");
  const [region, setRegion] = useState("us-east-1");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [apiKey, setApiKey] = useState("");

  const hasCreds = provider === "SES" ? accessKeyId && secretAccessKey : apiKey;

  const create = useMutation({
    mutationFn: () =>
      api.post<Sender>("/senders", {
        name,
        email,
        provider,
        region,
        credentials: !hasCreds
          ? null
          : provider === "SES"
            ? { accessKeyId, secretAccessKey }
            : { apiKey },
      }),
    onSuccess: () => {
      setName("");
      setEmail("");
      setAccessKeyId("");
      setSecretAccessKey("");
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["senders"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/senders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["senders"] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Senders</h1>
      <p className="text-sm text-slate-500">
        SES senders must be verified identities in their region. Resend senders need a verified
        domain in Resend. Credentials are stored encrypted; without them, SES falls back to the
        server&apos;s AWS credential chain.
      </p>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 text-sm text-slate-600">Add sender</h2>
        <div className="flex gap-3 items-end flex-wrap">
          <div className="w-40">
            <Field label="Name">
              <Input placeholder="Acme" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="flex-1 min-w-[220px]">
            <Field label="Email">
              <Input
                placeholder="no-reply@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>
          <div className="w-36">
            <Field label="Provider">
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value as SenderProvider)}
              >
                <option value="SES">AWS SES</option>
                <option value="RESEND">Resend</option>
              </select>
            </Field>
          </div>
          {provider === "SES" && (
            <div className="w-40">
              <Field label="Region">
                <Input value={region} onChange={(e) => setRegion(e.target.value)} />
              </Field>
            </div>
          )}
        </div>
        <div className="flex gap-3 items-end flex-wrap mt-3">
          {provider === "SES" ? (
            <>
              <div className="w-64">
                <Field label="Access key ID (optional)">
                  <Input
                    placeholder="AKIA…"
                    value={accessKeyId}
                    onChange={(e) => setAccessKeyId(e.target.value)}
                  />
                </Field>
              </div>
              <div className="flex-1 min-w-[220px]">
                <Field label="Secret access key">
                  <Input
                    type="password"
                    value={secretAccessKey}
                    onChange={(e) => setSecretAccessKey(e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <div className="flex-1 min-w-[280px]">
              <Field label="Resend API key">
                <Input
                  type="password"
                  placeholder="re_…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </Field>
            </div>
          )}
          <Button
            onClick={() => create.mutate()}
            disabled={!name || !email || (provider === "RESEND" && !apiKey) || create.isPending}
          >
            Add
          </Button>
        </div>
        {create.isError && <p className="text-red-600 text-sm mt-2">{(create.error as Error).message}</p>}
      </Card>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {senders.map((s) => (
            <Card key={s.id} className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge color={s.provider === "RESEND" ? "purple" : "blue"}>{s.provider}</Badge>
                <span className="font-semibold">{s.name}</span>{" "}
                <span className="text-slate-500">&lt;{s.email}&gt;</span>
                {s.provider === "SES" && <span className="text-xs text-slate-400">{s.region}</span>}
                {s.hasCredentials ? (
                  <Badge color="green">credentials set</Badge>
                ) : (
                  <span className="text-xs text-slate-400">no credentials</span>
                )}
              </div>
              <Button variant="danger" onClick={() => remove.mutate(s.id)}>
                Delete
              </Button>
            </Card>
          ))}
          {senders.length === 0 && <p className="text-slate-400">No senders yet.</p>}
        </div>
      )}
    </div>
  );
}
