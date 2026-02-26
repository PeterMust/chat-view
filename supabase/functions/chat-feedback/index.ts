// Supabase Edge Function: chat-feedback
// Stores feedback in the 'chat_feedback' table and forwards it to an n8n webhook.
//
// Deploy:
//   supabase functions deploy chat-feedback --no-verify-jwt
//
// Required env var (set in Supabase Dashboard > Edge Functions > Secrets):
//   N8N_WEBHOOK_URL  – your n8n webhook URL (kept server-side, never exposed to the browser)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    // ── 1. Store in Supabase ──
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { error: dbError } = await db.from("chat_feedback").insert({
      feedback_type: payload.feedback_type,
      category: payload.category,
      comment: payload.comment,
      session_id: payload.session_id,
      message_index: payload.message_index ?? null,
      message_type: payload.message_type ?? null,
      message_timestamp: payload.message_timestamp ?? null,
      message_text_excerpt: payload.message_text_excerpt ?? null,
      tool_name: payload.tool_name ?? null,
      message_count: payload.message_count ?? null,
      raw_message: payload.raw_message ?? null,
      submitted_at: payload.submitted_at,
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
      // Continue to webhook even if DB fails
    }

    // ── 2. Forward to n8n webhook ──
    const webhookUrl = Deno.env.get("N8N_WEBHOOK_URL");
    if (webhookUrl) {
      const webhookRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!webhookRes.ok) {
        console.error("Webhook error:", webhookRes.status, await webhookRes.text());
      }
    } else {
      console.warn("N8N_WEBHOOK_URL not set – skipping webhook");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
