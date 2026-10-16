"use client";

/**
 * The admin Clients table.
 *
 * `"use client"` only because `DataTable`'s columns and its expanded panel are
 * JSX renderers, which cannot cross the server boundary. Every row arrives
 * mapped and formatted from the server (`lib/admin/clients.ts`); this owns the
 * columns and nothing else.
 */

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { clientSearchText, type Client } from "@/lib/admin/clients";

function ProviderBadge({ client }: { client: Client }) {
  if (client.provider === "unknown") return <span className="text-ink-soft">—</span>;
  return (
    <Badge variant={client.provider === "google" ? "provider-google" : "provider-email"}>
      {client.provider === "google" ? "Google" : "Email"}
    </Badge>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-b-0">
      <dt className="shrink-0 text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-right text-ink [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function ClientDetail({ client }: { client: Client }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-md border border-border bg-surface p-3">
        <h3 className="mb-1 text-sm font-semibold text-ink">User information</h3>
        <dl>
          <Detail label="UID" value={client.uid || "—"} />
          <Detail
            label="Email verified"
            value={client.emailVerified === null ? "—" : client.emailVerified ? "Yes" : "No"}
          />
          <Detail label="Provider" value={client.providerRaw || "—"} />
        </dl>
      </div>
      {client.agentConfigs.map((config) => (
        <div key={config.name} className="rounded-md border border-border bg-surface p-3">
          <h3 className="mb-1 text-sm font-semibold text-ink">{config.name}</h3>
          {config.fields.length === 0 ? (
            <p className="text-sm text-ink-soft">Configured, with no settings stored.</p>
          ) : (
            <dl>
              {config.fields.map((field) => (
                <Detail key={field.label} label={field.label} value={field.value} />
              ))}
            </dl>
          )}
        </div>
      ))}
      {client.agentConfigs.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-surface p-3">
          <h3 className="mb-1 text-sm font-semibold text-ink">Agents</h3>
          <p className="text-sm text-ink-soft">No agents configured by this user.</p>
        </div>
      )}
    </div>
  );
}

const COLUMNS: Column<Client>[] = [
  {
    key: "company",
    header: "Company",
    cell: (c) => (
      <div className="min-w-0">
        <p className="font-medium text-ink">{c.company || "—"}</p>
        {c.name && <p className="text-xs text-ink-soft">{c.name}</p>}
      </div>
    ),
    sortValue: (c) => (c.company || c.name).toLowerCase(),
  },
  { key: "email", header: "Email", cell: (c) => <span className="whitespace-nowrap">{c.email || "—"}</span>, sortValue: (c) => c.email },
  { key: "provider", header: "Provider", cell: (c) => <ProviderBadge client={c} />, sortValue: (c) => c.provider, secondary: true },
  { key: "created", header: "Created (IST)", cell: (c) => <span className="whitespace-nowrap">{c.createdLabel}</span>, sortValue: (c) => c.createdAt ?? 0, secondary: true },
  { key: "lastLogin", header: "Last login (IST)", cell: (c) => <span className="whitespace-nowrap">{c.lastLoginLabel}</span>, sortValue: (c) => c.lastLoginAt ?? 0, secondary: true },
  {
    key: "agents",
    header: "Agents",
    cell: (c) =>
      c.agents.length === 0 ? (
        <span className="text-ink-soft">None</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {c.agents.map((name) => (
            <Badge key={name} variant="neutral">{name}</Badge>
          ))}
        </span>
      ),
    sortValue: (c) => c.agents.length,
  },
];

export function ClientsTable({ clients }: { clients: Client[] }) {
  return (
    <DataTable
      rows={clients}
      columns={COLUMNS}
      rowKey={(c) => c.key}
      searchText={clientSearchText}
      searchPlaceholder="Search clients by company, email or name…"
      pageSize={10}
      pageSizes={[10, 25, 50]}
      initialSort={{ key: "created", direction: "desc" }}
      caption="All clients"
      expandable={{
        render: (c) => <ClientDetail client={c} />,
        rowLabel: (c) => c.company || c.email,
      }}
      empty={<p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-ink-soft">No clients found.</p>}
    />
  );
}
