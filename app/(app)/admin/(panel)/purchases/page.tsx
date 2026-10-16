import type { Metadata } from "next";
import { Suspense } from "react";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { AdminStat, FilterPills, ReadFailed, param } from "@/components/admin/admin-ui";
import { PurchasesTable } from "@/components/admin/purchases-table";
import { requirePermission } from "@/lib/admin/access";
import { loadClients, scanTable } from "@/lib/admin/data";
import { ADMIN_TABLES } from "@/lib/admin/tables";
import { buildPurchases, filterPurchases, readPurchaseFilter } from "@/lib/admin/purchases";
import { formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Purchases · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminPurchasesPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="Purchases" />}>
      <PurchasesBody searchParams={searchParams} />
    </Suspense>
  );
}

async function PurchasesBody({ searchParams }: { searchParams: Params }) {
  await requirePermission("purchases", "read");
  const params = await searchParams;
  const [{ userRows, ok }, orders, details] = await Promise.all([
    loadClients(),
    scanTable(ADMIN_TABLES.orders),
    scanTable(ADMIN_TABLES.overallDetails),
  ]);
  const data = buildPurchases(userRows, orders.rows, details.rows);
  const filter = readPurchaseFilter(param(params, "filter"));
  const shown = filterPurchases(data.rows, filter);

  return (
    <PageContainer>
      <PageHeader title="Purchases" description="Who has bought, or been granted, which agents." />
      {!ok && <ReadFailed what="the users table" />}
      {!orders.ok && <ReadFailed what="orders" />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStat label="Total users" value={formatCount(data.totalUsers)} />
        <AdminStat label="Purchased" value={formatCount(data.purchased)} tone="good" note="A completed order, or an active grant" />
        <AdminStat label="Not purchased" value={formatCount(data.notPurchased)} />
        <AdminStat label="Total orders" value={orders.ok ? formatCount(data.totalOrders) : "—"} note="Completed orders only" />
      </div>

      <FilterPills
        label="Purchase status"
        options={[
          { id: "all", label: "All users", count: data.totalUsers },
          { id: "purchased", label: "Purchased", count: data.purchased },
          { id: "not-purchased", label: "Not purchased", count: data.notPurchased },
        ]}
        active={filter}
        hrefFor={(id) => (id === "all" ? "/admin/purchases" : `/admin/purchases?filter=${id}`)}
      />

      <PurchasesTable rows={shown} filtered={filter !== "all"} />
    </PageContainer>
  );
}
