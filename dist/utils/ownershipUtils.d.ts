import { ethers } from "ethers";
export declare function getCookieContract(): ethers.Contract;
export declare function getTokenIdsOwnedBy(walletAddress: string, knownTokenIds: string[]): Promise<string[]>;
export declare function getAllDecodedOwnedTokenIds(walletAddress: string): Promise<string[]>;
//# sourceMappingURL=ownershipUtils.d.ts.map