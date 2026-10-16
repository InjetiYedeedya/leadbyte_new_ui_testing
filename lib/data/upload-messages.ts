/**
 * Upload wording shared by the server (`uploads.ts`, the upload-url route)
 * and the uploaders in the browser. Its own module because `uploads.ts`
 * reaches the API client, which a client component must never import.
 */

/** What an upload says when the backend no longer accepts this login. */
export const SIGN_IN_AGAIN =
  "Your sign-in has expired, so the file couldn't be uploaded. Sign in again, then add it.";
