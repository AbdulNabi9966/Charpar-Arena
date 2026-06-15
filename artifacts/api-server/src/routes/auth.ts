import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createGuestUser, createToken, generateId } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/guest", async (req, res) => {
  try {
    const { username } = req.body as { username?: string };
    const { user, token } = await createGuestUser(username);
    res.json({ user, token });
  } catch (error) {
    console.error("Guest auth error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/google", async (req, res) => {
  try {
    const { credential } = req.body as { credential?: string };
    if (!credential) {
      res.status(400).json({ error: "Missing credential" });
      return;
    }

    // Decode the JWT payload
    try {
      const parts = credential.split(".");
      let payload: { sub?: string; email?: string; name?: string; picture?: string } = {};
      if (parts.length === 3) {
        const decoded = Buffer.from(parts[1], "base64url").toString();
        payload = JSON.parse(decoded);
      } else {
        // Mock credential for development/demo
        payload = { sub: `mock_${Date.now()}`, name: "Demo Player", email: "demo@example.com" };
      }

      const googleId = payload.sub || `google_${Date.now()}`;
      const email = payload.email ?? null;
      const name = payload.name ?? "Player";
      const avatar = payload.picture ?? null;

      // Find existing user by googleId
      const [existing] = await db.select().from(usersTable).where(eq(usersTable.googleId, googleId));

      if (existing) {
        const token = createToken(existing.id);
        res.json({ user: existing, token });
        return;
      }

      // Create new user
      const id = generateId();
      const [user] = await db.insert(usersTable).values({
        id,
        username: name,
        email,
        avatar,
        isGuest: false,
        googleId,
        eloRating: 1000,
      }).returning();

      const token = createToken(id);
      res.json({ user, token });
    } catch (err) {
      req.log?.error({ err }, "Google login error");
      res.status(400).json({ error: "Invalid credential" });
    }
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", async (_req, res) => {
  res.json({ message: "Logged out" });
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { verifyToken, getUserById } = await import("../lib/auth");
    const userId = verifyToken(token);
    if (!userId) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const user = await getUserById(userId);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error("Auth me error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
