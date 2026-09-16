import { z } from "zod";
import { route, json } from "@/lib/api/handler";
import { requireCapability } from "@/lib/auth/guards";
import { listUsers, createUser } from "@/lib/db/repositories/users";
import { ROLES } from "@/lib/auth/roles";
import { audit } from "@/lib/audit/audit";

export const GET = route(async () => {
  await requireCapability("manageUsers");
  return json({ users: await listUsers() });
});

const CreateUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  displayName: z.string().optional(),
  role: z.enum(ROLES),
  password: z.string().min(4, "Password must be at least 4 characters").optional(),
  active: z.boolean().optional(),
});

export const POST = route(async (req) => {
  const session = await requireCapability("manageUsers");
  const body = CreateUserSchema.parse(await req.json());
  const user = await createUser(body);
  await audit({
    entityType: "user",
    entityId: user.id,
    action: "CREATED",
    user: session.user,
    details: { email: user.email, role: user.role },
  });
  return json({ user }, { status: 201 });
});

