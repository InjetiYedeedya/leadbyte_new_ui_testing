/**
 * One finished AEO audit, as a report.
 *
 * A Server Component: it renders a payload the page already read, and there is
 * nothing on it to interact with beyond disclosures, which `<details>` does
 * without React. The only client thing it reaches for is `PageSections`, an
 * island that takes server-rendered nodes as props.
 *
 * ## The fixes, and what they are not
 *
 * Layer 2 (`fixes`) is shown inside the page list, each page opening onto the
 * fixes written for it, so there is one inventory of pages rather than two.
 * Layer 3 (`deployment`, `surfaces`) is shown as the routes the fixes COULD
 * take and the score each could reach — a preview. Nothing here pushes to the
 * customer's site, and the card says so in as many words: the only evidence of
 * a real deploy is a pull-request link, and it is shown only when one exists.
 *
 * Held fixes are approved from their own checklist (`Approvals`), once the
 * job has finished. Approving records the customer's sign-off with the
 * service; it is not a deploy, and nothing on this screen changes the site.
 *
 * The report is drawn as soon as the audit lands, before the job finishes —
 * `writing` is that window, while the fixes are still arriving.
 *
 * `blocked` and `skipped` — fixes the service chose not to write — are not
 * rendered; see `AeoResult`.
 *
 * ## The three endings
 *
 * `done` is this report. `blocked` and `error` are NOT low scores and are
 * never drawn as one — see the two components at the bottom of this file.
 */

import Link from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { CardColumns, SpanAllColumns } from "@/components/ui/card-columns";
import { PageSections, type PickerPage } from "@/components/analysis/page-sections";
import type { AeoFix, AeoJob, AeoResult } from "@/lib/data/aeo-audit";
import { AeoApply, type AeoApplyActions } from "@/components/agents/aeo-apply";
import { applyRoutes } from "@/lib/data/aeo-deploy";
import {
  areaScoreLabel,
  areaShare,
  awaitingFixes,
  coverageLabel,
  discoveryLabel,
  FIX_STATUS_LABEL,
  FIX_STATUS_VARIANT,
  fixCountLabel,
  fixesSentence,
  fixLocation,
  fixRouteNote,
  fixStatus,
  formatPoints,
  gapSummary,
  groupFixesByPlace,
  hasShipped,
  headingRewrite,
  pageHint,
  pendingRouteSentence,
  placeLabel,
  plainProse,
  previewTaste,
  previewToggleLabel,
  reachableScore,
  resultCaveats,
  scoreToneClass,
  severityVariant,
  suggestedSurfaceLabel,
  surfaceDetail,
} from "@/lib/data/aeo-report";
import { absoluteUrl } from "@/lib/data/profile-display";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { SubmitButton } from "@/components/ui/submit-button";
import { RefreshButton } from "@/components/ui/refresh-button";

/** A Server Action taking the approval form. Passed in, never imported here. */
type ApproveAction = (formData: FormData) => Promise<void>;

/**
 * The held fixes, as a checklist the customer approves from.
 *
 * Its own card rather than checkboxes inside the page list: `PageSections`
 * unmounts a closed row, and a ticked box in a row that was closed again
 * would silently drop out of the submit. Here every held fix is mounted, and
 * each carries a taste of its copy; the whole text stays one click away in
 * the page list below.
 *
 * "Approve all" goes through a confirmation and posts no ids at all — the
 * server resolves "all" from the job it has just read, so a stale tab can
 * never approve a different set from the one on screen.
 *
 * Shown only once the job has finished. While fixes are still being written,
 * "all" would mean whichever happened to exist yet.
 */
function Approvals({
  job,
  result,
  approve,
}: {
  job: AeoJob;
  result: AeoResult;
  approve: ApproveAction;
}) {
  const held = awaitingFixes(result.fixes);
  if (held.length === 0) return null;
  const count = plural(held.length);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Waiting for your approval</h3>
          <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-soft">
            These {count} change what your pages say, so nothing uses them until you approve.{" "}
            {pendingRouteSentence(result)}
          </p>
        </div>
        <form action={approve}>
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="scope" value="all" />
          <ConfirmSubmit
            tone="accent"
            title={`Approve all ${count}?`}
            body={`This approves every fix waiting for approval on ${
              result.domain || job.url
            }. Read them first in the page list below. Approving does not change your site by itself.`}
            confirmLabel={`Approve all ${held.length}`}
            pendingLabel="Approving…"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-raised motion-reduce:transition-none"
          >
            Approve all {held.length}
          </ConfirmSubmit>
        </form>
      </div>

      <form action={approve} className="mt-3">
        <input type="hidden" name="jobId" value={job.id} />
        <fieldset>
          <legend className="sr-only">Fixes to approve</legend>
          <ul className="max-h-[28rem] divide-y divide-border overflow-y-auto rounded-md border border-border">
            {held.map((fix) => (
              <li key={fix.id}>
                <label className="flex cursor-pointer gap-3 px-3 py-3 hover:bg-surface-raised">
                  <input
                    type="checkbox"
                    name="artifact"
                    value={fix.id}
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{fix.action}</span>
                    {/* The rationale, beside the page, because one FAQ arrives
                        as TWO fixes with the same action — the visible
                        section and its schema — and the rationale is the
                        only thing that tells them apart. */}
                    <span className="block text-xs text-ink-soft">
                      <span className="break-all font-mono">{placeLabel(fix.where)}</span>
                      {fix.rationale && ` · ${fix.rationale}`}
                    </span>
                    {/* A taste of the WORDING only. Squashed onto three lines,
                        JSON and HTML read as noise; they are one click away,
                        properly laid out, in the page list below. */}
                    {fix.language === "text" && fix.preview && (
                      <span className="mt-1 block max-w-prose text-xs leading-relaxed text-ink">
                        {previewTaste(fix.preview)}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <div className="mt-3">
          <SubmitButton
            pendingLabel="Approving…"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ground transition hover:bg-accent-ink motion-reduce:transition-none"
          >
            Approve ticked fixes
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function plural(count: number): string {
  return `${count} ${count === 1 ? "fix" : "fixes"}`;
}

/** The headline: the score, what it is out of, and how much was looked at. */
function Verdict({ result }: { result: AeoResult }) {
  const coverage = coverageLabel(result);
  const caveats = resultCaveats(result);
  const reach = reachableScore(result);
  const reachRoute = suggestedSurfaceLabel(result);

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      {/* Top-aligned, not centred: "With these fixes" carries a route line
          under its figure, and centring pushed every other label down to
          meet it. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div>
          <p className="text-xs text-ink-soft">AEO score</p>
          {/* A null score is "not scored yet", never 0/100 in red. Six
              independent axes reading zero is a calculation that did not run,
              and this app has already told a customer their site failed
              everything once. */}
          {result.score === null ? (
            <p className="font-mono text-2xl text-ink-soft">
              —<span className="ml-2 font-sans text-xs">not scored yet</span>
            </p>
          ) : (
            <p className={`font-mono text-2xl ${scoreToneClass(result.score)}`}>
              {formatPoints(result.score)}
              <span className="text-sm text-ink-soft">/{formatPoints(result.ceiling ?? 100)}</span>
            </p>
          )}
        </div>

        {/* Beside the score, at the same size, because "77 now, 96 with the
            fixes" is the one comparison this report exists to make. */}
        {reach !== null && (
          <div>
            <p className="text-xs text-ink-soft">With these fixes</p>
            <p className={`font-mono text-2xl ${scoreToneClass(reach)}`}>
              {formatPoints(reach)}
              <span className="text-sm text-ink-soft">/{formatPoints(result.ceiling ?? 100)}</span>
            </p>
            {/* The SUGGESTED route's figure, and another can reach higher.
                Without its name the headline reads as contradicting the list
                of routes further down. */}
            {reachRoute && <p className="text-xs text-ink-soft">by {reachRoute}</p>}
          </div>
        )}

        {coverage && (
          <div>
            <p className="text-xs text-ink-soft">Coverage</p>
            <p className="text-sm font-medium text-ink">{coverage}</p>
          </div>
        )}

        {result.gap_count !== null && (
          <div>
            <p className="text-xs text-ink-soft">Areas with findings</p>
            <p className="text-sm font-medium tabular-nums text-ink">{result.gap_count}</p>
          </div>
        )}

        {result.platform && (
          <div>
            <p className="text-xs text-ink-soft">Built with</p>
            <p className="text-sm font-medium text-ink">{result.platform}</p>
          </div>
        )}
      </div>

      {/* The service's own caveats, verbatim. Each explains why a figure above
          is what it is, and paraphrasing would be us explaining a calculation
          we did not make. Empty ones are dropped, not rendered blank. */}
      {caveats.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {caveats.map((note) => (
            <li key={note} className="max-w-prose text-sm text-ink-soft">
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Every area the audit scored, in the order it sent them.
 *
 * However many arrive, arrive: the integration brief says nine and the live
 * service sent ten. Nothing here counts them or names a key.
 */
function Areas({ result }: { result: AeoResult }) {
  if (result.areas.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">What each check scored</h3>
      <ul className="mt-3 divide-y divide-border">
        {result.areas.map((area) => (
          <li key={area.key} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-36 shrink-0 truncate text-ink-soft">{area.label}</span>
              <span className="h-1.5 flex-1 rounded bg-surface-raised">
                <span
                  className="block h-1.5 rounded bg-accent"
                  style={{ width: `${areaShare(area)}%` }}
                />
              </span>
              <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-ink">
                {areaScoreLabel(area)}
              </span>
            </div>

            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-xs text-accent-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="group-open:hidden">Why this score</span>
                <span className="hidden group-open:inline">Hide</span>
              </summary>

              {area.reason && (
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
                  {plainProse(area.reason)}
                </p>
              )}
              {/* Raw key/value text straight out of the checker, so it is set
                  in the monospace face rather than dressed up as prose. */}
              {area.evidence && (
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-raised p-3 font-mono text-xs text-ink-soft">
                  {area.evidence}
                </pre>
              )}
              {/* An area at full marks sends an empty string here. No heading
                  over nothing. */}
              {area.improvement && (
                <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink">
                  <span className="font-medium">How to fix. </span>
                  {plainProse(area.improvement)}
                </p>
              )}
              {area.page_count > 0 && (
                <p className="mt-2 text-xs text-ink-soft">
                  Checked on {area.page_count} {area.page_count === 1 ? "page" : "pages"}
                  {area.worst_page && ` · worst: ${area.worst_page}`}
                </p>
              )}
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The same findings, ranked by what they are worth. The service's order. */
function Gaps({ result }: { result: AeoResult }) {
  if (result.gaps.length === 0) return null;
  const wroteFixes = result.fixes.length > 0;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">What to fix first</h3>
      <p className="mt-0.5 text-sm text-ink-soft">
        Ranked by the points each one is worth, highest first.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {result.gaps.map((gap) => (
          <li key={gap.key} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {gap.severity && (
                <Badge variant={severityVariant(gap.severity)}>{gap.severity}</Badge>
              )}
              <span className="text-sm font-medium text-ink">{gap.title}</span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">{gapSummary(gap)}</p>
            {gap.improvement && (
              <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-soft">
                {plainProse(gap.improvement)}
              </p>
            )}
            {/* Only once fixes were written at all — before that, an empty
                list says nothing about this gap in particular. */}
            {wroteFixes && gap.ships_via.length === 0 && (
              <p className="mt-1.5 max-w-prose text-xs text-ink-soft">
                We couldn&apos;t write a fix for this one. It needs a change on your side.
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A reference list, explicitly not a finding and explicitly not ranked. */
function Competitors({ result }: { result: AeoResult }) {
  if (result.competitors.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <details className="group">
        <summary className="cursor-pointer list-none text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Who else answers these questions
          <span className="ml-2 text-xs font-normal text-ink-soft group-open:hidden">Show</span>
          <span className="ml-2 hidden text-xs font-normal text-ink-soft group-open:inline">
            Hide
          </span>
        </summary>
        <p className="mt-2 text-sm text-ink-soft">
          Sites covering the same ground. Nothing here is scored or ranked.
        </p>
        <ul className="mt-3 divide-y divide-border">
          {result.competitors.map((competitor) => {
            const href = competitor.url ? absoluteUrl(competitor.url) : null;
            return (
              <li key={competitor.name} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-ink">{competitor.name}</p>
                {competitor.why && (
                  <p className="mt-1 max-w-prose text-sm text-ink-soft">{competitor.why}</p>
                )}
                {href && (
                  /* Somebody else's site, so a raw anchor. */
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block break-all text-xs text-accent-ink underline-offset-4 hover:underline"
                  >
                    {competitor.url}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

/**
 * The routes the fixes could take to the site, and what each could reach.
 *
 * A preview, and the card opens by saying so: a list of delivery routes with
 * scores beside them reads as though something is under way, and nothing is.
 */
function Delivery({
  result,
  writing,
  showRoutes = true,
}: {
  result: AeoResult;
  writing: boolean;
  /** False once "How to apply them" shows the same routes as tabs. */
  showRoutes?: boolean;
}) {
  const counted = fixesSentence(result.fixes);
  // While the job runs the list is still growing, so the count is "so far" —
  // and before the first fix lands there is still something true to say.
  const sentence = writing
    ? counted
      ? `${counted} More are still being written.`
      : "We're still writing the fixes for this site."
    : counted;
  if (!sentence) return null;

  const { deployment, surfaces } = result;
  const shipped = hasShipped(deployment);
  const prHref = deployment?.pull_request_url ? absoluteUrl(deployment.pull_request_url) : null;
  const notes = deployment?.platform_notes ?? [];

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">Putting the fixes on your site</h3>
      <p className="mt-0.5 max-w-prose text-sm leading-relaxed text-ink-soft">{sentence}</p>
      {shipped ? (
        prHref && (
          /* GitHub, so a raw anchor. */
          <a
            href={prHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-medium text-accent-ink underline-offset-4 hover:underline"
          >
            View the pull request
          </a>
        )
      ) : (
        <p className="mt-2 max-w-prose text-sm font-medium text-ink">
          Nothing has been changed on your site yet. Each page&apos;s fixes are in the page list
          below.
        </p>
      )}

      {showRoutes && surfaces.length > 0 && (
        <>
          <p className="mt-4 text-xs text-ink-soft">Ways to put them on your site</p>
          <ul className="mt-1 divide-y divide-border">
            {surfaces.map((surface) => {
              const detail = surfaceDetail(surface);
              const suggested = surface.available && surface.id === deployment?.surface;
              return (
                <li key={surface.id || surface.label} className="py-3 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={`text-sm font-medium ${
                        surface.available ? "text-ink" : "text-ink-soft"
                      }`}
                    >
                      {surface.label}
                    </span>
                    {suggested && <Badge variant="route-suggested">Suggested</Badge>}
                    {surface.available && surface.achievable !== null && (
                      <span
                        className={`ml-auto font-mono text-sm tabular-nums ${scoreToneClass(
                          surface.achievable,
                        )}`}
                      >
                        {formatPoints(surface.achievable)}
                        <span className="text-xs text-ink-soft">
                          /{formatPoints(result.ceiling ?? 100)}
                        </span>
                      </span>
                    )}
                  </div>
                  {detail && <p className="mt-1 text-xs text-ink-soft">{detail}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* The service's own notes about this platform, verbatim — the same rule
          as the caveats under the score. */}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {notes.map((note) => (
            <li key={note} className="max-w-prose text-sm text-ink-soft">
              {note}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The fixes written for one place on the site, each with its content. */
function FixList({ fixes, result }: { fixes: AeoFix[]; result: AeoResult }) {
  return (
    <ul className="divide-y divide-border">
      {fixes.map((fix) => {
        const status = fixStatus(fix);
        const location = fixLocation(fix, result.deployment);
        const routeNote = fixRouteNote(fix, result.deployment, result.surfaces);
        const rewrite = headingRewrite(fix);
        return (
          <li key={fix.id || fix.action} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Badge variant={FIX_STATUS_VARIANT[status]}>{FIX_STATUS_LABEL[status]}</Badge>
              <span className="text-sm font-medium text-ink">{fix.action}</span>
            </div>
            {fix.rationale && (
              <p className="mt-1 max-w-prose text-sm text-ink-soft">{fix.rationale}</p>
            )}
            {location && <p className="mt-1 text-xs text-ink-soft">Goes in {location}</p>}
            {routeNote && <p className="mt-1 text-xs text-ink-soft">{routeNote}</p>}

            {/* Two short phrases, not a snippet of JSON. */}
            {rewrite ? (
              <p className="mt-2 max-w-prose text-sm text-ink">
                <span className="text-ink-soft">&ldquo;{rewrite.from}&rdquo;</span>
                <span aria-hidden="true" className="mx-2 text-ink-soft">
                  →
                </span>
                <span className="sr-only"> becomes </span>&ldquo;{rewrite.to}&rdquo;
              </p>
            ) : (
              fix.preview && (
                <details className="group mt-2">
                  <summary className="cursor-pointer list-none text-xs text-accent-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <span className="group-open:hidden">{previewToggleLabel(fix)}</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-raised p-3 font-mono text-xs text-ink-soft">
                    {fix.preview}
                  </pre>
                </details>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Every page that was audited, worst first — the service's own order — each
 * opening onto the fixes written for it.
 *
 * Through `PageSections`, whose `hint` parser reads `N/100` back out to size
 * its gauge. That is why `pageHint` keeps the `/100`. The fix count rides in
 * `meta`, the space between the path and the score.
 *
 * Fixes whose `where` is not an audited page — the sitemap, which is for the
 * whole site — get rows of their own at the end, so none is dropped for not
 * matching a path. The end, not the top, because the first row starts open
 * and that should be the worst page, not the sitemap.
 */
function Pages({ result }: { result: AeoResult }) {
  const groups = groupFixesByPlace(result.fixes);
  const pagePaths = new Set(result.pages.map((page) => page.path));
  const elsewhere = [...groups].filter(([where]) => !pagePaths.has(where));

  if (result.pages.length === 0 && elsewhere.length === 0) return null;

  const siteRows: PickerPage[] = elsewhere.map(([where, fixes]) => ({
    key: `place:${where}`,
    label: placeLabel(where),
    meta: fixCountLabel(fixes) ?? undefined,
    content: <FixList fixes={fixes} result={result} />,
  }));

  const pageRows: PickerPage[] = result.pages.map((page) => {
    const fixes = groups.get(page.path) ?? [];
    return {
      key: page.url,
      label: page.path || page.url,
      meta: fixCountLabel(fixes) ?? undefined,
      hint: pageHint(page.score),
      content: (
        <div>
          <a
            href={absoluteUrl(page.url) ?? page.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-sm text-accent-ink underline-offset-4 hover:underline"
          >
            {page.url}
          </a>
          <p className="mt-2 text-sm text-ink-soft">
            Scored {formatPoints(page.score)} out of 100 for how readable and quotable this page
            is. The checks behind that are in the list above.
          </p>
          {fixes.length > 0 && (
            <div className="mt-3 border-t border-border pt-3">
              <FixList fixes={fixes} result={result} />
            </div>
          )}
        </div>
      ),
    };
  });

  const withFixes = result.fixes.length > 0;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-ink">
        {withFixes ? "Every page, and the fixes we wrote for it" : "Every page we audited"}
      </h3>
      <p className="mt-0.5 text-sm text-ink-soft">
        {withFixes
          ? "Lowest scoring first. Open a page to see its fixes."
          : "Lowest scoring first."}
      </p>
      <div className="mt-3">
        <PageSections
          pages={[...pageRows, ...siteRows]}
          label="Page"
          summary={
            siteRows.length > 0
              ? `${pageRows.length} ${pageRows.length === 1 ? "page" : "pages"} audited, plus fixes for the whole site`
              : undefined
          }
        />
      </div>
    </section>
  );
}

export function AeoReportCard({
  job,
  writing = false,
  approve,
  apply,
}: {
  job: AeoJob;
  /**
   * The audit has landed and the job is still running: the score is final,
   * the fixes are still arriving.
   */
  writing?: boolean;
  /** The approve Server Action. Without it, held fixes get no checklist. */
  approve?: ApproveAction;
  /**
   * The GitHub status, preview and pull-request actions. Without them there
   * is no "How to apply them" section, and the routes stay a plain list.
   */
  apply?: AeoApplyActions;
}) {
  const result = job.result;
  if (!result) return null;
  // Shown as soon as the routes are known — it was hidden until the job
  // finished, which on a slow run read as the section not existing at all.
  // While fixes are still arriving the island locks Preview instead: a preview
  // of a half-written list would propose a change already out of date.
  const { routes, unavailable } = applyRoutes(result);
  const showApply = Boolean(apply) && (routes.length > 0 || result.fixes.length > 0);
  const discovery = discoveryLabel(result.discovery_source);

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="min-w-0 break-all text-lg font-bold tracking-tight text-ink">
          {result.domain || job.url}
        </h2>
        {discovery && <p className="text-xs text-ink-soft">{discovery}</p>}
      </header>

      {/* Said once, at the top, because the report above the fold is complete
          and final — only the fixes further down are still coming. */}
      {writing && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 animate-pulse rounded-full bg-info motion-reduce:animate-none"
          />
          The score is final. We&apos;re still writing the fixes, and this page updates by itself.
        </p>
      )}

      <Verdict result={result} />

      <CardColumns>
        <Gaps result={result} />
        <Areas result={result} />
        <Competitors result={result} />
        {/* One spanning block holding both, not two: an empty span (no fixes
            written) would still carry its margins and leave a double gap. */}
        <SpanAllColumns>
          <div className="flex flex-col gap-4">
            <Delivery result={result} writing={writing} showRoutes={!showApply} />
            {!writing && approve && <Approvals job={job} result={result} approve={approve} />}
            {showApply && apply && (
              <AeoApply
                jobId={job.id}
                domain={result.domain}
                routes={routes}
                unavailable={unavailable.map((surface) =>
                  surface.note ? `${surface.label} (${surface.note})` : surface.label,
                )}
                actions={apply}
                writing={writing}
              />
            )}
            <Pages result={result} />
          </div>
        </SpanAllColumns>
      </CardColumns>
    </article>
  );
}

/**
 * A bot wall answered instead of the site.
 *
 * This is a finding, not a failure to hide, and emphatically not a zero — no
 * score was ever produced. There is no Try again: the wall is a property of
 * the site, so polling again cannot change the outcome.
 */
export function AeoBlockedCard({ job }: { job: AeoJob }) {
  return (
    <div role="status" className="rounded-lg border border-border bg-surface p-4">
      <h2 className="break-all text-base font-semibold text-ink">{job.url}</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">
        {job.vendor
          ? `A bot-protection wall (${job.vendor}) answered instead of the page.`
          : "A bot-protection wall answered instead of the page."}{" "}
        Whatever blocks us blocks AI crawlers too, so this is itself a finding — no score was
        recorded.
      </p>
      {job.error && <p className="mt-2 max-w-prose text-sm text-ink-soft">{job.error}</p>}
    </div>
  );
}

/** Unreachable, mis-typed, or the service fell over. Not a score of zero. */
export function AeoErrorCard({ job, retry }: { job: AeoJob; retry: React.ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-border bg-surface p-4">
      <h2 className="break-all text-base font-semibold text-ink">{job.url || "This site"}</h2>
      <p className="mt-1 max-w-prose text-sm text-ink-soft">
        {job.error || "We couldn't audit this site."} No score was recorded.
      </p>
      <div className="mt-3">{retry}</div>
    </div>
  );
}

/** Shown while the server has not yet re-rendered a job that just landed. */
export function AeoUnknownCard({ url }: { url: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="break-all text-base font-semibold text-ink">{url}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        We couldn&apos;t read this audit&apos;s state. It may still be running.
      </p>
      <RefreshButton className="mt-2 text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
        Check again
      </RefreshButton>
    </div>
  );
}
