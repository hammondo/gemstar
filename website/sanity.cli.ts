import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId:
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
      process.env.SANITY_STUDIO_PROJECT_ID,
    dataset:
      process.env.NEXT_PUBLIC_SANITY_DATASET ||
      process.env.SANITY_STUDIO_DATASET ||
      "production",
  },
});
