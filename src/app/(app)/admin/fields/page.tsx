import { requireCapability } from "@/lib/auth/guards";
import { listFieldDefinitions } from "@/lib/db/repositories/fields";
import { FieldsClient } from "./fields-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Field Definitions" };

export default async function FieldsPage() {
  await requireCapability("manageFields");
  const fields = await listFieldDefinitions({ includeInactive: true });
  return <FieldsClient initialFields={fields} />;
}
