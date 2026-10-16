import type { Metadata } from "next";
import { Suspense } from "react";
import { Key, LockKey, PlugsConnected } from "@phosphor-icons/react/ssr";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { PageLoading } from "@/components/ui/page-loading";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { ActionResult, ReadFailed, param } from "@/components/admin/admin-ui";
import { ApiKeyEditor } from "@/components/admin/api-key-editor";
import { requirePermission } from "@/lib/admin/access";
import { getAdminRepo } from "@/lib/data/admin-repo";
import { mapApiKeys } from "@/lib/admin/api-keys";
import { testN8nConnection } from "../actions";

export const metadata: Metadata = { title: "API keys · Admin · LeadByte" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function AdminApiKeysPage({ searchParams }: { searchParams: Params }) {
  return (
    <Suspense fallback={<PageLoading title="API keys" />}>
      <ApiKeysBody searchParams={searchParams} />
    </Suspense>
  );
}

async function ApiKeysBody({ searchParams }: { searchParams: Params }) {
  // Super admin only — the backend refuses anyone else too, but the page
  // should not render cards someone cannot use.
  await requirePermission("api_keys", "read");
  const params = await searchParams;
  const read = await getAdminRepo().apiKeys();
  const keys = mapApiKeys(read.rows);

  return (
    <PageContainer width="reading">
      <PageHeader
        title="API keys"
        description="The service keys n8n workflows run on. Values are never shown — only the last four characters."
        actions={
          <form action={testN8nConnection}>
            <SubmitButton
              pendingLabel="Testing…"
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-surface-raised"
            >
              <PlugsConnected aria-hidden="true" className="size-4" />
              Test n8n connection
            </SubmitButton>
          </form>
        }
      />
      <ActionResult notice={param(params, "notice")} error={param(params, "error")} />
      {!read.ok && <ReadFailed what="the API key list" />}

      <ul className="grid gap-4 sm:grid-cols-2">
        {keys.map((key) => {
          const KeyIcon = key.isMaster ? LockKey : Key;
          return (
            <li
              key={key.key}
              className={`flex flex-col gap-3 rounded-lg border bg-surface p-4 ${key.isMaster ? "border-accent/40" : "border-border"}`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`flex size-9 shrink-0 items-center justify-center rounded-md ${
                    key.isMaster ? "bg-accent-soft text-accent-ink" : "bg-surface-raised text-ink-soft"
                  }`}
                >
                  <KeyIcon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                    {key.label}
                    {!key.isMaster && key.hasValue && (
                      <Badge variant={key.synced ? "issue-cleared" : "issue-open"}>
                        {key.synced ? "Synced to n8n" : "Not synced"}
                      </Badge>
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-soft">{key.description}</p>
                </div>
              </div>

              <div className="rounded-md bg-ground px-3 py-2">
                <p className="font-mono text-sm text-ink">{key.hasValue && key.masked ? key.masked : "Not set"}</p>
                {key.updatedLabel && (
                  <p className="mt-0.5 text-xs text-ink-soft">
                    Updated {key.updatedLabel} IST{key.updatedBy ? ` by ${key.updatedBy}` : ""}
                  </p>
                )}
              </div>

              <ApiKeyEditor keyName={key.key} label={key.label} hasValue={key.hasValue} />
            </li>
          );
        })}
      </ul>
    </PageContainer>
  );
}
