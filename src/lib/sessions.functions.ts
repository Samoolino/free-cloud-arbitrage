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

export const recordPaperTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    session_id: z.string().uuid(),
    legs: z.unknown(),
    strategy: z.enum(["triangular", "pentagonal"]),
    notional_usd: z.number(),
    realized_pnl_usd: z.number(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error: tErr } = await supabase.from("trades").insert({
      user_id: userId,
      session_id: data.session_id,
      strategy: data.strategy,
      legs: data.legs as object,
      notional_usd: data.notional_usd,
      realized_pnl_usd: data.realized_pnl_usd,
      paper: true,
    });
    if (tErr) throw tErr;
    const { data: sess, error: sErr } = await supabase
      .from("sessions").select("realized_pnl_usd, target_amount_usd, trades_count, status")
      .eq("id", data.session_id).single();
    if (sErr) throw sErr;
    const newPnl = Number(sess.realized_pnl_usd) + data.realized_pnl_usd;
    const reached = newPnl >= Number(sess.target_amount_usd);
    await supabase.from("sessions").update({
      realized_pnl_usd: newPnl,
      trades_count: sess.trades_count + 1,
      status: reached ? "target_reached" : sess.status,
      ended_at: reached ? new Date().toISOString() : null,
    }).eq("id", data.session_id);
    return { ok: true, target_reached: reached };
  });