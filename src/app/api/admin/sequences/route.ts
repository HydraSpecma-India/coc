import { NextRequest, NextResponse } from "next/server";
import { requireRole, requireSession } from "@/lib/auth/guards";
import {
  getSequencesConfig,
  saveSequencesConfig,
} from "@/lib/sequences/repository";
import { ProductSequenceRule, SequencesConfig, formatSequenceSerial } from "@/lib/sequences/types";
import { audit } from "@/lib/audit/audit";

export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, ["Admin", "Quality"]);

    const config = await getSequencesConfig();

    return NextResponse.json({
      ok: true,
      config,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 403 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, ["Admin"]);

    const body = await req.json();
    const currentConfig = await getSequencesConfig();

    if (body.config) {
      // Full config update
      const newConfig: SequencesConfig = {
        autoCreateProductSeries: body.config.autoCreateProductSeries ?? currentConfig.autoCreateProductSeries,
        defaultMode: body.config.defaultMode ?? currentConfig.defaultMode,
        defaultPattern: body.config.defaultPattern ?? currentConfig.defaultPattern,
        defaultPadding: body.config.defaultPadding ?? currentConfig.defaultPadding,
        productRules: body.config.productRules || currentConfig.productRules,
      };

      const success = await saveSequencesConfig(newConfig, session.user.id);
      if (!success) {
        return NextResponse.json({ ok: false, error: "Failed to save sequences" }, { status: 500 });
      }

      await audit({
        action: "SETTINGS_CHANGED",
        entityType: "settings",
        entityId: "product_number_sequences",
        user: session.user,
        details: { action: "UPDATE_NUMBER_SEQUENCES", updatedRulesCount: Object.keys(newConfig.productRules).length },
      });

      return NextResponse.json({ ok: true, config: newConfig });
    }

    if (body.rule) {
      // Single product rule update
      const rule = body.rule as ProductSequenceRule;
      const cleanItem = (rule.itemNumber || "").trim();
      if (!cleanItem) {
        return NextResponse.json({ ok: false, error: "Item number is required" }, { status: 400 });
      }

      rule.updatedAt = new Date().toISOString();
      currentConfig.productRules[cleanItem] = rule;

      const success = await saveSequencesConfig(currentConfig, session.user.id);
      if (!success) {
        return NextResponse.json({ ok: false, error: "Failed to save rule" }, { status: 500 });
      }

      await audit({
        action: "SETTINGS_CHANGED",
        entityType: "settings",
        entityId: cleanItem,
        user: session.user,
        details: { action: "UPDATE_PRODUCT_SEQUENCE", rule },
      });

      return NextResponse.json({
        ok: true,
        rule,
        preview: formatSequenceSerial(rule.pattern, cleanItem, rule.nextNumber, rule.padding),
      });
    }

    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, ["Admin"]);

    const body = await req.json();
    const cleanItem = (body.itemNumber || "").trim();
    if (!cleanItem) {
      return NextResponse.json({ ok: false, error: "Item number is required" }, { status: 400 });
    }

    const currentConfig = await getSequencesConfig();
    const newRule: ProductSequenceRule = {
      itemNumber: cleanItem,
      productName: body.productName?.trim() || cleanItem,
      mode: body.mode === "manual" ? "manual" : "auto",
      pattern: body.pattern?.trim() || currentConfig.defaultPattern || "{ItemNumber} - SN{###}",
      nextNumber: typeof body.nextNumber === "number" && body.nextNumber >= 1 ? body.nextNumber : 1,
      padding: typeof body.padding === "number" && body.padding >= 1 ? body.padding : currentConfig.defaultPadding || 3,
      lastGeneratedSerial: null,
      updatedAt: new Date().toISOString(),
    };

    currentConfig.productRules[cleanItem] = newRule;
    const success = await saveSequencesConfig(currentConfig, session.user.id);
    if (!success) {
      return NextResponse.json({ ok: false, error: "Failed to save new rule" }, { status: 500 });
    }

    await audit({
      action: "SETTINGS_CHANGED",
      entityType: "settings",
      entityId: cleanItem,
      user: session.user,
      details: { action: "CREATE_PRODUCT_SEQUENCE", newRule },
    });

    return NextResponse.json({
      ok: true,
      rule: newRule,
      preview: formatSequenceSerial(newRule.pattern, cleanItem, newRule.nextNumber, newRule.padding),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, ["Admin"]);

    const { searchParams } = new URL(req.url);
    const itemNumber = searchParams.get("itemNumber")?.trim();
    if (!itemNumber) {
      return NextResponse.json({ ok: false, error: "Item number is required" }, { status: 400 });
    }

    const currentConfig = await getSequencesConfig();
    if (currentConfig.productRules[itemNumber]) {
      delete currentConfig.productRules[itemNumber];
      await saveSequencesConfig(currentConfig, session.user.id);

      await audit({
        action: "SETTINGS_CHANGED",
        entityType: "settings",
        entityId: itemNumber,
        user: session.user,
        details: { action: "DELETE_PRODUCT_SEQUENCE" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
