import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { ReadFailed } from "@/components/admin/admin-ui";
import { ClientsTable } from "@/components/admin/clients-table";
import { requirePermission } from "@/lib/admin/access";
import { loadClients } from "@/lib/admin/data";
import { countOf } from "@/lib/format";

export const metadata: Metadata = { title: "Clients · Admin · LeadByte" };

export default function AdminClientsPage() {
  return (
    <Suspense fallback={<PageLoading title="Clients" />}>
      <ClientsBody />
    </Suspense>
  );
}

async function ClientsBody() {
  await requirePermission("clients", "read");
  const { clients, ok } = await loadClients();
  return (
    <PageContainer>
      <PageHeader title="Clients" description={countOf(clients.length, "client")} />
      {!ok && <ReadFailed what="the client list" />}
      <ClientsTable clients={clients} />
    </PageContainer>
  );
}
