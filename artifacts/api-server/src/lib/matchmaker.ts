import { Server, Socket } from "socket.io";
import crypto from "crypto";
import { db, gamesTable, gameResultsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import {
  createInitialState, applyMove,
  type Player, type GameState, type BoardSize,
} from "./gameLogic";

interface QueueEntry {
  socketId: string;
  userId: string;
  username: string;
  mode: "casual" | "ranked";
  boardSize: BoardSize;
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
  boardSize: BoardSize;
  state: GameState;
  startedAt: number;
  rematchRequested?: string[];
  status?: "active" | "completed"; // Track game status
}

// Separate queue per (mode, boardSize) — players can only match same board size
const queues: Record<string, QueueEntry[]> = {
  "casual-3": [], "casual-4": [], "casual-5": [],
  "ranked-3": [], "ranked-4": [], "ranked-5": [],
};

const activeGames = new Map<string, ActiveGame>();
const socketToGame = new Map<string, string>();
const socketToUser = new Map<string, { userId: string; username: string }>();

// ── NEW: User socket tracking for multi-device handling ───────────────────
const userSockets = new Map<string, Set<string>>();
let joinInProgress = false;

function queueKey(mode: "casual" | "ranked", boardSize: BoardSize): string {
  return `${mode}-${boardSize}`;
}

function broadcastOnlineCounts(io: Server): void {
  const total = io.sockets.sockets.size;

  const playing: Record<number, number> = { 3: 0, 4: 0, 5: 0 };
  for (const game of activeGames.values()) {
    if (game.status !== "completed") {
      playing[game.boardSize] = (playing[game.boardSize] ?? 0) + 2;
    }
  }

  const searching: Record<number, number> = { 3: 0, 4: 0, 5: 0 };
  for (const [key, queue] of Object.entries(queues)) {
    const size = parseInt(key.split("-")[1]);
    if (size === 3 || size === 4 || size === 5) {
      searching[size] = (searching[size] ?? 0) + queue.length;
    }
  }

  io.emit("online_counts", { total, playing, searching });
}

// ── NEW: Check if user is in an active game ────────────────────────────────
function isUserInActiveGame(userId: string): { gameId: string; game: ActiveGame; playerNumber: number } | null {
  for (const [gameId, game] of activeGames.entries()) {
    if (game.status === "completed") continue;
    if (game.player1Id === userId || game.player2Id === userId) {
      const playerNumber = game.player1Id === userId ? 1 : 2;
      return { gameId, game, playerNumber };
    }
  }
  return null;
}

// ── NEW: Clean up duplicate user connections ──────────────────────────────
function cleanupUserSockets(io: Server, userId: string, currentSocketId?: string) {
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const socketId of sockets) {
      if (socketId !== currentSocketId) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit("duplicate_connection", { 
            message: "Another device connected with the same account" 
          });
          // Don't disconnect forcefully - let the other device handle it
        }
      }
    }
  }
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

async function finalizeGame(
  gameId: string, winnerId: string, loserId: string, io: Server,
): Promise<void> {
  const game = activeGames.get(gameId);
  if (!game) return;

  // Mark game as completed
  game.status = "completed";

  const duration = Math.round((Date.now() - game.startedAt) / 1000);
  let winnerEloDelta = 0, loserEloDelta = 0;

  if (game.mode === "ranked") {
    const [winner] = await db.select().from(usersTable).where(eq(usersTable.id, winnerId));
    const [loser]  = await db.select().from(usersTable).where(eq(usersTable.id, loserId));
    if (winner && loser) {
      const K = 32;
      const exp = 1 / (1 + Math.pow(10, (loser.eloRating - winner.eloRating) / 400));
      winnerEloDelta = Math.round(K * (1 - exp));
      loserEloDelta  = -Math.round(K * exp);
      await db.update(usersTable).set({ eloRating: winner.eloRating + winnerEloDelta }).where(eq(usersTable.id, winnerId));
      await db.update(usersTable).set({ eloRating: Math.max(100, loser.eloRating + loserEloDelta) }).where(eq(usersTable.id, loserId));
    }
  }

  await db.update(gamesTable).set({
    status: "completed", winnerId, duration, completedAt: new Date(),
  }).where(eq(gamesTable.id, gameId));

  const winnerUsername = winnerId === game.player1Id ? game.player1Username : game.player2Username;
  const loserUsername  = loserId  === game.player1Id ? game.player1Username : game.player2Username;

  await db.insert(gameResultsTable).values([
    { id: crypto.randomUUID(), gameId, userId: winnerId, opponentId: loserId,
      opponentUsername: loserUsername, result: "win", mode: game.mode,
      eloDelta: winnerEloDelta, duration },
    { id: crypto.randomUUID(), gameId, userId: loserId, opponentId: winnerId,
      opponentUsername: winnerUsername, result: "loss", mode: game.mode,
      eloDelta: loserEloDelta, duration },
  ]);

  // Notify players game is over before cleanup
  io.to(game.player1SocketId).emit("game_completed", { gameId, winnerId, winnerUsername });
  io.to(game.player2SocketId).emit("game_completed", { gameId, winnerId, winnerUsername });

  // Clean up game references
  activeGames.delete(gameId);
  socketToGame.delete(game.player1SocketId);
  socketToGame.delete(game.player2SocketId);
}

function tryMatch(queue: QueueEntry[], mode: "casual" | "ranked", boardSize: BoardSize, io: Server): void {
  while (queue.length >= 2) {
    const p1 = queue.shift()!;
    const p2 = queue.shift()!;

    // Don't match the same user with themselves
    if (p1.userId === p2.userId) {
      // Put one back and continue
      queue.unshift(p2);
      continue;
    }

    const gameId = crypto.randomUUID();
    const state  = createInitialState(boardSize);

    const game: ActiveGame = {
      gameId,
      player1SocketId: p1.socketId, player2SocketId: p2.socketId,
      player1Id: p1.userId,         player2Id: p2.userId,
      player1Username: p1.username, player2Username: p2.username,
      mode, boardSize, state, startedAt: Date.now(),
      status: "active",
    };

    activeGames.set(gameId, game);
    socketToGame.set(p1.socketId, gameId);
    socketToGame.set(p2.socketId, gameId);

    // Update user socket tracking
    if (!userSockets.has(p1.userId)) {
      userSockets.set(p1.userId, new Set());
    }
    userSockets.get(p1.userId)!.add(p1.socketId);
    
    if (!userSockets.has(p2.userId)) {
      userSockets.set(p2.userId, new Set());
    }
    userSockets.get(p2.userId)!.add(p2.socketId);

    createGameRecord(game).catch(err => logger.error({ err }, "Failed to create game record"));

    const p1Socket = io.sockets.sockets.get(p1.socketId);
    const p2Socket = io.sockets.sockets.get(p2.socketId);

    if (p1Socket) {
      p1Socket.emit("matched", { 
        gameId, 
        playerNumber: 1,
        opponent: { id: p2.userId, username: p2.username }, 
        state 
      });
    }
    if (p2Socket) {
      p2Socket.emit("matched", { 
        gameId, 
        playerNumber: 2,
        opponent: { id: p1.userId, username: p1.username }, 
        state 
      });
    }

    logger.info({ gameId, p1: p1.userId, p2: p2.userId, mode, boardSize }, "Game matched");
  }
}

function removeFromAllQueues(match: Partial<{ userId: string; socketId: string }>) {
  for (const key of Object.keys(queues)) {
    const q = queues[key];
    const idx = q.findIndex(e =>
      (match.userId && e.userId === match.userId) ||
      (match.socketId && e.socketId === match.socketId)
    );
    if (idx !== -1) q.splice(idx, 1);
  }
}

export function setupSocketIO(io: Server): void {
  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");
    broadcastOnlineCounts(io);

    socket.on("register", (data: { userId: string; username: string }) => {
      // ── Handle duplicate connections ──────────────────────────────────────
      cleanupUserSockets(io, data.userId, socket.id);
      
      if (!userSockets.has(data.userId)) {
        userSockets.set(data.userId, new Set());
      }
      userSockets.get(data.userId)!.add(socket.id);
      
      socketToUser.set(socket.id, { userId: data.userId, username: data.username });

      // ── Check if user is in an active game ──────────────────────────────
      const activeGame = isUserInActiveGame(data.userId);
      if (activeGame) {
        const { gameId, game, playerNumber } = activeGame;
        const opponentId = playerNumber === 1 ? game.player2Id : game.player1Id;
        const opponentUsername = playerNumber === 1 ? game.player2Username : game.player1Username;

        // Update socket IDs
        if (playerNumber === 1) {
          socketToGame.delete(game.player1SocketId);
          game.player1SocketId = socket.id;
        } else {
          socketToGame.delete(game.player2SocketId);
          game.player2SocketId = socket.id;
        }
        socketToGame.set(socket.id, gameId);

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
        } else {
          socket.emit("waiting_for_opponent");
        }

        logger.info({ socketId: socket.id, gameId, playerNumber }, "Player reconnected");
        broadcastOnlineCounts(io);
        return;
      }

      // ── Not in game, ready to join queue ─────────────────────────────────
      socket.emit("ready", { status: "ready" });
      broadcastOnlineCounts(io);
    });

    socket.on("join_queue", (data: {
      mode: "casual" | "ranked";
      userId: string;
      username: string;
      boardSize?: BoardSize;
    }) => {
      // ── Prevent duplicate joins ──────────────────────────────────────────
      if (joinInProgress) {
        socket.emit("queued", { 
          position: 0, 
          mode: data.mode, 
          boardSize: data.boardSize || 3 
        });
        return;
      }

      // ── Check if already in a game ────────────────────────────────────────
      const activeGame = isUserInActiveGame(data.userId);
      if (activeGame) {
        socket.emit("already_in_game", { gameId: activeGame.gameId });
        return;
      }

      // ── Check if already in queue ────────────────────────────────────────
      const existingQueueEntry = (() => {
        for (const key of Object.keys(queues)) {
          const q = queues[key];
          const entry = q.find(e => e.userId === data.userId);
          if (entry) return entry;
        }
        return null;
      })();

      if (existingQueueEntry) {
        socket.emit("queued", { 
          position: queues[queueKey(data.mode, data.boardSize as BoardSize)].length,
          mode: data.mode, 
          boardSize: data.boardSize || 3 
        });
        return;
      }

      const boardSize: BoardSize = ([3, 4, 5] as const).includes(data.boardSize as BoardSize)
        ? (data.boardSize as BoardSize) : 3;

      // Remove from any existing queue slot first
      removeFromAllQueues({ userId: data.userId });

      const key = queueKey(data.mode, boardSize);
      const queue = queues[key];
      
      // Don't add if user is already in this queue
      if (queue.some(e => e.userId === data.userId)) {
        socket.emit("queued", { position: queue.length, mode: data.mode, boardSize });
        return;
      }

      queue.push({
        socketId: socket.id,
        userId: data.userId,
        username: data.username,
        mode: data.mode,
        boardSize,
        joinedAt: Date.now(),
      });

      joinInProgress = true;
      socket.emit("queued", { position: queue.length, mode: data.mode, boardSize });
      
      // Try to match
      tryMatch(queue, data.mode, boardSize, io);
      broadcastOnlineCounts(io);

      // Reset join flag after a delay
      setTimeout(() => {
        joinInProgress = false;
      }, 3000);

      logger.info({ userId: data.userId, mode: data.mode, boardSize, queueSize: queue.length }, "Player joined queue");
    });

    socket.on("leave_queue", () => {
      removeFromAllQueues({ socketId: socket.id });
      socket.emit("queue_left");
      broadcastOnlineCounts(io);
    });

    socket.on("make_move", (data: { gameId: string; playerNumber: Player; from: number | null; to: number }) => {
      const game = activeGames.get(data.gameId);
      if (!game) { 
        socket.emit("move_error", { error: "Game not found" }); 
        return; 
      }

      if (game.status === "completed") {
        socket.emit("move_error", { error: "Game already completed" });
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

      const payload = { 
        gameId: data.gameId, 
        from: data.from, 
        to: data.to,
        playerNumber: data.playerNumber, 
        state: game.state 
      };

      io.sockets.sockets.get(game.player1SocketId)?.emit("move_made", payload);
      io.sockets.sockets.get(game.player2SocketId)?.emit("move_made", payload);

      if (game.state.winner) {
        const winnerId = game.state.winner === 1 ? game.player1Id : game.player2Id;
        const loserId  = game.state.winner === 1 ? game.player2Id : game.player1Id;
        
        const winnerPlayerNum = game.state.winner;
        const gameOverPayload = { 
          gameId: data.gameId, 
          winnerPlayerNumber: winnerPlayerNum, 
          reason: "win" 
        };
        io.sockets.sockets.get(game.player1SocketId)?.emit("game_over", gameOverPayload);
        io.sockets.sockets.get(game.player2SocketId)?.emit("game_over", gameOverPayload);
        
        finalizeGame(data.gameId, winnerId, loserId, io)
          .catch(err => logger.error({ err }, "Failed to finalize game"));
      }
    });

    socket.on("resign", (data: { gameId: string; playerNumber: Player }) => {
      const game = activeGames.get(data.gameId);
      if (!game) return;

      if (game.status === "completed") {
        socket.emit("move_error", { error: "Game already completed" });
        return;
      }

      const winnerId = data.playerNumber === 1 ? game.player2Id : game.player1Id;
      const loserId  = data.playerNumber === 1 ? game.player1Id : game.player2Id;
      const winnerPlayerNum = data.playerNumber === 1 ? 2 : 1;

      const payload = { 
        gameId: data.gameId, 
        winnerPlayerNumber: winnerPlayerNum, 
        reason: "resign" 
      };
      io.sockets.sockets.get(game.player1SocketId)?.emit("game_over", payload);
      io.sockets.sockets.get(game.player2SocketId)?.emit("game_over", payload);

      finalizeGame(data.gameId, winnerId, loserId, io)
        .catch(err => logger.error({ err }, "Failed to finalize resigned game"));
    });

    // ── Rematch handlers ────────────────────────────────────────────────────
    socket.on("request_rematch", async (data: { gameId: string }) => {
      const game = activeGames.get(data.gameId);
      if (!game) {
        socket.emit("rematch_error", { error: "Game not found" });
        return;
      }

      if (game.status === "completed") {
        socket.emit("rematch_error", { error: "Game already completed" });
        return;
      }

      if (!game.rematchRequested) {
        game.rematchRequested = [];
      }
      
      const userId = socketToUser.get(socket.id)?.userId;
      if (!userId) return;
      
      if (!game.rematchRequested.includes(userId)) {
        game.rematchRequested.push(userId);
      }
      
      const opponentSocketId = game.player1SocketId === socket.id 
        ? game.player2SocketId 
        : game.player1SocketId;
      io.sockets.sockets.get(opponentSocketId)?.emit("rematch_offered", { by: userId });
      
      if (game.rematchRequested.length === 2) {
        const player1 = socketToUser.get(game.player1SocketId);
        const player2 = socketToUser.get(game.player2SocketId);
        
        if (player1 && player2) {
          const newGameId = crypto.randomUUID();
          const state = createInitialState(game.boardSize);
          
          const newGame: ActiveGame = {
            gameId: newGameId,
            player1SocketId: game.player1SocketId,
            player2SocketId: game.player2SocketId,
            player1Id: game.player1Id,
            player2Id: game.player2Id,
            player1Username: game.player1Username,
            player2Username: game.player2Username,
            mode: game.mode,
            boardSize: game.boardSize,
            state: state,
            startedAt: Date.now(),
            status: "active",
          };
          
          activeGames.set(newGameId, newGame);
          socketToGame.set(game.player1SocketId, newGameId);
          socketToGame.set(game.player2SocketId, newGameId);
          
          await createGameRecord(newGame);
          
          io.sockets.sockets.get(game.player1SocketId)?.emit("matched", {
            gameId: newGameId,
            playerNumber: 1,
            opponent: { id: game.player2Id, username: game.player2Username },
            state: state,
            isRematch: true
          });
          
          io.sockets.sockets.get(game.player2SocketId)?.emit("matched", {
            gameId: newGameId,
            playerNumber: 2,
            opponent: { id: game.player1Id, username: game.player1Username },
            state: state,
            isRematch: true
          });
          
          delete game.rematchRequested;
          
          logger.info({ 
            oldGameId: data.gameId, 
            newGameId, 
            players: [player1.userId, player2.userId] 
          }, "Rematch started");
        }
      }
    });

    socket.on("decline_rematch", (data: { gameId: string }) => {
      const game = activeGames.get(data.gameId);
      if (!game) return;
      
      const opponentSocketId = game.player1SocketId === socket.id 
        ? game.player2SocketId 
        : game.player1SocketId;
      io.sockets.sockets.get(opponentSocketId)?.emit("rematch_declined");
      
      delete game.rematchRequested;
    });

    // ── Disconnect handler ──────────────────────────────────────────────────
    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");

      // Remove socket from user tracking
      const user = socketToUser.get(socket.id);
      if (user) {
        const sockets = userSockets.get(user.userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            userSockets.delete(user.userId);
          }
        }
      }

      const gameId = socketToGame.get(socket.id);
      if (gameId) {
        const game = activeGames.get(gameId);
        if (game && game.status !== "completed") {
          const opponentSocketId = game.player1SocketId === socket.id
            ? game.player2SocketId : game.player1SocketId;
          const opponentSocket = io.sockets.sockets.get(opponentSocketId);
          if (opponentSocket) {
            opponentSocket.emit("opponent_disconnected");
          }
        }
      }

      removeFromAllQueues({ socketId: socket.id });
      socketToUser.delete(socket.id);
      joinInProgress = false;
      broadcastOnlineCounts(io);
    });
  });
}
