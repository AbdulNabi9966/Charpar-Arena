import { Router, type IRouter } from "express";
import { db, usersTable, gameResultsTable } from "@workspace/db";
import { desc, sql, count } from "drizzle-orm";

const router: IRouter = Router();

router.get("/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 100);

    const users = await db
      .select()
      .from(usersTable)
      .orderBy(desc(usersTable.eloRating))
      .limit(limit);

    const leaderboard = await Promise.all(
      users.map(async (user, index) => {
        const results = await db
          .select()
          .from(gameResultsTable)
          .where(sql`${gameResultsTable.userId} = ${user.id}`);

        const wins = results.filter(r => r.result === "win").length;
        const losses = results.filter(r => r.result === "loss").length;
        const totalGames = results.length;
        const winRate = totalGames > 0 ? wins / totalGames : 0;

        const sorted = [...results].sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
        let currentStreak = 0;
        let streak = 0;
        for (const r of sorted) {
          if (r.result === "win") {
            streak++;
            currentStreak = streak;
          } else {
            break;
          }
        }

        return {
          rank: index + 1,
          userId: user.id,
          username: user.username,
          avatar: user.avatar,
          eloRating: user.eloRating,
          wins,
          losses,
          winRate,
          currentStreak,
        };
      })
    );

    res.json(leaderboard);
  } catch (error) {
    console.error("Get leaderboard error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/leaderboard/summary", async (_req, res) => {
  try {
    const [{ totalPlayers }] = await db.select({ totalPlayers: count() }).from(usersTable);
    const [{ totalGamesPlayed }] = await db.select({ totalGamesPlayed: count() }).from(gameResultsTable);

    const users = await db.select({ eloRating: usersTable.eloRating }).from(usersTable);
    const topElo = users.length > 0 ? Math.max(...users.map(u => u.eloRating)) : 1000;
    const averageElo = users.length > 0
      ? Math.round(users.reduce((sum, u) => sum + u.eloRating, 0) / users.length)
      : 1000;

    res.json({
      totalPlayers: totalPlayers ?? 0,
      totalGamesPlayed: Math.floor((totalGamesPlayed ?? 0) / 2),
      topElo,
      averageElo,
    });
  } catch (error) {
    console.error("Get leaderboard summary error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
