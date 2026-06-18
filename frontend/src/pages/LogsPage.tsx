import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, EmailLog, LogStats, LogsResponse } from "../lib/api";
import { Badge, Button, Card, Input } from "../components/ui";

const PAGE = 50;

type StatusFilter = "" | "SENT" | "FAILED";

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card className="p-4 flex-1">
      <div className={`text-2xl font-bold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
    </Card>
  );
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString();
}

function LogRow({ log }: { log: EmailLog }) {
  const [open, setOpen] = useState(false);
  const failed = log.status === "FAILED";
  return (
    <Card className="p-3">
      <button className="w-full flex items-start gap-3 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="pt-0.5">
          {failed ? <Badge color="red">FAILED</Badge> : <Badge color="green">SENT</Badge>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{log.subject || <span className="text-slate-400">(no subject)</span>}</div>
          <div className="text-xs text-slate-500 truncate">
            {log.to.join(", ") || <span className="text-slate-400">(no recipient)</span>}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {log.category}/{log.template}/v{log.version}
            {log.senderEmail ? ` · ${log.senderEmail}` : ""}
            {log.dryRun ? " · dry-run" : ""}
          </div>
          {failed && log.errorCode && (
            <div className="text-xs text-red-600 mt-0.5">{log.errorCode}</div>
          )}
        </div>
        <div className="text-xs text-slate-400 whitespace-nowrap">{fmt(log.createdAt)}</div>
      </button>
      {open && (
        <div className="mt-3 border-t pt-3 text-xs space-y-1 text-slate-600">
          {log.messageId && (
            <div>
              <span className="text-slate-400">Message ID: </span>
              <span className="font-mono">{log.messageId}</span>
            </div>
          )}
          {log.errorDetail && (
            <div>
              <span className="text-slate-400">Error detail:</span>
              <pre className="mt-1 bg-slate-50 border rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {log.errorDetail}
              </pre>
            </div>
          )}
          <div>
            <span className="text-slate-400">Recipients: </span>
            {log.to.join(", ") || "—"}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function LogsPage() {
  const [status, setStatus] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState(""); // yyyy-mm-dd
  const [to, setTo] = useState(""); // yyyy-mm-dd
  const [page, setPage] = useState(0);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (search) params.set("search", search);
  if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
  if (to) params.set("to", new Date(`${to}T23:59:59.999`).toISOString());
  params.set("take", String(PAGE));
  params.set("skip", String(page * PAGE));

  const { data: stats } = useQuery({
    queryKey: ["log-stats"],
    queryFn: () => api.get<LogStats>("/logs/stats"),
    refetchInterval: 10_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["logs", status, search, from, to, page],
    queryFn: () => api.get<LogsResponse>(`/logs?${params.toString()}`),
    refetchInterval: 10_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.ceil(total / PAGE);

  const tab = (value: StatusFilter, label: string) => (
    <button
      onClick={() => {
        setStatus(value);
        setPage(0);
      }}
      className={`px-3 py-1.5 rounded-md text-sm font-medium ${
        status === value ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email log</h1>
        <p className="text-sm text-slate-500">Every send attempt through the public API, including failures.</p>
      </div>

      <div className="flex gap-3">
        <StatCard label="Total" value={stats?.total ?? 0} color="text-slate-800" />
        <StatCard label="Sent" value={stats?.sent ?? 0} color="text-green-600" />
        <StatCard label="Failed" value={stats?.failed ?? 0} color="text-red-600" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {tab("", "All")}
          {tab("SENT", "Sent")}
          {tab("FAILED", "Failed")}
        </div>
        <div className="flex-1 min-w-[220px]">
          <Input
            placeholder="Search subject or recipient…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-auto"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
          <span className="text-slate-400 text-sm">→</span>
          <Input
            type="date"
            className="w-auto"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
          {(from || to) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFrom("");
                setTo("");
                setPage(0);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-slate-400">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400">No emails logged yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
