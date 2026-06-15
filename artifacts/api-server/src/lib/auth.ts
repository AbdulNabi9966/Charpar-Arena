import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

/* -------------------- ENV SAFETY -------------------- */

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is not set");
}

const SESSION_SECRET = process.env.SESSION_SECRET;

/* -------------------- UTIL -------------------- */

export function generateId(): string {
  return crypto.randomUUID();
}

export function generateGuestName(): string {
  const adjectives = ["Swift", "Bold", "Sharp", "Quick", "Clever", "Brave", "Keen", "Bright"];
  const nouns = ["Knight", "Rook", "Pawn", "Bishop", "King", "Queen", "Mover", "Tactician"];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;

  return `${adj}${noun}${num}`;
}

/* -------------------- TOKEN -------------------- */

export function createToken(userId: string): string {
  const payload = { userId, iat: Date.now() };
  const data = JSON.stringify(payload);

  const sig = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(data)
    .digest("hex");

  return Buffer.from(data).toString("base64url") + "." + sig;
}

export function verifyToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [encodedData, sig] = parts;
    const data = Buffer.from(encodedData, "base64url").toString();

    const expectedSig = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(data)
      .digest("hex");

    if (sig !== expectedSig) return null;

    const payload = JSON.parse(data) as { userId: string; iat: number };
    return payload.userId;
  } catch (err) {
    logger.warn("Token verification failed");
    return null;
  }
}

/* -------------------- USER FETCH -------------------- */

export async function getUserById(userId: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  return user ?? null;
}

/* -------------------- CREATE GUEST USER -------------------- */

export async function createGuestUser(username?: string) {
  const id = generateId();
  const name = username?.trim() || generateGuestName();

  try {
    const [user] = await db.insert(usersTable).values({
      id,
      username: name,
      isGuest: true,
      eloRating: 1000,

      // 🔥 IMPORTANT: explicitly set to avoid DB mismatch issues
      wins: 0,
      losses: 0,
    }).returning();

    return {
      user,
      token: createToken(id),
    };
  } catch (err) {
    logger.error({ err }, "Failed to create guest user");
    throw err;
  }
}
