import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pool, rows, execSql } from '../server/db.js';

const database=process.env.DB_NAME||'aurelia_wo';
if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database))throw new Error('Nama database tidak valid.');
const connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
  user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD||''});
await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await connection.end();
await execSql(`CREATE TABLE IF NOT EXISTS migrations (id INT AUTO_INCREMENT PRIMARY KEY,filename VARCHAR(200) NOT NULL UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB`);
for(const file of readdirSync(resolve('sql')).filter(name=>/^\d{3}_[\w-]+\.sql$/.test(name)).sort()){
  const current=await rows('SELECT filename FROM migrations WHERE filename=?',[file]);
  if(!current.length){
    const sql=readFileSync(resolve('sql',file),'utf8');
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await pool.query(statement);
    await execSql('INSERT INTO migrations(filename) VALUES (?)',[file]);
    console.log('Migrasi berhasil:',file);
  }else console.log('Sudah terpasang:',file);
}
await pool.end();
