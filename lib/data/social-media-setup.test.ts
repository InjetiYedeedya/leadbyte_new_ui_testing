import {
  SOCIAL_INPUT,
  buildSocialRow,
  buildSocialWebhook,
  decodeSocialMedia,
  platformsActive,
  readSocialForm,
  socialDefaultsFromRow,
  validateSocial,
  type SocialSetup,
} from "./social-media-setup";

function formOf(entries: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const one of Array.isArray(value) ? value : [value]) form.append(key, one);
  }
  return form;
}

const NOW = new Date("2026-10-01T10:00:00.000Z");
const IDS = { email: "a@b.com", userId: "uid-1", now: NOW };
const BUSINESS = {
  businessName: "LeadByte",
  websiteUrl: "https://leadbyte.ai",
  businessType: "Software",
  specialization: "Marketing automation",
  logoUrl: "https://cdn.example/logo.png",
};
const IMG = (n: number) => ({ url: `https://socailmediaposts.s3.amazonaws.com/social-media/media/${n}.png`, kind: "image" as const });

const FULL: SocialSetup = {
  mode: "full",
  platforms: ["instagram", "facebook"],
  mediaType: "carousel",
  schedule: { kind: "everyday" },
  media: [],
  postInfo: "Autumn offer",
};
const SEMI: SocialSetup = { ...FULL, mode: "semi", media: [IMG(1), IMG(2)] };

describe("readSocialForm", () => {
  it("reads full mode with chosen dates, de-duplicated and in order", () => {
    const setup = readSocialForm(
      formOf({
        [SOCIAL_INPUT.mode]: "full",
        [SOCIAL_INPUT.platforms]: ["facebook", "youtube", "x"],
        [SOCIAL_INPUT.mediaType]: "video",
        [SOCIAL_INPUT.scheduleKind]: "dates",
        [SOCIAL_INPUT.postDates]: ["2026-10-09", "2026-10-03", "2026-10-09", "soon"],
        [SOCIAL_INPUT.postInfo]: "  Launch week  ",
      }),
    );
    expect(setup).toEqual({
      mode: "full",
      platforms: ["facebook", "youtube"],
      mediaType: "video",
      schedule: { kind: "dates", dates: ["2026-10-03", "2026-10-09"] },
      media: [],
      postInfo: "Launch week",
    });
  });

  it("reads semi mode's uploaded files and ignores them in full mode", () => {
    const media = JSON.stringify([IMG(1), { url: "http://not-https/x.png", kind: "image" }, IMG(1), { url: "https://x/v.mp4", kind: "video" }]);
    expect(readSocialForm(formOf({ [SOCIAL_INPUT.mode]: "semi", [SOCIAL_INPUT.media]: media })).media).toEqual([
      IMG(1),
      { url: "https://x/v.mp4", kind: "video" },
    ]);
    expect(readSocialForm(formOf({ [SOCIAL_INPUT.mode]: "full", [SOCIAL_INPUT.media]: media })).media).toEqual([]);
  });

  it("falls back to full, image and every day", () => {
    expect(readSocialForm(formOf({}))).toMatchObject({ mode: "full", mediaType: "image", schedule: { kind: "everyday" } });
  });
});

describe("decodeSocialMedia", () => {
  it("reads nothing from nothing", () => {
    expect(decodeSocialMedia("")).toEqual([]);
    expect(decodeSocialMedia("nope")).toEqual([]);
    expect(decodeSocialMedia('{"url":"https://x"}')).toEqual([]);
  });
});

describe("validateSocial", () => {
  const today = "2026-10-01";

  it("passes a complete full-mode and semi-mode setup", () => {
    expect(validateSocial(FULL, ["instagram", "facebook"], today)).toEqual([]);
    expect(validateSocial(SEMI, ["instagram", "facebook"], today)).toEqual([]);
  });

  it("needs a platform, and a connected one", () => {
    expect(validateSocial({ ...FULL, platforms: [] }, [], today)).toContain("Select at least one platform");
    expect(validateSocial(FULL, ["instagram"], today)).toContain(
      "Please connect Facebook in Integrations before running the Social Media Agent.",
    );
  });

  it("needs dates after today when posting on chosen dates", () => {
    expect(validateSocial({ ...FULL, schedule: { kind: "dates", dates: [] } }, ["instagram", "facebook"], today)).toContain(
      "Choose at least one date to post on, or pick Every day.",
    );
    expect(validateSocial({ ...FULL, schedule: { kind: "dates", dates: ["2026-10-01"] } }, ["instagram", "facebook"], today)).toContain(
      "Posting dates must be after today.",
    );
  });

  it("holds semi mode's media to legacy's rules", () => {
    const connected = ["instagram", "facebook"] as const;
    expect(validateSocial({ ...SEMI, media: [] }, connected, today)).toContain(
      "In semi-automation mode, you must upload an image or video before running the agent.",
    );
    expect(validateSocial({ ...SEMI, media: [IMG(1), { url: "https://x/v.mp4", kind: "video" }] }, connected, today)).toContain(
      "Upload images or a video — not both in the same post.",
    );
    expect(validateSocial({ ...SEMI, media: Array.from({ length: 11 }, (_, i) => IMG(i)) }, connected, today)).toContain(
      "You can upload up to 10 images.",
    );
  });
});

describe("platformsActive", () => {
  it("keys every legacy platform by label", () => {
    expect(platformsActive(["facebook"])).toEqual({
      Instagram: false,
      Facebook: true,
      YouTube: false,
      "X (Twitter)": false,
      LinkedIn: false,
    });
  });
});

describe("buildSocialRow", () => {
  it("writes legacy's row, with the schedule for full mode", () => {
    expect(buildSocialRow(FULL, IDS, { id: 42, youtubeActivated: false, logoUrl: "" })).toEqual({
      id: 42,
      email: "a@b.com",
      ClientEmail: "a@b.com",
      userId: "uid-1",
      PlatformsActive: platformsActive(["instagram", "facebook"]),
      AutomationMode: "full",
      PostingSchedule: "everyday",
      EverydayMonth: "2026-10",
      MediaType: "carousel",
      LogoUrl: null,
      youtube_activated: false,
      CreatedAt: NOW.toISOString(),
      UpdatedAt: NOW.toISOString(),
      PostCreationInfo: "Autumn offer",
      agentType: "social-media",
      configured: true,
      status: "active",
    });
  });

  it("carries the media URLs, and no schedule, in semi mode", () => {
    const row = buildSocialRow(SEMI, IDS, { id: 42, youtubeActivated: true, logoUrl: "" });
    expect(row.MediaUrls).toEqual([IMG(1).url, IMG(2).url]);
    expect(row).not.toHaveProperty("PostingSchedule");
    expect(row).not.toHaveProperty("MediaType");
    expect(row.youtube_activated).toBe(true);
  });
});

describe("buildSocialWebhook", () => {
  it("wraps full mode in the main envelope", () => {
    const body = buildSocialWebhook(
      { ...FULL, schedule: { kind: "dates", dates: ["2026-10-03", "2026-10-09"] } },
      BUSINESS,
      IDS,
      { isUpdate: false, jobId: "job_1" },
    );
    expect(body).toMatchObject({
      job_id: "job_1",
      email_address: "a@b.com",
      user_id: "uid-1",
      agent_name: "Social Media Agent",
      email: "a@b.com",
      AutomationMode: "full",
      PostingSchedule: "2026-10-03,2026-10-09",
      MediaType: "carousel",
      PostCreationInfo: "Autumn offer",
      BusinessName: "LeadByte",
      WebsiteURL: "https://leadbyte.ai",
      ReportEmail: "a@b.com",
      BusinessType: "Software",
      Specialization: "Marketing automation",
      BrandLogoUrl: "https://cdn.example/logo.png",
      isUpdate: false,
    });
    expect(body).not.toHaveProperty("EverydayMonth");
  });

  it("sends semi mode bare, with its media and automationMode", () => {
    const body = buildSocialWebhook(SEMI, BUSINESS, IDS, { isUpdate: true, jobId: "job_1" });
    expect(body).toMatchObject({ automationMode: "semi", AutomationMode: "semi", MediaUrls: [IMG(1).url, IMG(2).url], isUpdate: true });
    expect(body).not.toHaveProperty("job_id");
    expect(body).not.toHaveProperty("MediaType");
  });
});

describe("socialDefaultsFromRow", () => {
  it("starts the form from the last run, without the post ideas", () => {
    expect(
      socialDefaultsFromRow({
        AutomationMode: "semi",
        PlatformsActive: { Instagram: true, Facebook: false, YouTube: true },
        MediaType: "video",
        PostingSchedule: "2026-10-03,2026-10-09",
        PostCreationInfo: "old idea",
        youtube_activated: true,
      }),
    ).toEqual({
      youtubeActivated: true,
      mode: "semi",
      platforms: ["instagram", "youtube"],
      mediaType: "video",
      schedule: { kind: "dates", dates: ["2026-10-03", "2026-10-09"] },
    });
    expect(socialDefaultsFromRow(null)).toEqual({ youtubeActivated: false });
  });
});
