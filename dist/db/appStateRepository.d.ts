import { Pool } from "pg";
export declare class AppStateRepository {
    private pool;
    constructor(pool: Pool);
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}
//# sourceMappingURL=appStateRepository.d.ts.map