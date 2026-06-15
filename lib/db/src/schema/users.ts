import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),

  username: text("username").notNull(),

  email: text("email"),
  avatar: text("avatar"),
  googleId: text("google_id"),

  isGuest: boolean("is_guest").notNull().default(true),

  eloRating: integer("elo_rating").notNull().default(1000),

  // 🔥 IMPORTANT: must match your actual DB (you showed these exist)
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

/* -------------------- SCHEMA -------------------- */

export const insertUserSchema = createInsertSchema(usersTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
