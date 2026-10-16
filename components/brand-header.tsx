import Image from "next/image";
import Link from "@/components/ui/app-link";

/**
 * The wordmark shown on every public (unauthenticated) screen.
 *
 * The official asset, not a reconstruction — `public/leadbyte-logo.png` is the
 * same file the live app serves. It already contains the word "LeadByte", so
 * there is no text beside it; repeating the name would read twice.
 *
 * `priority` because this is the first thing on a signed-out screen and the
 * only branding on it — lazy-loading it leaves the page briefly nameless.
 */
export function BrandHeader() {
  return (
    <header className="flex items-center justify-between px-6 py-5">
      <Link href="/" className="flex items-center">
        <Image
          src="/leadbyte-logo.png"
          alt="LeadByte"
          width={512}
          height={133}
          priority
          className="h-7 w-auto"
        />
      </Link>
    </header>
  );
}
