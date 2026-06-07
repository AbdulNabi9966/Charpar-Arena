import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gamesTable = pgTable("games", {
  id: text("id").primaryKey(),
  player1Id: text("player1_id").notNull(),
  player1Username: text("player1_username").notNull(),
  player2Id: text("player2_id"),
  player2Username: text("player2_username"),
  mode: text("mode").notNull(), // ranked | casual | ai | local
  status: text("status").notNull().default("waiting"), // waiting | active | completed | abandoned
  winnerId: text("winner_id"),
  boardState: text("board_state"), // JSON serialized board
  currentPlayer: integer("current_player").default(1), // 1 or 2
  phase: text("phase").default("placement"), // placement | movement
  duration: integer("duration"), // seconds
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({ createdAt: true, completedAt: true });
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;
