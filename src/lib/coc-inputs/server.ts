import "server-only";
import { Errors } from "@/lib/errors";
import { MAX_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES } from "@/lib/coc-inputs/types";

/** Reject oversize attachments before any record is created. */
export function assertAttachmentSizes(attachments: { name: string; dataBase64: string }[] | undefined) {
  let total = 0;
  for (const a of attachments ?? []) {
    const size = Math.floor((a.dataBase64.length * 3) / 4);
    if (size > MAX_ATTACHMENT_BYTES) throw Errors.validation(`Attachment "${a.name}" is larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1048576)} MB.`);
    total += size;
  }
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) throw Errors.validation(`Attachments exceed ${Math.round(MAX_TOTAL_ATTACHMENT_BYTES / 1048576)} MB in total.`);
}
