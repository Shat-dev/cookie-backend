#!/usr/bin/env ts-node
declare function getCountdownStatus(): Promise<any>;
declare function startCountdownRound(): Promise<any>;
declare function resetCountdown(): Promise<any>;
declare function monitorCountdown(intervalSeconds?: number): Promise<void>;
export { getCountdownStatus, startCountdownRound, resetCountdown, monitorCountdown, };
//# sourceMappingURL=countdown-control.d.ts.map