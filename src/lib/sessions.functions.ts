import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getActiveSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("sessions").select("*").eq("user_id", userId)
      .in("status", ["running", "cooldown", "lockout"])
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("sessions").select("*").eq("user_id", userId)
      .order("started_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data;
  });

export const startSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    target_amount_usd: z.number().positive(),
    trigger_exchange: z.string().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("sessions")
      .update({ status: "stopped", ended_at: new Date().toISOString() })
      .eq("user_id", userId).in("status", ["running", "cooldown", "lockout"]);
    const { data: row, error } = await supabase.from("sessions").insert({
      user_id: userId,
      target_amount_usd: data.target_amount_usd,
      trigger_exchange: data.trigger_exchange ?? null,
    }).select("*").single();
    if (error) throw error;
    return row;
  });

export const stopSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ session_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("sessions")
      .update({ status: "stopped", ended_at: new Date().toISOString() })
      .eq("id", data.session_id).eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });