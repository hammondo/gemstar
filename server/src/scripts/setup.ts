const { initDb } = await import('../bodyspace/db.js');
await initDb();

console.log('BodySpace server setup complete');
