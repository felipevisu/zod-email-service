import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Sender, SenderProvider } from "../lib/api";
import { Badge, Button, Card, Field, Input, Modal } from "../components/ui";

function SenderModal({ sender, onClose }: { sender: Sender | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = sender != null;

  const [name, setName] = useState(sender?.name ?? "");
  const [email, setEmail] = useState(sender?.email ?? "");
  const [provider, setProvider] = useState<SenderProvider>(sender?.provider ?? "SES");
  const [region, setRegion] = useState(sender?.region ?? "us-east-1");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [apiKey, setApiKey] = useState("");

  const credsFilled = provider === "SES" ? Boolean(accessKeyId && secretAccessKey) : Boolean(apiKey);

  const save = useMutation({
    mutationFn: () => {
      const credentials = credsFilled
        ? provider === "SES"
          ? { accessKeyId, secretAccessKey }
          : { apiKey }
        : editing
          ? undefined // untouched -> keep stored credentials
          : null;
      const body = { name, email, provider, region, credentials };
      return editing ? api.put<Sender>(`/senders/${sender.id}`, body) : api.post<Sender>("/senders", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["senders"] });
      onClose();
    },
  });

  return (
    <Modal title={editing ? "Edit sender" : "Add sender"} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="w-40">
            <Field label="Name">
              <Input placeholder="Acme" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Email">
              <Input
                placeholder="no-reply@acme.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-40">
            <Field label="Provider">
              <select
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
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

        {provider === "SES" ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <Field label="Access key ID">
                <Input placeholder="AKIA…" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} />
              </Field>
            </div>
            <div className="flex-1">
              <Field label="Secret access key">
                <Input type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} />
              </Field>
            </div>
          </div>
        ) : (
          <Field label="Resend API key">
            <Input type="password" placeholder="re_…" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
        )}
        <p className="text-xs text-slate-400">
          {editing
            ? sender.hasCredentials
              ? "Leave credential fields blank to keep the stored credentials."
              : "No credentials stored yet."
            : "Credentials are stored encrypted. SES senders may leave them blank to use the server's AWS credential chain."}
        </p>

        {save.isError && <p className="text-red-600 text-sm">{(save.error as Error).message}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!name || !email || (!editing && provider === "RESEND" && !apiKey) || save.isPending}
          >
            {editing ? "Save" : "Add"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function SendersPage() {
  const qc = useQueryClient();
  const { data: senders = [], isLoading } = useQuery({
    queryKey: ["senders"],
    queryFn: () => api.get<Sender[]>("/senders"),
  });

  // null = closed; "new" = create; Sender = edit.
  const [modal, setModal] = useState<Sender | "new" | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/senders/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["senders"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Senders</h1>
        <Button onClick={() => setModal("new")}>Add sender</Button>
      </div>
      <p className="text-sm text-slate-500">
        SES senders must be verified identities in their region. Resend senders need a verified
        domain in Resend.
      </p>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {senders.map((s) => (
            <Card key={s.id} className="p-3 flex items-center justify-between hover:border-indigo-400 transition">
              <Link to={`/senders/${s.id}`} className="flex items-center gap-2 flex-1 min-w-0">
                <Badge color={s.provider === "RESEND" ? "purple" : "blue"}>{s.provider}</Badge>
                <span className="font-semibold">{s.name}</span>{" "}
                <span className="text-slate-500">&lt;{s.email}&gt;</span>
                {s.provider === "SES" && <span className="text-xs text-slate-400">{s.region}</span>}
                {s.hasCredentials ? (
                  <Badge color="green">credentials set</Badge>
                ) : (
                  <span className="text-xs text-slate-400">no credentials</span>
                )}
              </Link>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setModal(s)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => remove.mutate(s.id)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
          {senders.length === 0 && <p className="text-slate-400">No senders yet.</p>}
        </div>
      )}

      {modal !== null && (
        <SenderModal
          key={modal === "new" ? "new" : modal.id}
          sender={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
