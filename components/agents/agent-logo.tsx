import Image from "next/image";

/**
 * An agent's mark, shown beside its name on the Agents list and its own page.
 *
 * The platform agents carry their owner's official mark (`public/logos/`, taken
 * from the published assets — an approximated logo is a wrong logo). The rest
 * are ours to draw, and are line icons in one weight so a list of both reads as
 * one set. An agent missing from this map renders nothing rather than a
 * borrowed mark.
 *
 * Every tile is the same neutral surface, so the brand marks keep their own
 * colours: reversing them out of a coloured tile would need white versions the
 * owners do not publish.
 *
 * `unoptimized` because these are SVGs — the image optimiser refuses them
 * without `dangerouslyAllowSVG`, which a few hundred bytes does not justify.
 */
const AGENT_LOGOS: Record<string, string> = {
  "meta-ads": "/logos/meta.svg",
  "google-ads": "/logos/google-ads.svg",
  "linkedin-ads": "/logos/linkedin.svg",
  "openai-ads": "/logos/openai.svg",
  "lead-qualification": "/logos/lead-qualification.svg",
  "on-page-seo": "/logos/on-page-seo.svg",
  "off-page-seo": "/logos/off-page-seo.svg",
  "social-media": "/logos/social-media.svg",
  "blog-posting": "/logos/blog-posting.svg",
  aeo: "/logos/aeo.svg",
};

/** The mark's file, for a place that draws its own tile (the nav menu). */
export function agentLogoSrc(agentId: string): string | undefined {
  return AGENT_LOGOS[agentId];
}

export function AgentLogo({
  agentId,
  className = "size-9",
  imageClassName = "size-5",
}: {
  agentId: string;
  /** The tile's size (and anything else about the tile). */
  className?: string;
  /** The mark's size inside it — grows with the tile on the Agents cards. */
  imageClassName?: string;
}) {
  const src = AGENT_LOGOS[agentId];
  if (!src) return null;

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md border border-border bg-surface ${className}`}
    >
      {/* Decorative: the agent's name is right beside it. */}
      <Image
        src={src}
        alt=""
        aria-hidden="true"
        unoptimized
        width={24}
        height={24}
        className={`${imageClassName} object-contain`}
      />
    </span>
  );
}
