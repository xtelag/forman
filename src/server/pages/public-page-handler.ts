import { resolveSystemTexts } from "@/shared/system-texts";
import type { PagePresentation } from "@/shared/contracts/page";
import type { createDatabase } from "@/server/db/client";

import { findPageByPublicId, type PageRecord } from "./page-service";
import { createPageViewModel, type PageField } from "./page-view-model";

type FormanDatabase = ReturnType<typeof createDatabase>["db"];

export type PublicPageModel = {
  altchaEnabled: boolean;
  challengeUrl: string;
  presentation?: PagePresentation;
  sessionsEnabled?: boolean;
  sessionUrl?: string;
  preview?: boolean;
  description?: string;
  fields: PageField[];
  sourceSchema?: string;
  sourceId: string;
  honeypotEnabled: boolean;
  honeypotFieldNames: string[];
  pageId: string;
  submissionUrl: string;
  submitLabel: string;
  title: string;
};

function createModel(page: PageRecord): PublicPageModel | null {
  if (page.sourceType === "m2m") return null;
  if (!page.fieldDefinitionMode || !page.fieldDefinitionSource) return null;
  try {
    const model = createPageViewModel({
      mode: page.fieldDefinitionMode,
      presentation: page.presentation,
      source: page.fieldDefinitionSource,
    });
    if (model.fields.length === 0) return null;
    return {
      altchaEnabled: page.altchaEnabled,
      challengeUrl: `/api/challenge/${page.sourcePublicId}`,
      presentation: page.presentation ?? {},
      sessionsEnabled: page.sourceType === "session",
      sessionUrl: `/api/submit/${page.sourcePublicId}`,
      ...(page.presentation?.description
        ? { description: page.presentation.description }
        : {}),
      fields: model.fields,
      sourceSchema: page.fieldDefinitionSource,
      sourceId: page.sourcePublicId,
      honeypotEnabled: page.honeypotEnabled,
      honeypotFieldNames: page.honeypotFieldNames,
      pageId: page.pageId,
      submissionUrl: `/api/submit/${page.sourcePublicId}?page=${encodeURIComponent(page.pageId)}`,
      submitLabel: resolveSystemTexts(page.presentation?.language ?? "en", page.presentation?.systemTexts).submit,
      title: page.presentation?.title ?? page.name,
    };
  } catch {
    return null;
  }
}

export function createPublicPageHandler({
  database,
}: {
  database: FormanDatabase;
}) {
  return {
    async get(publicPageId: string): Promise<PublicPageModel | null> {
      const page = await findPageByPublicId(database, publicPageId);
      if (!page?.enabled || !page.sourceEnabled) return null;
      const model = createModel(page);
      return model;
    },
    async getPreview(pageId: string): Promise<PublicPageModel | null> {
      const page = await findPageByPublicId(database, pageId);
      const model = page ? createModel(page) : null;
      return model ? { ...model, preview: true } : null;
    },
  };
}
