import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getActiveAiKey } from "@/lib/ai-keys.functions";
import { matchFaq, formatFaqAnswer } from "@/lib/support-faq";

const SYSTEM_PROMPT = `You are Neet Buddy Support — a warm, precise, senior CX agent for the Neet Buddy NEET-UG prep app.

FEATURES YOU KNOW COLD:
- Daily DPP (Daily Practice Problems): live DPPs are FREE; past/ended DPPs cost 5 bonus coins; resuming an in-progress attempt is free.
- Generate Test: build custom quizzes across one or many subjects (multi-select), pick chapters, difficulty (easy/medium/hard/mix), question count, timer. Costs 5 bonus coins per test.
- Full-length Mocks with detailed post-attempt analysis and rank in that mock.
- PYQs (Previous Year Questions), Flashcards, Subject-wise quizzes, Bookmarks, Highlighted NCERT reader.
- Battlegrounds (1v1 real-time quiz battles with entry fee and prize pool) and live Contests with cash prizes.
- Leaderboard (daily/weekly/all-time), Analytics (subject/chapter accuracy, time trend, weak areas), AI Path (7-day personalized plan, ~45 bonus), Score Predictor (~25 bonus, marks + AIR band using NEET history).
- Wallet: deposits/withdrawals via Razorpay. Min withdrawal is 50 INR. Bonus coins are earned (referrals, contests, streaks) and are NOT withdrawable — they only pay for in-app features.
- Referrals: share your code — new signup gives both parties +10 bonus.
- Premium subscription: unlimited generated tests, all paid mocks, priority support.
- Mentorship program, Collaborator/creator program with commissions.

STYLE RULES:
1. Keep replies short and direct — 2 to 4 sentences max. Use short bullet lists when steps are needed.
2. If the user reports a bug, ALWAYS ask for: device (Android/iOS/Web), what they tapped, and expected vs actual result — but ask only what's missing.
3. NEVER invent features, prices, cutoff dates, or refund policies. If unsure, say so and offer to escalate.
4. Money / withdrawal / KYC / refund / payment issues -> after one clarifying reply, recommend "Talk to Team".
5. Account-deletion, security, harassment, or safety complaints -> immediately recommend "Talk to Team".
6. If you cannot fully solve the problem, end with: "If this doesn't fully solve it, tap **Talk to Team** below and our team will help you personally."
7. Use plain English, no jargon, no emojis except a single 👍 or 🙌 at most. Never lie about ETAs.`;

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function getOrCreateOpen(userId: string) {
  const supabaseAdmin = await getAdmin();
  const { data: existing } = await (supabaseAdmin as any)
    .from("support_tickets")
    .select("id, mode, status")
    .eq("user_id", userId).eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(1).maybeSingle();
  if (existing) return existing as { id: string; mode: "ai" | "team"; status: "open" };
  const { data, error } = await (supabaseAdmin as any)
    .from("support_tickets")
    .insert({ user_id: userId, mode: "ai", status: "open" })
    .select("id, mode, status").single();
  if (error) throw new Error(error.message);
  return data as { id: string; mode: "ai" | "team"; status: "open" };
}

export const getMyTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ticket = await getOrCreateOpen(context.userId);
    const supabaseAdmin = await getAdmin();
    const { data: messages } = await (supabaseAdmin as any)
      .from("support_messages")
      .select("id, sender, content, created_at")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true });
    return { ticket, messages: messages ?? [] };
  });

export const setSupportMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ mode: z.enum(["ai", "team"]) }).parse(i))
  .handler(async ({ data, context }) => {
    const ticket = await getOrCreateOpen(context.userId);
    const supabaseAdmin = await getAdmin();
    await (supabaseAdmin as any)
      .from("support_tickets")
      .update({ mode: data.mode, updated_at: new Date().toISOString() })
      .eq("id", ticket.id);
    if (data.mode === "team") {
      await (supabaseAdmin as any).from("support_messages").insert({
        ticket_id: ticket.id, sender: "ai",
        content: "To reach our team directly, message us on Telegram: https://t.me/NEET_BUDDY_SUPPORT_bot — we reply fast there.",
      });
    }
    return { ok: true };
  });

export const sendSupportMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ content: z.string().trim().min(1).max(2000) }).parse(i))
  .handler(async ({ data, context }) => {
    const ticket = await getOrCreateOpen(context.userId);
    const supabaseAdmin = await getAdmin();
    // store user message
    await (supabaseAdmin as any).from("support_messages").insert({
      ticket_id: ticket.id, sender: "user", content: data.content,
    });
    await (supabaseAdmin as any).from("support_tickets")
      .update({ updated_at: new Date().toISOString() }).eq("id", ticket.id);

    if (ticket.mode === "team") {
      // wait for admin reply (polled by client). No AI call.
      return { ok: true, mode: "team" as const };
    }

    // AI live chat is disabled. Use FAQ presets; if no match, direct the
    // user to our Telegram support bot @NEET_BUDDY_SUPPORT_bot.
    const faq = matchFaq(data.content);
    const reply = faq
      ? formatFaqAnswer(faq)
      : "I couldn't find an instant answer for that. If your query isn't resolved, please contact our team on Telegram: https://t.me/NEET_BUDDY_SUPPORT_bot";
    await (supabaseAdmin as any).from("support_messages").insert({
      ticket_id: ticket.id, sender: "ai", content: reply,
    });
    return { ok: true, mode: "ai" as const, matched: faq ? ("faq" as const) : ("fallback" as const) };
  });

// ---------------- ADMIN ----------------
async function assertAdmin(userId: string) {
  const supabaseAdmin = await getAdmin();
  const { data } = await (supabaseAdmin as any)
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!data) throw new Error("Admin only");
}

export const listOpenTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    const { data: tickets } = await (supabaseAdmin as any)
      .from("support_tickets")
      .select("id, user_id, mode, status, updated_at, created_at")
      .eq("status", "open")
      .order("updated_at", { ascending: false }).limit(100);
    return { tickets: tickets ?? [] };
  });

export const getTicketMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ticket_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    const { data: messages } = await (supabaseAdmin as any)
      .from("support_messages").select("id, sender, content, created_at")
      .eq("ticket_id", data.ticket_id).order("created_at", { ascending: true });
    return { messages: messages ?? [] };
  });

export const adminReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    ticket_id: z.string().uuid(),
    content: z.string().trim().min(1).max(2000),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    await (supabaseAdmin as any).from("support_messages").insert({
      ticket_id: data.ticket_id, sender: "admin", content: data.content,
    });
    await (supabaseAdmin as any).from("support_tickets")
      .update({ updated_at: new Date().toISOString() }).eq("id", data.ticket_id);
    return { ok: true };
  });

export const closeTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ticket_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    await (supabaseAdmin as any).from("support_tickets")
      .update({ status: "closed" }).eq("id", data.ticket_id);
    return { ok: true };
  });

// Bot helper for admins: generate an AI-drafted reply from the conversation.
// `send: true` posts it to the user as a team reply; otherwise it's returned as a suggestion.
export const adminBotReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    ticket_id: z.string().uuid(),
    send: z.boolean().default(false),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const supabaseAdmin = await getAdmin();
    const { data: history } = await (supabaseAdmin as any)
      .from("support_messages").select("sender, content")
      .eq("ticket_id", data.ticket_id).order("created_at", { ascending: true }).limit(30);

    let apiKey: string | null = null;
    try { apiKey = await getActiveAiKey(); } catch { /* fall through */ }
    if (!apiKey) throw new Error("Bot unavailable: AI key not configured");

    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\nYou are drafting a reply ON BEHALF OF the support team to the user's latest message. Be specific, warm, and solution-oriented.` },
      ...(history ?? []).map((m: any) => ({
        role: m.sender === "user" ? "user" : "assistant",
        content: m.content,
      })),
    ];

    let aiText = "";
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", temperature: 0.4, messages }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (r.status === 429) throw new Error("Bot is rate limited, try again shortly.");
      if (r.status === 402) throw new Error("Bot unavailable: AI credits exhausted.");
      throw new Error(`Bot error ${r.status}: ${t.slice(0, 120)}`);
    }
    const j: any = await r.json();
    aiText = j?.choices?.[0]?.message?.content ?? "";
    if (!aiText) throw new Error("Bot returned an empty reply.");

    if (data.send) {
      await (supabaseAdmin as any).from("support_messages").insert({
        ticket_id: data.ticket_id, sender: "admin", content: aiText,
      });
      await (supabaseAdmin as any).from("support_tickets")
        .update({ updated_at: new Date().toISOString() }).eq("id", data.ticket_id);
    }
    return { ok: true, reply: aiText };
  });

