import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { rows } from './db.js';
export type Role = 'owner' | 'admin' | 'finance' | 'planner' | 'sales';
export type Identity = { id: number; name: string; email: string; role: Role };
declare global { namespace Express { interface Request { identity?: Identity } } }
function secret() { if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET wajib minimal 32 karakter'); return process.env.JWT_SECRET; }
export function issueToken(identity: Identity) { return jwt.sign({ uid: identity.id }, secret(), { expiresIn: '12h' }); }
export function setSession(res: Response, token: string) {
  res.cookie('wo_session', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 60 * 60 * 1000 });
}
export function clearSession(res: Response) { res.clearCookie('wo_session', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' }); }
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.wo_session;
    if (!token) { res.status(401).json({ message: 'Silakan login terlebih dahulu.' }); return; }
    const data = jwt.verify(token, secret()) as { uid: number };
    const [user] = await rows<Identity & { active: number }>('SELECT id,name,email,role,active FROM users WHERE id=?', [data.uid]);
    if (!user?.active) { res.status(401).json({ message: 'Sesi tidak valid.' }); return; }
    req.identity = { id: user.id, name: user.name, email: user.email, role: user.role }; next();
  } catch { res.status(401).json({ message: 'Sesi berakhir. Silakan login ulang.' }); }
}
export function allow(...roles: Role[]) { return (req: Request, res: Response, next: NextFunction) => {
  if (!req.identity || !roles.includes(req.identity.role)) { res.status(403).json({ message: 'Anda tidak memiliki akses untuk tindakan ini.' }); return; } next();
}; }
