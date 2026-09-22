import { requireSession } from "@/lib/auth/guards";
import { listOwnSignatures } from "@/lib/signature/stored";
import { SignaturesClient } from "./signatures-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "My Signatures" };

/** Every user manages only their own stored signatures. */
export default async function SignaturesPage() {
  const session = await requireSession();
  let signatures: Awaited<ReturnType<typeof listOwnSignatures>> = [];
  try {
    signatures = await listOwnSignatures(session.user.id);
  } catch (e) {
    console.warn("Failed to load signatures:", e);
  }
  return <SignaturesClient initialSignatures={signatures} />;
}
