import { Request, Response } from "express";
import { SetFundsAdminRequest } from "../types/lottery";
export declare const lotteryController: {
    createRound(req: Request, res: Response): Promise<void>;
    getAllRounds(req: Request, res: Response): Promise<void>;
    getActiveRound(req: Request, res: Response): Promise<void>;
    getRoundById(req: Request, res: Response): Promise<void>;
    setFundsAdmin(req: Request<{}, {}, SetFundsAdminRequest>, res: Response): Promise<void>;
    getFundsAdmin(req: Request, res: Response): Promise<void>;
    getPayoutHistory(req: Request, res: Response): Promise<void>;
    getContractBalance(req: Request, res: Response): Promise<void>;
    getWinners(req: Request, res: Response): Promise<void>;
    getLotteryStats(req: Request, res: Response): Promise<void>;
    getLotteryResults(req: Request, res: Response): Promise<void>;
    syncEntries(req: Request, res: Response): Promise<void>;
    getPrizePool(req: Request, res: Response): Promise<void>;
};
//# sourceMappingURL=lotteryController.d.ts.map