import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { visionTool } from "@sanity/vision";
import { schemaTypes } from "./sanity/schemas";

const projectId =
  process.env.SANITY_STUDIO_PROJECT_ID ||
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset =
  process.env.SANITY_STUDIO_DATASET || process.env.NEXT_PUBLIC_SANITY_DATASET;

if (!projectId || !dataset) {
  throw new Error(
    "Missing Sanity configuration. Set SANITY_STUDIO_PROJECT_ID/SANITY_STUDIO_DATASET or NEXT_PUBLIC_SANITY_PROJECT_ID/NEXT_PUBLIC_SANITY_DATASET.",
  );
}

export default defineConfig({
  name: "bodyspace",
  title: "Bodyspace Recovery Studio",

  projectId,
  dataset,

  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title("Content")
          .items([
            S.listItem()
              .title("🏠 Home Page")
              .child(
                S.document().schemaType("homePage").documentId("homePage"),
              ),
            S.listItem()
              .title("ℹ️ About Page")
              .child(S.document().schemaType("page").documentId("about")),
            S.divider(),
            S.listItem()
              .title("💆 Treatments")
              .schemaType("treatment")
              .child(S.documentTypeList("treatment")),
            S.listItem()
              .title("🗂️ Treatment Categories")
              .schemaType("treatmentCategory")
              .child(S.documentTypeList("treatmentCategory")),
            S.divider(),
            S.listItem()
              .title("💰 Pricing")
              .schemaType("pricingItem")
              .child(S.documentTypeList("pricingItem")),
            S.listItem()
              .title("📰 Blog Posts")
              .schemaType("blogPost")
              .child(S.documentTypeList("blogPost")),
            S.divider(),
            S.listItem()
              .title("⚙️ Site Settings")
              .child(
                S.document()
                  .schemaType("siteSettings")
                  .documentId("siteSettings"),
              ),
          ]),
    }),
    visionTool(),
  ],

  schema: {
    types: schemaTypes,
  },
});
