import { Router } from "express";
import bcrypt from "bcrypt";
import { and, eq, inArray, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  users,
  properties,
  units,
  maintenanceRequests,
} from "../db/schema/index.js";
import { ok, fail, safeUser } from "../utils/http.js";
import { requireAnyRole } from "../middleware/auth.js";
const r = Router(),
  A = "ADMIN",
  ownerRoles = [A, "OWNER"];
const id = z.coerce.number().int().positive();
const propSchema = z.object({
  name: z.string().min(2),
  address: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  postalCode: z.string().min(3),
  ownerId: id,
});
const unitSchema = z.object({
  unitNumber: z.string().min(1),
  propertyId: id,
  tenantId: id.nullable().optional(),
});
const requestSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  propertyId: id,
  unitId: id,
  assignedTo: id.nullable().optional(),
});
const parse = (schema, data, res) => {
  const x = schema.safeParse(data);
  if (!x.success) {
    fail(res, x.error.issues[0].message);
    return null;
  }
  return x.data;
};
async function ownedProperty(user, propertyId) {
  const where =
    user.role === A
      ? eq(properties.id, propertyId)
      : and(eq(properties.id, propertyId), eq(properties.ownerId, user.id));
  const [p] = await db.select().from(properties).where(where);
  return p;
}
async function accessibleRequest(user, requestId) {
  let q = db
    .select({ request: maintenanceRequests, property: properties, unit: units })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .innerJoin(units, eq(maintenanceRequests.unitId, units.id))
    .where(eq(maintenanceRequests.id, requestId));
  const [row] = await q;
  if (!row) return null;
  if (
    user.role === A ||
    (user.role === "OWNER" && row.property.ownerId === user.id) ||
    (user.role === "TENANT" && row.unit.tenantId === user.id) ||
    (user.role === "TECHNICIAN" && row.request.assignedTo === user.id)
  )
    return row;
  return null;
}
const requestRows = async (user) => {
  let condition = undefined;
  if (user.role === "OWNER") condition = eq(properties.ownerId, user.id);
  if (user.role === "TENANT") condition = eq(units.tenantId, user.id);
  if (user.role === "TECHNICIAN")
    condition = eq(maintenanceRequests.assignedTo, user.id);
  return db
    .select({
      id: maintenanceRequests.id,
      title: maintenanceRequests.title,
      description: maintenanceRequests.description,
      priority: maintenanceRequests.priority,
      status: maintenanceRequests.status,
      propertyId: maintenanceRequests.propertyId,
      unitId: maintenanceRequests.unitId,
      reportedBy: maintenanceRequests.reportedBy,
      assignedTo: maintenanceRequests.assignedTo,
      resolutionNotes: maintenanceRequests.resolutionNotes,
      createdAt: maintenanceRequests.createdAt,
      updatedAt: maintenanceRequests.updatedAt,
      propertyName: properties.name,
      unitNumber: units.unitNumber,
    })
    .from(maintenanceRequests)
    .innerJoin(properties, eq(maintenanceRequests.propertyId, properties.id))
    .innerJoin(units, eq(maintenanceRequests.unitId, units.id))
    .where(condition)
    .orderBy(desc(maintenanceRequests.createdAt));
};
r.get("/dashboard/stats", async (req, res, next) => {
  try {
    const rows = await requestRows(req.user);
    let props = [],
      allUnits = [];
    if (req.user.role === A) {
      props = await db.select().from(properties);
      allUnits = await db.select().from(units);
    } else if (req.user.role === "OWNER") {
      props = await db
        .select()
        .from(properties)
        .where(eq(properties.ownerId, req.user.id));
      allUnits = props.length
        ? await db
            .select()
            .from(units)
            .where(
              inArray(
                units.propertyId,
                props.map((x) => x.id),
              ),
            )
        : [];
    } else if (req.user.role === "TENANT")
      allUnits = await db
        .select()
        .from(units)
        .where(eq(units.tenantId, req.user.id));
    const count = (s) => rows.filter((x) => x.status === s).length;
    ok(res, {
      properties: props.length,
      units: allUnits.length,
      requests: rows.length,
      open: count("OPEN") + count("ASSIGNED"),
      inProgress: count("IN_PROGRESS"),
      resolved: count("RESOLVED"),
      closed: count("CLOSED"),
    });
  } catch (e) {
    next(e);
  }
});
// Properties
r.get("/properties", async (req, res, next) => {
  try {
    const rows =
      req.user.role === A
        ? await db.select().from(properties)
        : req.user.role === "OWNER"
          ? await db
              .select()
              .from(properties)
              .where(eq(properties.ownerId, req.user.id))
          : [];
    ok(res, rows);
  } catch (e) {
    next(e);
  }
});
r.get("/properties/:id", async (req, res, next) => {
  try {
    const p = await ownedProperty(req.user, Number(req.params.id));
    if (!p) return fail(res, "Property not found", 404);
    ok(res, p);
  } catch (e) {
    next(e);
  }
});
r.post("/properties", requireAnyRole(A), async (req, res, next) => {
  try {
    const x = parse(propSchema, req.body, res);
    if (!x) return;
    const [p] = await db.insert(properties).values(x).returning();
    ok(res, p, 201);
  } catch (e) {
    next(e);
  }
});
r.put("/properties/:id", requireAnyRole(A), async (req, res, next) => {
  try {
    const x = parse(propSchema, req.body, res);
    if (!x) return;
    const [p] = await db
      .update(properties)
      .set({ ...x, updatedAt: new Date() })
      .where(eq(properties.id, Number(req.params.id)))
      .returning();
    if (!p) return fail(res, "Property not found", 404);
    ok(res, p);
  } catch (e) {
    next(e);
  }
});
r.delete("/properties/:id", requireAnyRole(A), async (req, res, next) => {
  try {
    await db.delete(properties).where(eq(properties.id, Number(req.params.id)));
    ok(res, { message: "Property deleted" });
  } catch (e) {
    next(e);
  }
});
// Units
r.get("/units", async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === A) rows = await db.select().from(units);
    else if (req.user.role === "TENANT")
      rows = await db
        .select()
        .from(units)
        .where(eq(units.tenantId, req.user.id));
    else if (req.user.role === "OWNER") {
      const ps = await db
        .select({ id: properties.id })
        .from(properties)
        .where(eq(properties.ownerId, req.user.id));
      rows = ps.length
        ? await db
            .select()
            .from(units)
            .where(
              inArray(
                units.propertyId,
                ps.map((p) => p.id),
              ),
            )
        : [];
    } else rows = [];
    ok(res, rows);
  } catch (e) {
    next(e);
  }
});
r.get("/units/:id", async (req, res, next) => {
  try {
    const [u] = await db
      .select()
      .from(units)
      .where(eq(units.id, Number(req.params.id)));
    if (!u) return fail(res, "Unit not found", 404);
    const p = await ownedProperty(req.user, u.propertyId);
    if (
      req.user.role !== A &&
      !(req.user.role === "TENANT" && u.tenantId === req.user.id) &&
      !p
    )
      return fail(res, "Unit not found", 404);
    ok(res, u);
  } catch (e) {
    next(e);
  }
});
r.post("/units", requireAnyRole(A), async (req, res, next) => {
  try {
    const x = parse(unitSchema, req.body, res);
    if (!x) return;
    const [u] = await db.insert(units).values(x).returning();
    ok(res, u, 201);
  } catch (e) {
    next(e);
  }
});
r.put("/units/:id", requireAnyRole(A), async (req, res, next) => {
  try {
    const x = parse(unitSchema, req.body, res);
    if (!x) return;
    const [u] = await db
      .update(units)
      .set({ ...x, updatedAt: new Date() })
      .where(eq(units.id, Number(req.params.id)))
      .returning();
    if (!u) return fail(res, "Unit not found", 404);
    ok(res, u);
  } catch (e) {
    next(e);
  }
});
r.delete("/units/:id", requireAnyRole(A), async (req, res, next) => {
  try {
    await db.delete(units).where(eq(units.id, Number(req.params.id)));
    ok(res, { message: "Unit deleted" });
  } catch (e) {
    next(e);
  }
});
// Maintenance requests: every list/detail query is constrained at the database/access layer.
r.get("/maintenance", async (req, res, next) => {
  try {
    ok(res, await requestRows(req.user));
  } catch (e) {
    next(e);
  }
});
r.get("/maintenance/:id", async (req, res, next) => {
  try {
    const row = await accessibleRequest(req.user, Number(req.params.id));
    if (!row) return fail(res, "Request not found", 404);
    ok(res, {
      ...row.request,
      propertyName: row.property.name,
      unitNumber: row.unit.unitNumber,
    });
  } catch (e) {
    next(e);
  }
});
r.post(
  "/maintenance",
  requireAnyRole(A, "OWNER", "TENANT"),
  async (req, res, next) => {
    try {
      const x = parse(requestSchema, req.body, res);
      if (!x) return;
      const [u] = await db.select().from(units).where(eq(units.id, x.unitId));
      if (!u || u.propertyId !== x.propertyId)
        return fail(res, "Unit does not belong to property");
      if (req.user.role === "TENANT" && u.tenantId !== req.user.id)
        return fail(res, "You can only create requests for your unit", 403);
      if (
        req.user.role === "OWNER" &&
        !(await ownedProperty(req.user, x.propertyId))
      )
        return fail(res, "Property not found", 404);
      const values = {
        ...x,
        reportedBy: req.user.id,
        status: x.assignedTo ? "ASSIGNED" : "OPEN",
      };
      if (req.user.role === "TENANT") {
        values.priority = x.priority;
        values.assignedTo = null;
      }
      const [created] = await db
        .insert(maintenanceRequests)
        .values(values)
        .returning();
      ok(res, created, 201);
    } catch (e) {
      next(e);
    }
  },
);
r.put(
  "/maintenance/:id",
  requireAnyRole(A, "OWNER"),
  async (req, res, next) => {
    try {
      const row = await accessibleRequest(req.user, Number(req.params.id));
      if (!row) return fail(res, "Request not found", 404);
      const x = parse(requestSchema, req.body, res);
      if (!x) return;
      const [updated] = await db
        .update(maintenanceRequests)
        .set({
          ...x,
          status: x.assignedTo ? "ASSIGNED" : row.request.status,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceRequests.id, row.request.id))
        .returning();
      ok(res, updated);
    } catch (e) {
      next(e);
    }
  },
);
r.patch("/maintenance/:id/status", async (req, res, next) => {
  try {
    const row = await accessibleRequest(req.user, Number(req.params.id));
    if (!row) return fail(res, "Request not found", 404);
    const status = req.body.status;
    if (
      !["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(
        status,
      )
    )
      return fail(res, "Invalid status");
    if (
      req.user.role === "TECHNICIAN" &&
      !(
        (row.request.status === "ASSIGNED" && status === "IN_PROGRESS") ||
        (row.request.status === "IN_PROGRESS" && status === "RESOLVED")
      )
    )
      return fail(res, "Invalid technician status transition", 403);
    if (req.user.role === "TENANT")
      return fail(res, "Insufficient permissions", 403);
    const [updated] = await db
      .update(maintenanceRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(maintenanceRequests.id, row.request.id))
      .returning();
    ok(res, updated);
  } catch (e) {
    next(e);
  }
});
r.patch(
  "/maintenance/:id/resolution",
  requireAnyRole(A, "OWNER", "TECHNICIAN"),
  async (req, res, next) => {
    try {
      const row = await accessibleRequest(req.user, Number(req.params.id));
      if (!row) return fail(res, "Request not found", 404);
      if (typeof req.body.resolutionNotes !== "string")
        return fail(res, "Resolution notes are required");
      const [updated] = await db
        .update(maintenanceRequests)
        .set({
          resolutionNotes: req.body.resolutionNotes,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceRequests.id, row.request.id))
        .returning();
      ok(res, updated);
    } catch (e) {
      next(e);
    }
  },
);
r.delete("/maintenance/:id", requireAnyRole(A), async (req, res, next) => {
  try {
    await db
      .delete(maintenanceRequests)
      .where(eq(maintenanceRequests.id, Number(req.params.id)));
    ok(res, { message: "Request deleted" });
  } catch (e) {
    next(e);
  }
});
// Users are deliberately admin-only, except the authenticated profile available through /auth/me.
const userSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["TENANT", "OWNER", "TECHNICIAN", "ADMIN"]),
});
r.get("/users", requireAnyRole(A), async (req, res, next) => {
  try {
    ok(res, (await db.select().from(users)).map(safeUser));
  } catch (e) {
    next(e);
  }
});
r.get("/users/:id", requireAnyRole(A), async (req, res, next) => {
  try {
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(req.params.id)));
    if (!u) return fail(res, "User not found", 404);
    ok(res, safeUser(u));
  } catch (e) {
    next(e);
  }
});
r.post("/users", requireAnyRole(A), async (req, res, next) => {
  try {
    const x = parse(userSchema, req.body, res);
    if (!x) return;
    const [u] = await db
      .insert(users)
      .values({ ...x, passwordHash: await bcrypt.hash(x.password, 12) })
      .returning();
    ok(res, safeUser(u), 201);
  } catch (e) {
    if (e.code === "23505")
      return fail(res, "Username or email already exists", 409);
    next(e);
  }
});
r.put("/users/:id", requireAnyRole(A), async (req, res, next) => {
  try {
    const x = parse(userSchema, req.body, res);
    if (!x) return;
    const [u] = await db
      .update(users)
      .set({
        ...x,
        passwordHash: await bcrypt.hash(x.password, 12),
        updatedAt: new Date(),
      })
      .where(eq(users.id, Number(req.params.id)))
      .returning();
    if (!u) return fail(res, "User not found", 404);
    ok(res, safeUser(u));
  } catch (e) {
    next(e);
  }
});
r.delete("/users/:id", requireAnyRole(A), async (req, res, next) => {
  try {
    if (Number(req.params.id) === req.user.id)
      return fail(res, "Cannot delete your own account");
    await db.delete(users).where(eq(users.id, Number(req.params.id)));
    ok(res, { message: "User deleted" });
  } catch (e) {
    next(e);
  }
});
export default r;
