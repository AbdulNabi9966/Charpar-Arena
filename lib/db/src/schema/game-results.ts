import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gameResultsTable = pgTable("game_results", {
  id: text("id").primaryKey(),
  gameId: text("game_id").notNull(),
  userId: text("user_id").notNull(),
  opponentId: text("opponent_id").notNull(),
  opponentUsername: text("opponent_username").notNull(),
  opponentAvatar: text("opponent_avatar"),
  result: text("result").notNull(), // win | loss
  mode: text("mode").notNull(), // ranked | casual | ai | local
  eloDelta: integer("elo_delta"),
  duration: integer("duration"),
  playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGameResultSchema = createInsertSchema(gameResultsTable).omit({ playedAt: true });
export type InsertGameResult = z.infer<typeof insertGameResultSchema>;
export type GameResult = typeof gameResultsTable.$inferSelect;
