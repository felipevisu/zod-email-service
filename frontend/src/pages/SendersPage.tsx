import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Sender } from "../lib/api";
import { Button, Card, Field, Input } from "../components/ui";

export default function SendersPage() {
  const qc = useQueryClient();
  const { data: senders = [], isLoading } = useQuery({
    queryKey: ["senders"],
    queryFn: () => api.get<Sender[]>("/senders"),
  });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [region, setRegion] = useState("us-east-1");

  const create = useMutation({
    mutationFn: () => api.post<Sender>("/senders", { name, email, region }),
    onSuccess: () => {
      setName("");
      setEmail("");
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
        Each sender must be a verified identity in AWS SES for its region.
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
          <div className="w-40">
            <Field label="Region">
              <Input value={region} onChange={(e) => setRegion(e.target.value)} />
            </Field>
          </div>
          <Button onClick={() => create.mutate()} disabled={!name || !email || create.isPending}>
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
              <div>
                <span className="font-semibold">{s.name}</span>{" "}
                <span className="text-slate-500">&lt;{s.email}&gt;</span>
                <span className="text-xs text-slate-400 ml-2">{s.region}</span>
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
