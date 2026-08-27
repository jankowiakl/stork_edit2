import pg from "pg";

const { Pool } = pg;
export const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function transaction(callback) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const value = await callback(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

