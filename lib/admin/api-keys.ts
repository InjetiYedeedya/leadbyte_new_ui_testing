import { formatDateTime, pick, pickString, type Row } from "./fields";

/**
 * The service keys n8n's workflows run on, managed by the super admin.
 *
 * The backend stores them in `leadbyte_api_keys` and returns only a masked
 * tail — the full value never comes back to us, and a new one travels
 * browser → Server Action → Lambda once and is not kept anywhere on the way.
 */

export interface ApiKeyDefinition {
  key: "n8n_api_key" | "openai" | "claude" | "ahrefs";
  label: string;
  description: string;
  /** The n8n key is what the others are synced WITH, so it is never "synced". */
  isMaster: boolean;
}

export const API_KEY_DEFINITIONS: readonly ApiKeyDefinition[] = [
  {
    key: "n8n_api_key",
    label: "n8n API key",
    description: "Master key used to update the credentials below inside n8n.",
    isMaster: true,
  },
  {
    key: "openai",
    label: "OpenAI API key",
    description: "Used by AI workflows. Saved here, then synced to n8n.",
    isMaster: false,
  },
  {
    key: "claude",
    label: "Claude API key",
    description: "Used by AI workflows. Saved here, then synced to n8n.",
    isMaster: false,
  },
  {
    key: "ahrefs",
    label: "Ahrefs API key",
    description: "Used by SEO workflows. Synced to n8n as a header credential.",
    isMaster: false,
  },
];

export function isApiKeyName(value: string): value is ApiKeyDefinition["key"] {
  return API_KEY_DEFINITIONS.some((definition) => definition.key === value);
}

export interface ApiKeyStatus extends ApiKeyDefinition {
  hasValue: boolean;
  /** "••••••••1a2b" — only ever the tail the backend chose to send. */
  masked: string;
  updatedLabel: string;
  updatedBy: string;
  synced: boolean;
}

export function mapApiKeys(rows: readonly Row[]): ApiKeyStatus[] {
  return API_KEY_DEFINITIONS.map((definition) => {
    const row = rows.find((candidate) => pickString(candidate, "key_name") === definition.key);
    const updated = row ? pick(row, "updated_at") : undefined;
    return {
      ...definition,
      hasValue: row?.has_value === true,
      masked: row ? pickString(row, "masked_value") : "",
      updatedLabel: updated === undefined ? "" : formatDateTime(updated),
      updatedBy: row ? pickString(row, "updated_by") : "",
      synced: row?.synced_to_n8n === true,
    };
  });
}
