import { db } from "../../db/index.js";
import { newsArticles } from "../../db/schema/cms.js";
import { kaders } from "../../db/schema/auth.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "../../middlewares/error.middleware.js";
import { RevalidateService } from "../../services/revalidate.service.js";
import type {
  CreateNewsInput,
  NewsQueryInput,
  UpdateNewsInput,
} from "./news.schema.js";

export class NewsService {
  private baseSelect() {
    return db
      .select({
        id: newsArticles.id,
        title: newsArticles.title,
        category: newsArticles.category,
        summary: newsArticles.summary,
        content: newsArticles.content,
        imageSrc: newsArticles.imageSrc,
        imageAlt: newsArticles.imageAlt,
        slotStatus: newsArticles.slotStatus,
        targetAudience: newsArticles.targetAudience,
        isFeatured: newsArticles.isFeatured,
        isPublished: newsArticles.isPublished,
        sortOrder: newsArticles.sortOrder,
        publishedAt: newsArticles.publishedAt,
        createdBy: newsArticles.createdBy,
        authorName: kaders.fullName,
        createdAt: newsArticles.createdAt,
        updatedAt: newsArticles.updatedAt,
      })
      .from(newsArticles)
      .leftJoin(kaders, eq(newsArticles.createdBy, kaders.id));
  }

  private async triggerNewsRevalidate() {
    try {
      await RevalidateService.triggerRevalidation(["news", "home"]);
    } catch {
      // Best-effort ISR revalidation
    }
  }

  async getPublicNews(category?: NewsQueryInput["category"]) {
    const conditions = [
      eq(newsArticles.isPublished, true),
      inArray(newsArticles.targetAudience, ["PUBLIC", "BOTH"]),
    ];
    if (category) conditions.push(eq(newsArticles.category, category));

    return await this.baseSelect()
      .where(and(...conditions))
      .orderBy(
        asc(newsArticles.sortOrder),
        desc(newsArticles.publishedAt),
        desc(newsArticles.createdAt)
      );
  }

  async getPublicNewsById(id: string) {
    const rows = await this.baseSelect()
      .where(
        and(
          eq(newsArticles.id, id),
          eq(newsArticles.isPublished, true),
          inArray(newsArticles.targetAudience, ["PUBLIC", "BOTH"])
        )
      )
      .limit(1);

    if (!rows.length) {
      throw new AppError(404, "NOT_FOUND", "Berita tidak ditemukan");
    }
    return rows[0];
  }

  async getInternalNews(category?: NewsQueryInput["category"]) {
    const conditions = [
      eq(newsArticles.isPublished, true),
      inArray(newsArticles.targetAudience, ["INTERNAL", "BOTH"]),
    ];
    if (category) conditions.push(eq(newsArticles.category, category));

    return await this.baseSelect()
      .where(and(...conditions))
      .orderBy(
        asc(newsArticles.sortOrder),
        desc(newsArticles.publishedAt),
        desc(newsArticles.createdAt)
      );
  }

  async getInternalNewsById(id: string) {
    const rows = await this.baseSelect()
      .where(
        and(
          eq(newsArticles.id, id),
          eq(newsArticles.isPublished, true),
          inArray(newsArticles.targetAudience, ["INTERNAL", "BOTH"])
        )
      )
      .limit(1);

    if (!rows.length) {
      throw new AppError(404, "NOT_FOUND", "Berita tidak ditemukan");
    }
    return rows[0];
  }

  async listManageNews(query: NewsQueryInput) {
    const conditions = [];
    if (query.category) conditions.push(eq(newsArticles.category, query.category));
    if (query.targetAudience) {
      conditions.push(eq(newsArticles.targetAudience, query.targetAudience));
    }
    if (query.isPublished !== undefined) {
      conditions.push(eq(newsArticles.isPublished, query.isPublished));
    }

    return await this.baseSelect()
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        asc(newsArticles.sortOrder),
        desc(newsArticles.publishedAt),
        desc(newsArticles.createdAt)
      );
  }

  async createNews(input: CreateNewsInput, actorKaderId: string) {
    const imageSrc = input.imageSrc && input.imageSrc.length > 0 ? input.imageSrc : null;
    const slotStatus = imageSrc ? "ready" : "pending-asset";
    const publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();

    let nextSortOrder = input.sortOrder;
    if (nextSortOrder === undefined) {
      const [agg] = await db
        .select({
          maxSort: sql<number>`coalesce(max(${newsArticles.sortOrder}), 0)`,
          totalCount: sql<number>`count(*)`,
        })
        .from(newsArticles);
      nextSortOrder =
        Math.max(Number(agg?.maxSort ?? 0), Number(agg?.totalCount ?? 0)) + 1;
    }

    const [created] = await db
      .insert(newsArticles)
      .values({
        title: input.title,
        category: input.category,
        summary: input.summary,
        content: input.content,
        imageSrc,
        imageAlt: imageSrc ? input.imageAlt || input.title : null,
        slotStatus,
        targetAudience: input.targetAudience,
        isFeatured: input.isFeatured ?? false,
        isPublished: input.isPublished ?? true,
        sortOrder: nextSortOrder,
        publishedAt,
        createdBy: actorKaderId,
      })
      .returning();

    await this.triggerNewsRevalidate();
    return created;
  }

  async reorderNews(orderedIds: string[]) {
    const uniqueRequested = Array.from(new Set(orderedIds));
    const allRows = await db
      .select({ id: newsArticles.id })
      .from(newsArticles)
      .orderBy(
        asc(newsArticles.sortOrder),
        desc(newsArticles.publishedAt),
        desc(newsArticles.createdAt)
      );

    const validIds = allRows.map((r) => r.id);
    const validSet = new Set(validIds);
    const cleanRequested = uniqueRequested.filter((id) => validSet.has(id));
    if (cleanRequested.length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "Tidak ada ID berita valid untuk diurutkan");
    }

    // Slot-preserving merge: works seamlessly whether full list or filtered subset is reordered
    const requestedSet = new Set(cleanRequested);
    let cursor = 0;
    const finalOrder = validIds.map((id) =>
      requestedSet.has(id) ? cleanRequested[cursor++] : id
    );

    await db.transaction(async (tx) => {
      for (let i = 0; i < finalOrder.length; i++) {
        await tx
          .update(newsArticles)
          .set({ sortOrder: i + 1 })
          .where(eq(newsArticles.id, finalOrder[i]));
      }
    });

    await this.triggerNewsRevalidate();
    return { orderedIds: finalOrder };
  }

  async updateNews(id: string, input: UpdateNewsInput) {
    const existing = await db
      .select()
      .from(newsArticles)
      .where(eq(newsArticles.id, id))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Berita tidak ditemukan");
    }

    const curr = existing[0];
    const nextImageSrc =
      input.imageSrc !== undefined
        ? input.imageSrc && input.imageSrc.length > 0
          ? input.imageSrc
          : null
        : curr.imageSrc;

    const patch: Record<string, any> = {
      updatedAt: new Date(),
    };
    if (input.title !== undefined) patch.title = input.title;
    if (input.category !== undefined) patch.category = input.category;
    if (input.summary !== undefined) patch.summary = input.summary;
    if (input.content !== undefined) patch.content = input.content;
    if (input.imageSrc !== undefined) {
      patch.imageSrc = nextImageSrc;
      patch.slotStatus = nextImageSrc ? "ready" : "pending-asset";
    }
    if (input.imageAlt !== undefined) {
      patch.imageAlt = nextImageSrc ? input.imageAlt || null : null;
    }
    if (input.targetAudience !== undefined) patch.targetAudience = input.targetAudience;
    if (input.isFeatured !== undefined) patch.isFeatured = input.isFeatured;
    if (input.isPublished !== undefined) patch.isPublished = input.isPublished;
    if (input.publishedAt !== undefined) patch.publishedAt = new Date(input.publishedAt);

    const [updated] = await db
      .update(newsArticles)
      .set(patch)
      .where(eq(newsArticles.id, id))
      .returning();

    await this.triggerNewsRevalidate();
    return updated;
  }

  async deleteNews(id: string) {
    const existing = await db
      .select({ id: newsArticles.id })
      .from(newsArticles)
      .where(eq(newsArticles.id, id))
      .limit(1);

    if (!existing.length) {
      throw new AppError(404, "NOT_FOUND", "Berita tidak ditemukan");
    }

    await db.delete(newsArticles).where(eq(newsArticles.id, id));
    await this.triggerNewsRevalidate();
    return { id };
  }
}

export const newsService = new NewsService();
