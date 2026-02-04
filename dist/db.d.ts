export declare function initDb(): Promise<void>;
export declare function getDb(): any;
export declare function closeDb(): Promise<void>;
export declare function isPostgresConnection(): boolean;
export declare const sqliteToPostgres: (sql: string) => string;
export declare function queryRow(sql: string, params?: any[]): Promise<any>;
export declare function queryAll(sql: string, params?: any[]): Promise<any[]>;
export declare function queryRun(sql: string, params?: any[]): Promise<any>;
//# sourceMappingURL=db.d.ts.map