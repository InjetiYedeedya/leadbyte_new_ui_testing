"use server";

import { revalidatePath } from "next/cache";
import { currentBusinessId } from "@/components/page-shell";
import { getNotificationsRepo } from "@/lib/data/notifications-repo";

export async function markAllRead(): Promise<void> {
  const businessId = await currentBusinessId();
  await getNotificationsRepo().markAllRead(businessId);
  revalidatePath("/", "layout");
}
