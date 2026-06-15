import { Router, type IRouter } from "express";
import { db, gamesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/games", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 50);

    const games = await db
      .select()
      .from(gamesTable)
      .orderBy(desc(gamesTable.createdAt))
      .limit(limit);

    res.json(games.map(g => ({
      id: g.id,
      player1Id: g.player1Id,
      player1Username: g.player1Username,
      player2Id: g.player2Id,
      player2Username: g.player2Username,
      mode: g.mode,
      status: g.status,
      winnerId: g.winnerId,
      duration: g.duration,
      createdAt: g.createdAt,
      completedAt: g.completedAt,
    })));
  } catch (error) {
    console.error("Get games error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/games/:gameId", async (req, res) => {
  try {
    const gameId = req.params.gameId;
    if (!gameId) {
      res.status(400).json({ error: "Game ID is required" });
      return;
    }

    const [game] = await db.select().from(gamesTable).where(eq(gamesTable.id, gameId));
    if (!game) {
      res.status(404).json({ error: "Game not found" });
      return;
    }

    res.json({
      id: game.id,
      player1Id: game.player1Id,
      player1Username: game.player1Username,
      player2Id: game.player2Id,
      player2Username: game.player2Username,
      mode: game.mode,
      status: game.status,
      winnerId: game.winnerId,
      duration: game.duration,
      createdAt: game.createdAt,
      completedAt: game.completedAt,
    });
  } catch (error) {
    console.error("Get game error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
