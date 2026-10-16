/**
 * The moving background behind every signed-in page.
 *
 * ## What it is
 *
 * A looping, muted video (`public/animated-bg_2.mp4`, 1920×1080, 8s, 1.26 MB) pinned to
 * the viewport, shown at full strength with NO tint over it — a white wash
 * was tried and removed on request (2026-09-23). It is the ONE background:
 * the Overview's opening text sits straight on it rather than on a picture of
 * its own, so there is no seam where one image ends and another begins.
 *
 * With no wash, any text set directly on the page (rather than in a card)
 * sits on the footage itself. The cards are opaque, so their contents are
 * unaffected; page headings are the thing to watch.
 *
 * ## Why it is a Server Component
 *
 * `autoPlay muted loop playsInline` is everything a background video needs,
 * and all of it is markup. No state, no effect, no JavaScript shipped.
 *
 * ## Reduced motion, and print
 *
 * CSS cannot pause a video, so under `prefers-reduced-motion` the video is
 * not rendered at all and a still frame of it (the poster) stands in, painted
 * behind it with the same framing. The same frame is the video's `poster`, so the
 * first paint is the picture rather than a blank field while the 3MB file
 * arrives. The whole layer is dropped when printing — a PDF is a report, and
 * a photograph under it is ink with no information in it.
 *
 * ## Layering
 *
 * `fixed -z-10` in the root stacking context, which paints above the body's
 * own background and below everything else. Anything that sets a solid
 * `bg-ground` over a large area will hide it — which is why `ScrollStack`
 * no longer backs its items with one.
 */

/**
 * The footage fills the screen at its natural framing — plain `object-cover`,
 * no extra zoom.
 *
 * The original file (`animated-bg_1.mp4`) carries a generator's sparkle
 * watermark in its bottom-right corner. It was first hidden by stretching the
 * frame to 140%, then 132%, of the viewport so the corner fell below the fold,
 * and both read as too zoomed in (2026-09-23). `animated-bg_1-clean.mp4` is
 * the same clip with that 80x96px patch filled from its surroundings, and
 * `animated-bg_2.mp4` is that file re-encoded (H.264 CRF 28, no audio,
 * fast start) from 2.98 MB to 1.26 MB with no visible difference (2026-09-25)
 * (ffmpeg `delogo=x=1706:y=843:w=80:h=96`), which is what allows the natural
 * framing. The two earlier files were removed on 2026-10-03 (7 MB nothing
 * served); they are in git history if a re-encode is ever needed. The poster is the clean
 * file's first frame.
 */
const FRAME = "absolute inset-0 size-full";

export function AppBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden"
    >
      {/* The still frame, for reduced motion. Same framing as the video. */}
      <div
        className={`${FRAME} hidden bg-[url(/animated-bg_1-poster.webp)] bg-cover bg-center motion-reduce:block`}
      />
      {/* The file is offered only to a browser that will actually play it.
          `motion-reduce:hidden` hides the element but does not stop it
          loading, so reduced-motion visitors were downloading 3 MB to look at
          the still frame. A `<source>` whose `media` does not match is never
          fetched. */}
      <video
        className={`${FRAME} object-cover motion-reduce:hidden`}
        poster="/animated-bg_1-poster.webp"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
      >
        {/* Through `/background-video`, which answers byte-range requests.
            The static file does not, and Safari (and every iPhone browser)
            will not play a video without them — see that route. */}
        <source
          src="/background-video"
          type="video/mp4"
          media="(prefers-reduced-motion: no-preference)"
        />
      </video>
    </div>
  );
}
