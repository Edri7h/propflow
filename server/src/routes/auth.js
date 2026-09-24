import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { eq, or } from "drizzle-orm";
import { ok, fail, safeUser } from "../utils/http.js";
import { authenticate } from "../middleware/auth.js";
const r = Router();
const cookieOpts = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === "true",
  sameSite: process.env.COOKIE_SAME_SITE || "lax",
  maxAge: 86400000,
};
r.post("/login", async (req, res, next) => {
  try {
    const { identity, password } = req.body;
    if (!identity || !password)
      return fail(res, "Username/email and password are required");
    const [u] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identity), eq(users.email, identity)))
      .limit(1);
    if (!u || !(await bcrypt.compare(password, u.passwordHash)))
      return fail(res, "Invalid credentials", 401);
    const token = jwt.sign(
      { id: u.id, role: u.role, name: u.name },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );
    res.cookie("token", token, cookieOpts);
    ok(res, safeUser(u));
  } catch (e) {
    next(e);
  }
});
r.post("/logout", (req, res) => {
  res.clearCookie("token", cookieOpts);
  ok(res, { message: "Logged out" });
});
r.get("/me", authenticate, async (req, res, next) => {
  try {
    const [u] = await db.select().from(users).where(eq(users.id, req.user.id));
    if (!u) return fail(res, "User not found", 404);
    ok(res, safeUser(u));
  } catch (e) {
    next(e);
  }
});
export default r;
