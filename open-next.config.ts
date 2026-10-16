import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults: no shared incremental cache is configured, so `unstable_cache`
// (lib/data/analysis-cache.ts) does not persist between requests on
// Cloudflare — every read goes to the backend, which is correct, just slower.
// Add an R2 incremental cache here if that ever needs to change.
export default defineCloudflareConfig();
