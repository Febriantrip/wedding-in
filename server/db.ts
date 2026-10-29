import 'dotenv/config';
import mysql, { type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'aurelia_wo', connectionLimit: 10,
  decimalNumbers: false, dateStrings: true, multipleStatements: false
});
export type DbConn = PoolConnection;
export async function rows<T = Record<string, any>>(sql: string, params: any[] = [], conn: DbConn | typeof pool = pool): Promise<T[]> {
  const [result] = await conn.execute<RowDataPacket[]>(sql, params); return result as T[];
}
export async function execSql(sql: string, params: any[] = [], conn: DbConn | typeof pool = pool): Promise<ResultSetHeader> {
  const [result] = await conn.execute<ResultSetHeader>(sql, params); return result;
}
export async function transaction<T>(callback: (conn: DbConn) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try { await conn.beginTransaction(); const result = await callback(conn); await conn.commit(); return result; }
  catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
}
