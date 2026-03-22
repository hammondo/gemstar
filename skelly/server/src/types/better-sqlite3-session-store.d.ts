declare module 'better-sqlite3-session-store' {
    import session from 'express-session';
    import Database from 'better-sqlite3';

    interface SqliteStoreOptions {
        client: Database.Database;
        expired?: {
            clear?: boolean;
            intervalMs?: number;
        };
    }

    class SqliteStore extends session.Store {
        constructor(options: SqliteStoreOptions);
    }

    function SqliteStoreFactory(session: { Store: typeof session.Store }): new (options: SqliteStoreOptions) => SqliteStore;

    export default SqliteStoreFactory;
}
