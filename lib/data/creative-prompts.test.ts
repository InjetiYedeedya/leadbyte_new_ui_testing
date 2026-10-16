import {
  promptRequest,
  readPromptJob,
  readPrompts,
  type PromptJob,
} from "@/lib/data/creative-prompts";

describe("promptRequest", () => {
  it("uses the backend's snake_case body", () => {
    const body = promptRequest({
      jobId: "session_1755782456789_ab12cd34e",
      userId: "RjQ8G9E48FUmYakdhD02kwJb8sM2",
      productDescription: "ZippyGo — a voice-first flight booking app",
      offerDetails: "20% off first booking",
      adFormat: "image",
      whichAds: "meta",
    });

    expect(body).toEqual({
      job_id: "session_1755782456789_ab12cd34e",
      user_id: "RjQ8G9E48FUmYakdhD02kwJb8sM2",
      product_description: "ZippyGo — a voice-first flight booking app",
      offer_details: "20% off first booking",
      ad_format: "image",
      which_ads: "meta",
    });
  });
});

describe("readPromptJob", () => {
  it("reads the token under either of its two names", () => {
    // The reply carries `selection_token` AND `token` with the same value.
    expect(
      readPromptJob({
        status: "generating",
        job_id: "j1",
        selection_token: "tok",
        ready: false,
      })?.token,
    ).toBe("tok");

    expect(readPromptJob({ status: "generating", job_id: "j1", token: "tok" })?.token).toBe("tok");
  });

  it("keeps the media type and aspect ratio the pipeline chose", () => {
    const job = readPromptJob({
      job_id: "j1",
      token: "tok",
      media_type: "IMAGE",
      aspect_ratio: "1:1",
    });
    expect(job?.mediaType).toBe("IMAGE");
    expect(job?.aspectRatio).toBe("1:1");
  });

  it("is null without a job id and a token", () => {
    // Both are needed to poll. Half a handle is not a job.
    expect(readPromptJob({ job_id: "j1" })).toBeNull();
    expect(readPromptJob({ token: "tok" })).toBeNull();
    expect(readPromptJob(null)).toBeNull();
  });
});

describe("readPrompts", () => {
  const READY = {
    status: "awaiting_selection",
    ready: true,
    complete: true,
    prompts: [
      { index: 0, model: "gpt-5.5", prompt: "3-shot vertical duo", prompt_chars: 960, warnings: [] },
      { index: 1, model: "deepseek-v4-flash", prompt: "2-shot UGC ad", prompt_chars: 1017 },
    ],
  };

  it("reads the choices once they are ready", () => {
    const result = readPrompts(READY);
    expect(result.ready).toBe(true);
    expect(result.prompts).toHaveLength(2);
    expect(result.prompts[1]).toEqual({
      index: 1,
      model: "deepseek-v4-flash",
      prompt: "2-shot UGC ad",
      warnings: [],
    });
  });

  it("is not ready while they are still being written", () => {
    const result = readPrompts({ status: "generating", ready: false });
    expect(result.ready).toBe(false);
    expect(result.prompts).toEqual([]);
  });

  it("is not ready when the list is there but empty", () => {
    // `ready: true` with nothing to choose from would show an empty picker.
    expect(readPrompts({ ready: true, prompts: [] }).ready).toBe(false);
  });

  it("drops entries with no prompt text and reindexes nothing", () => {
    const result = readPrompts({
      ready: true,
      prompts: [{ index: 0, model: "a", prompt: "" }, { index: 1, model: "b", prompt: "real" }],
    });
    expect(result.prompts).toHaveLength(1);
    // The index is the backend's: `select-prompt` sends it back as `chosen`.
    expect(result.prompts[0]?.index).toBe(1);
  });

  it("survives a reply that is not shaped like a reply", () => {
    expect(readPrompts(null).prompts).toEqual([]);
    expect(readPrompts("generating").prompts).toEqual([]);
    expect(readPrompts({ prompts: "none" }).prompts).toEqual([]);
  });

  it("keeps warnings, which are about the prompt the customer is picking", () => {
    const result = readPrompts({
      ready: true,
      prompts: [{ index: 0, model: "a", prompt: "p", warnings: ["too long for 1:1"] }],
    });
    expect(result.prompts[0]?.warnings).toEqual(["too long for 1:1"]);
  });
});

describe("readPrompts' done rule (legacy spec)", () => {
  const one = (index: number, prompt = `p${index}`) => ({ index, model: `m${index}`, prompt });

  it("is done on `complete: true`, a `selected` status, or three prompts", () => {
    expect(readPrompts({ complete: true, prompts: [one(0)] }).ready).toBe(true);
    expect(readPrompts({ status: "selected", prompts: [one(0)] }).ready).toBe(true);
    expect(readPrompts({ prompts: [one(0), one(1), one(2)] }).ready).toBe(true);
  });

  it("is not done on two prompts and the backend's own `ready` alone", () => {
    expect(readPrompts({ ready: true, status: "awaiting_selection", prompts: [one(0), one(1)] }).ready).toBe(false);
    expect(readPrompts({ complete: "true", prompts: [one(0)] }).ready).toBe(false);
  });

  it("is never done without a prompt that has text", () => {
    expect(readPrompts({ complete: true, prompts: [] }).ready).toBe(false);
    expect(readPrompts({ status: "selected", prompts: [one(0, " ")] }).ready).toBe(false);
    expect(readPrompts({ prompts: [one(0, ""), one(1, ""), one(2, "")] }).ready).toBe(false);
    expect(readPrompts({ prompts: [one(0, ""), one(1, ""), one(2)] }).ready).toBe(true);
  });
});

describe("PromptJob", () => {
  it("carries what the launch payload needs about the pick", () => {
    const job: PromptJob = { jobId: "j1", token: "t", mediaType: "IMAGE", aspectRatio: "1:1" };
    expect(job.jobId).toBe("j1");
  });
});
