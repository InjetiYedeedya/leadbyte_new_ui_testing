"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { currentBusinessId } from "@/components/page-shell";
import { getBusinessProfileRepo } from "@/lib/data/business-profile-repo";
import { dropAnalysisCache } from "@/lib/data/analysis-cache";
import {
  profileEditPayload,
  readProfileEdit,
  validateProfileEdit,
} from "@/lib/data/profile-edit";
import { readBrandSection, readSection } from "@/lib/data/profile-sections";
import { signText } from "@/lib/signed-text";

/**
 * A `?problems=` value only our code can write. The pages show it through
 * `readSignedText`, so a crafted link cannot put its own "error" wording on
 * a real LeadByte page (audit, 2026-09-29).
 */
function problemParam(text: string): string {
  return encodeURIComponent(signText(text));
}


const PAGE = "/overview/business-profile";

/**
 * Save a correction to what the crawler understood.
 *
 * The page has told people to "edit anything that's wrong" since it was built,
 * with nothing to edit it with. This is that control.
 *
 * ## Why the analysis cache is dropped
 *
 * There is no cross-request copy of the profile any more (removed
 * 2026-10-05, see `analysis-cache.ts`), but `dropAnalysisCache` also marks the
 * browser's router cache stale. Without it a customer could save a
 * correction, land back on the page, and still see the old description —
 * indistinguishable from the save having failed.
 */
export async function saveBusinessProfile(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const raw = formData.get("section");
  const section = readSection(typeof raw === "string" ? raw : undefined) ?? "business";
  const repo = getBusinessProfileRepo();

  // Only the business section writes the details row's own columns. Every
  // other card is part of the brand block, which the read path takes from the
  // analysis — so those corrections go to the override field instead. Writing
  // them to the details row would save cleanly and change nothing on screen.
  if (section === "business") {
    const edit = readProfileEdit(formData);
    const problems = validateProfileEdit(edit);
    if (problems.length > 0) {
      redirect(
        `${PAGE}?edit=${section}&problems=${problemParam(problems.join(" | "))}`,
      );
    }

    try {
      await repo.saveProfileDetails(businessId, profileEditPayload(edit));
    } catch (error) {
      console.error(`[profile-edit] saving ${businessId} failed:`, error);
      redirect(
        `${PAGE}?edit=${section}&problems=${problemParam(
          "We couldn't save that just now. Your changes are still in the form — try again.",
        )}`,
      );
    }
  } else {
    const str = (name: string): string => {
      const value = formData.get(name);
      return typeof value === "string" ? value : "";
    };

    // The whole corrected block is written, not just this section, because the
    // override field holds one object. Reading the CURRENT profile first is
    // what keeps the other sections' corrections — and the crawl's values for
    // anything untouched — from being dropped by a save of one card.
    const current = await repo.get(businessId);
    const next = { ...(current?.brand ?? {}), ...readBrandSection(section, str) };

    try {
      await repo.saveBrandDetails(businessId, next);
    } catch (error) {
      console.error(`[profile-edit] saving brand for ${businessId} failed:`, error);
      redirect(
        `${PAGE}?edit=${section}&problems=${problemParam(
          "We couldn't save that just now. Your changes are still in the form — try again.",
        )}`,
      );
    }
  }

  await dropAnalysisCache(businessId);
  revalidatePath(PAGE);
  revalidatePath("/overview");
  redirect(`${PAGE}?saved=1`);
}

/**
 * Drops one extracted image from the profile.
 *
 * ## Why this is a real write and not a hide
 *
 * The images feed the ad agents' creative, so an image the crawler picked up
 * from an embedded widget or a partner's site is not a cosmetic problem — it
 * is something that can end up in an advert. Hiding it locally would leave it
 * in the data every agent reads.
 *
 * It goes through the SAME brand-override path as every other correction on
 * this page (see `profile-sections.ts`): the whole corrected brand block is
 * written, so removing an image cannot drop a competitor someone fixed last
 * week. A later analysis re-extracting the image is the expected behaviour of
 * an override, not a bug — the crawl is the source, and this is a correction
 * on top of it.
 */
export async function removeProfileImage(formData: FormData): Promise<void> {
  const businessId = await currentBusinessId();
  const image = formData.get("image");
  if (typeof image !== "string" || image === "") return;

  const repo = getBusinessProfileRepo();
  const current = await repo.get(businessId);
  const images = current?.brand?.images ?? [];
  // Nothing to do rather than writing an identical list: a save that changes
  // nothing still drops the analysis cache and costs a round trip.
  if (!images.includes(image)) return;

  const next = {
    ...(current?.brand ?? {}),
    images: images.filter((src) => src !== image),
  };

  try {
    await repo.saveBrandDetails(businessId, next);
  } catch (error) {
    console.error(`[profile-edit] removing an image for ${businessId} failed:`, error);
    return;
  }

  await dropAnalysisCache(businessId);
  revalidatePath(PAGE);
}
