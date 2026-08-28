import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "30d";

export function assertAuthConfiguration() {
  if (JWT_SECRET.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
}
export const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
export const randomId = () => crypto.randomUUID();
export async function hashPassword(password) {
  if (String(password || "").length < 10) throw new Error("Password must contain at least 10 characters.");
  return bcrypt.hash(String(password), 12);
}
export const verifyPassword = (password, hash) => bcrypt.compare(String(password || ""), hash);
export const temporaryPassword = () => `${crypto.randomBytes(9).toString("base64url")}!a7`;
export const signToken = (user) => jwt.sign({ sub:user.id }, JWT_SECRET, { expiresIn:JWT_EXPIRES_IN });

export function publicUser(user) {
  return user ? {
    id:user.id, email:user.email, name:user.name, role:user.role, isActive:user.is_active,
    mustChangePassword:user.must_change_password, inviteSentAt:user.invite_sent_at, lastLoginAt:user.last_login_at,
    createdAt:user.created_at, updatedAt:user.updated_at
  } : null;
}

export async function authenticateUser(req, res, next) {
  try {
    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error:"unauthorized" });
    const payload = jwt.verify(token, JWT_SECRET);
    const result = await db.query("SELECT * FROM users WHERE id=$1 AND is_active=true", [payload.sub]);
    if (!result.rows[0]) return res.status(401).json({ error:"unauthorized" });
    req.user = result.rows[0];
    if (req.user.must_change_password && !["/api/me","/api/me/change-password"].includes(req.path)) {
      return res.status(403).json({ error:"password_change_required" });
    }
    next();
  } catch (_error) { res.status(401).json({ error:"unauthorized" }); }
}

export function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ error:"forbidden" });
}
export async function canAccessIndividual(user, individualId, client = db) {
  return !!user&&!!individualId;
}
export async function canAnnotateIndividual(user, individualId, client = db) {
  if (["admin","coordinator"].includes(user?.role)) return true;
  const result = await client.query("SELECT 1 FROM user_individual_access WHERE user_id=$1 AND individual_id=$2", [user.id, individualId]);
  return !!result.rows[0];
}
export function accessSql(user, column = "p.individual_id", index = 1) {
  return { sql:"TRUE", params:[] };
}
export async function audit(user, action, entityType, entityId, payload = {}, req = null, client = db) {
  await client.query(
    "INSERT INTO audit_log (user_id,action,entity_type,entity_id,ip_address,payload) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
    [user?.id || null, action, entityType, entityId || null, req?.ip || null, JSON.stringify(payload)]
  );
}
