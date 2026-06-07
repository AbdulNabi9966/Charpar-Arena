import { Server, Socket } from "socket.io";
import crypto from "crypto";
import { db, gamesTable, gameResultsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { createInitialState, applyMove, type Player, type GameState } from "./gameLogic";

interface QueueEntry {
  socketId: string;
  userId: string;
  username: string;
  mode: "casual" | "ranked";
  joinedAt: number;
}

interface ActiveGame {
  gameId: string;
  player1SocketId: string;
  player2SocketId: string;
  player1Id: string;
  player2Id: string;
  player1Username: string;
  player2Username: string;
  mode: "casual" | "ranked";
  state: GameState;
  startedAt: number;
}

const casualQueue: QueueEntry[] = [];
const rankedQueue: QueueEntry[] = [];
const activeGames = new Map<string, ActiveGame>();
const socketToGame = new Map<string, string>();
const socketToUser = new Map<string, { userId: string; username: string }>();

function generateGameId(): string {
  return crypto.randomUUID();
}

async function createGameRecord(game: ActiveGame): Promise<void> {
  await db.insert(gamesTable).values({
    id: game.gameId,
    player1Id: game.player1Id,
    player1Username: game.player1Username,
    player2Id: game.player2Id,
    player2Username: game.player2Username,
    mode: game.mode,
    status: "active",
    boardState: JSON.stringify(game.state.board),
    currentPlayer: game.state.currentPlayer,
    phase: game.state.phase,
  });
}

async function finalizeGame(gameId: string, winnerId: string, loserId: string, io: Server): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) return;

  const duration = Math.round((Date.now() - game.startedAt) / 1000);

  let winnerEloDelta = 0;
  let loserEloDelta = 0;

  if (game.mode === "ranked") {
    const [winner] = await db.select().from(usersTable).where(eq(usersTable.id, winnerId));
    const [loser] = await db.select().from(usersTable).where(eq(usersTable.id, loserId));

    if (winner && loser) {
      const K = 32;
      const expectedWin = 1 / (1 + Math.pow(10, (loser.eloRating - winner.eloRating) / 400));
      winnerEloDelta = Math.round(K * (1 - expectedWin));
      loserEloDelta = -Math.round(K * expectedWin);

      await db.update(usersTable).set({ eloRating: winner.eloRating + winnerEloDelta }).where(eq(usersTable.id, winnerId));
      await db.update(usersTable).set({ eloRating: Math.max(100, loser.eloRating + loserEloDelta) }).where(eq(usersTable.id, loserId));
    }
  }

  await db.update(gamesTable).set({
    status: "completed",
    winnerId,
    duration,
    completedAt: new Date(),
  }).where(eq(gamesTable.id, gameId));

  const winnerUsername = winnerId === game.player1Id ? game.player1Username : game.player2Username;
  const loserUsername = loserId === game.player1Id ? game.player1Username : game.player2Username;

  await db.insert(gameResultsTable).values([
    {
      id: crypto.randomUUID(),
      gameId,
      userId: winnerId,
      opponentId: loserId,
      opponentUsername: loserUsername,
      result: "win",
      mode: game.mode,
      eloDelta: winnerEloDelta,
      duration,
    },
    {
      id: crypto.randomUUID(),
      gameId,
      userId: loserId,
      opponentId: winnerId,
      opponentUsername: winnerUsername,
      result: "loss",
      mode: game.mode,
      eloDelta: loserEloDelta,
      duration,
    },
  ]);

  activeGames.delete(gameId);
  socketToGame.delete(game.player1SocketId);
  socketToGame.delete(game.player2SocketId);
}

function tryMatch(queue: QueueEntry[], mode: "casual" | "ranked", io: Server): void {
  while (queue.length >= 2) {
    const p1 = queue.shift()!;
    const p2 = queue.shift()!;

    const gameId = generateGameId();
    const state = createInitialState();

    const game: ActiveGame = {
      gameId,
      player1SocketId: p1.socketId,
      player2SocketId: p2.socketId,
      player1Id: p1.userId,
      player2Id: p2.userId,
      player1Username: p1.username,
      player2Username: p2.username,
      mode,
      state,
      startedAt: Date.now(),
    };

    activeGames.set(gameId, game);
    socketToGame.set(p1.socketId, gameId);
    socketToGame.set(p2.socketId, gameId);

    createGameRecord(game).catch(err => logger.error({ err }, "Failed to create game record"));

    const p1Socket = io.sockets.sockets.get(p1.socketId);
    const p2Socket = io.sockets.sockets.get(p2.socketId);

    if (p1Socket) {
      p1Socket.emit("matched", {
        gameId,
        playerNumber: 1,
        opponent: { id: p2.userId, username: p2.username },
        state,
      });
    }

    if (p2Socket) {
      p2Socket.emit("matched", {
        gameId,
        playerNumber: 2,
        opponent: { id: p1.userId, username: p1.username },
        state,
      });
    }

    logger.info({ gameId, p1: p1.userId, p2: p2.userId, mode }, "Game matched");
  }
}

export function setupSocketIO(io: Server): void {
  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("register", (data: { userId: string; username: string }) => {
      socketToUser.set(socket.id, { userId: data.userId, username: data.username });

      // Check if this user had an active game (reconnect)
      for (const [gameId, game] of activeGames.entries()) {
        if (game.player1Id === data.userId || game.player2Id === data.userId) {
          const playerNumber = game.player1Id === data.userId ? 1 : 2;
          const opponentId = playerNumber === 1 ? game.player2Id : game.player1Id;
          const opponentUsername = playerNumber === 1 ? game.player2Username : game.player1Username;

          // Update socket reference
          if (playerNumber === 1) {
            socketToGame.set(socket.id, gameId);
            if (game.player1SocketId !== socket.id) {
              socketToGame.delete(game.player1SocketId);
              game.player1SocketId = socket.id;
            }
          } else {
            socketToGame.set(socket.id, gameId);
            if (game.player2SocketId !== socket.id) {
              socketToGame.delete(game.player2SocketId);
              game.player2SocketId = socket.id;
            }
          }

          socket.emit("reconnected", {
            gameId,
            playerNumber,
            opponent: { id: opponentId, username: opponentUsername },
            state: game.state,
          });

          // Notify opponent
          const opponentSocketId = playerNumber === 1 ? game.player2SocketId : game.player1SocketId;
          const opponentSocket = io.sockets.sockets.get(opponentSocketId);
          if (opponentSocket) {
            opponentSocket.emit("opponent_reconnected");
          }

          logger.info({ socketId: socket.id, gameId, playerNumber }, "Player reconnected");
          return;
        }
      }
    });

    socket.on("join_queue", (data: { mode: "casual" | "ranked"; userId: string; username: string }) => {
      const queue = data.mode === "ranked" ? rankedQueue : casualQueue;

      // Remove from any existing queue
      const casualIdx = casualQueue.findIndex(e => e.userId === data.userId);
      if (casualIdx !== -1) casualQueue.splice(casualIdx, 1);
      const rankedIdx = rankedQueue.findIndex(e => e.userId === data.userId);
      if (rankedIdx !== -1) rankedQueue.splice(rankedIdx, 1);

      queue.push({
        socketId: socket.id,
        userId: data.userId,
        username: data.username,
        mode: data.mode,
        joinedAt: Date.now(),
      });

      socket.emit("queued", { position: queue.length, mode: data.mode });
      tryMatch(queue, data.mode, io);

      logger.info({ userId: data.userId, mode: data.mode, queueSize: queue.length }, "Player joined queue");
    });

    socket.on("leave_queue", () => {
      const user = socketToUser.get(socket.id);
      if (!user) return;

      const casualIdx = casualQueue.findIndex(e => e.socketId === socket.id);
      if (casualIdx !== -1) casualQueue.splice(casualIdx, 1);

      const rankedIdx = rankedQueue.findIndex(e => e.socketId === socket.id);
      if (rankedIdx !== -1) rankedQueue.splice(rankedIdx, 1);

      socket.emit("queue_left");
    });

    socket.on("make_move", (data: { gameId: string; playerNumber: Player; from: number | null; to: number }) => {
      const game = activeGames.get(data.gameId);
      if (!game) {
        socket.emit("move_error", { error: "Game not found" });
        return;
      }

      const expectedSocketId = data.playerNumber === 1 ? game.player1SocketId : game.player2SocketId;
      if (socket.id !== expectedSocketId) {
        socket.emit("move_error", { error: "Not your game socket" });
        return;
      }

      const result = applyMove(game.state, data.playerNumber, data.from, data.to);

      if (!result.valid) {
        socket.emit("move_error", { error: result.error });
        return;
      }

      game.state = result.newState!;

      // Broadcast new state to both players
      const player1Socket = io.sockets.sockets.get(game.player1SocketId);
      const player2Socket = io.sockets.sockets.get(game.player2SocketId);

      const movePayload = {
        gameId: data.gameId,
        from: data.from,
        to: data.to,
        playerNumber: data.playerNumber,
        state: game.state,
      };

      if (player1Socket) player1Socket.emit("move_made", movePayload);
      if (player2Socket) player2Socket.emit("move_made", movePayload);

      // Handle game over
      if (game.state.winner) {
        const winnerId = game.state.winner === 1 ? game.player1Id : game.player2Id;
        const loserId = game.state.winner === 1 ? game.player2Id : game.player1Id;

        finalizeGame(data.gameId, winnerId, loserId, io).catch(err =>
          logger.error({ err }, "Failed to finalize game")
        );
      }
    });

    socket.on("resign", (data: { gameId: string; playerNumber: Player }) => {
      const game = activeGames.get(data.gameId);
      if (!game) return;

      const winnerId = data.playerNumber === 1 ? game.player2Id : game.player1Id;
      const loserId = data.playerNumber === 1 ? game.player1Id : game.player2Id;
      const winnerPlayerNum = data.playerNumber === 1 ? 2 : 1;

      const resignPayload = { gameId: data.gameId, winnerPlayerNumber: winnerPlayerNum, reason: "resign" };

      const p1Socket = io.sockets.sockets.get(game.player1SocketId);
      const p2Socket = io.sockets.sockets.get(game.player2SocketId);
      if (p1Socket) p1Socket.emit("game_over", resignPayload);
      if (p2Socket) p2Socket.emit("game_over", resignPayload);

      finalizeGame(data.gameId, winnerId, loserId, io).catch(err =>
        logger.error({ err }, "Failed to finalize resigned game")
      );
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");

      const gameId = socketToGame.get(socket.id);
      if (gameId) {
        const game = activeGames.get(gameId);
        if (game) {
          const isPlayer1 = game.player1SocketId === socket.id;
          const opponentSocketId = isPlayer1 ? game.player2SocketId : game.player1SocketId;
          const opponentSocket = io.sockets.sockets.get(opponentSocketId);
          if (opponentSocket) {
            opponentSocket.emit("opponent_disconnected");
          }
        }
      }

      // Remove from queues
      const casualIdx = casualQueue.findIndex(e => e.socketId === socket.id);
      if (casualIdx !== -1) casualQueue.splice(casualIdx, 1);

      const rankedIdx = rankedQueue.findIndex(e => e.socketId === socket.id);
      if (rankedIdx !== -1) rankedQueue.splice(rankedIdx, 1);

      socketToUser.delete(socket.id);
    });
  });
}
