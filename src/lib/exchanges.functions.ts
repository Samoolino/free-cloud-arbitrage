import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listExchangeCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("exchange_credentials")
      .select("id, exchange_id, label, enabled, is_trigger, taker_fee_bps, network_pref, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data;
  });

const UpsertSchema = z.object({
  exchange_id: z.string().min(1),
  label: z.string().nullable().optional(),
  api_key: z.string().optional(),
  api_secret: z.string().optional(),
  passphrase: z.string().optional(),
  enabled: z.boolean().optional(),
  is_trigger: z.boolean().optional(),
  taker_fee_bps: z.number().int().nullable().optional(),
});

export const upsertExchangeCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      user_id: userId,
      exchange_id: data.exchange_id,
      label: data.label ?? null,
      enabled: data.enabled ?? true,
      is_trigger: data.is_trigger ?? false,
      taker_fee_bps: data.taker_fee_bps ?? null,
      api_key_enc: data.api_key !== undefined ? (data.api_key ? btoa(data.api_key) : null) : undefined,
      api_secret_enc: data.api_secret !== undefined ? (data.api_secret ? btoa(data.api_secret) : null) : undefined,
      passphrase_enc: data.passphrase !== undefined ? (data.passphrase ? btoa(data.passphrase) : null) : undefined,
    } satisfies Record<string, unknown>;
    if (data.is_trigger) {
      await supabase.from("exchange_credentials").update({ is_trigger: false }).eq("user_id", userId);
    }
    const { data: out, error } = await supabase
      .from("exchange_credentials")
      .upsert(row, { onConflict: "user_id,exchange_id" })
      .select("id, exchange_id, label, enabled, is_trigger, taker_fee_bps")
      .single();
    if (error) throw error;
    return out;
  });

export const deleteExchangeCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("exchange_credentials").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });