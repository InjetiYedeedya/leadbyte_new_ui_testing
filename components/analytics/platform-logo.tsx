import Image from "next/image";

/**
 * The ad platforms' own marks.
 *
 * Both cards used the same grey megaphone, so "Google Ads" and "Meta Ads" were
 * told apart only by reading their headings — on a screen whose whole job is
 * comparing one against the other. A platform's own logo is the fastest thing
 * on the card to recognise.
 *
 * These are the official assets in `public/`, not paths traced by hand: an
 * approximated logo is a wrong logo, and a third party's mark has to be their
 * mark or not appear. It also keeps their brand colours out of our code — the
 * exception `connect-google.tsx` has to take for Google's product colours is
 * one this file no longer needs.
 *
 * Both files are opaque squares on white, which is why the caller's circle is
 * `bg-surface`: on any other background the corners would show.
 *
 * LinkedIn has no asset yet and falls back to the generic icon. The Performance
 * screens only render platforms that returned data and no LinkedIn account has,
 * so this has not been seen — but a generic icon is the right fallback, and a
 * borrowed one would be the wrong logo on someone's screen.
 */
const ASSETS: Record<string, { src: string; alt: string }> = {
  google: { src: "/google-ads.jpg", alt: "Google Ads" },
  meta: { src: "/meta.avif", alt: "Meta" },
};

function assetFor(platform: string) {
  if (platform.startsWith("google")) return ASSETS.google;
  if (platform.startsWith("meta")) return ASSETS.meta;
  return undefined;
}

export function PlatformLogo({
  platform,
  className = "h-5 w-5",
}: {
  /**
   * Both spellings are accepted on purpose. `AdsPlatform.platform` is
   * `"google" | "meta" | "linkedin"` while the connected-data reads key the
   * same platforms `"googleAds" | "metaAds"`, and a component that took only
   * one of them would need every caller to translate — which is where a wrong
   * logo gets introduced.
   */
  platform: string;
  className?: string;
}) {
  const asset = assetFor(platform);

  if (asset) {
    return (
      <Image
        src={asset.src}
        alt={asset.alt}
        // The intrinsic size Next needs; `className` is what it renders at.
        width={64}
        height={64}
        className={`${className} object-contain`}
      />
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m4 10 15-5v14L4 14zM4 10v4M8 16l1 5h3l-1-4M22 9v6" />
    </svg>
  );
}
