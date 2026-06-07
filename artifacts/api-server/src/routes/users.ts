import { Router, type IRouter } from "express";
import { db, usersTable, gameResultsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/users/:userId", async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const results = await db.select().from(gameResultsTable).where(eq(gameResultsTable.userId, userId));

  const wins = results.filter(r => r.result === "win").length;
  const losses = results.filter(r => r.result === "loss").length;
  const totalGames = results.length;
  const winRate = totalGames > 0 ? wins / totalGames : 0;

  // Calculate streaks
  const sorted = [...results].sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  let currentStreak = 0;
  let bestStreak = 0;
  let streak = 0;
  for (const r of sorted) {
    if (r.result === "win") {
      streak++;
      if (currentStreak === 0 || streak > 0) currentStreak = streak;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      if (currentStreak > 0 && streak === 0) currentStreak = 0;
      streak = 0;
    }
  }

  const rankedResults = results.filter(r => r.mode === "ranked");
  const rankedWins = rankedResults.filter(r => r.result === "win").length;

  const stats = {
    totalGames,
    wins,
    losses,
    winRate,
    currentStreak,
    bestStreak,
    rankedGames: rankedResults.length,
    rankedWins,
  };

  res.json({ ...user, stats });
});

router.get("/users/:userId/stats", async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const results = await db.select().from(gameResultsTable).where(eq(gameResultsTable.userId, userId));

  const wins = results.filter(r => r.result === "win").length;
  const losses = results.filter(r => r.result === "loss").length;
  const totalGames = results.length;
  const winRate = totalGames > 0 ? wins / totalGames : 0;

  const sorted = [...results].sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime());
  let currentStreak = 0;
  let bestStreak = 0;
  let streak = 0;
  for (const r of sorted) {
    if (r.result === "win") {
      streak++;
      currentStreak = streak;
      bestStreak = Math.max(bestStreak, streak);
    } else {
      if (streak > 0) currentStreak = 0;
      streak = 0;
    }
  }

  const rankedResults = results.filter(r => r.mode === "ranked");
  const rankedWins = rankedResults.filter(r => r.result === "win").length;

  res.json({
    totalGames,
    wins,
    losses,
    winRate,
    currentStreak,
    bestStreak,
    rankedGames: rankedResults.length,
    rankedWins,
  });
});

router.get("/users/:userId/history", async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const results = await db
    .select()
    .from(gameResultsTable)
    .where(eq(gameResultsTable.userId, userId))
    .orderBy(sql`${gameResultsTable.playedAt} DESC`)
    .limit(20);

  res.json(results.map(r => ({
    id: r.id,
    opponentId: r.opponentId,
    opponentUsername: r.opponentUsername,
    opponentAvatar: r.opponentAvatar,
    result: r.result,
    mode: r.mode,
    eloDelta: r.eloDelta,
    duration: r.duration,
    playedAt: r.playedAt,
  })));
});

export default router;
