import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import gamesRouter from "./games";

const router: IRouter = Router();

// Mount routes - using the correct paths
router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(gamesRouter);

export default router;
