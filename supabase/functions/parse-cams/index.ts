import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, requireAdmin } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
  }

  try {
    let body: unknown;
    try { body = await req.json(); } catch { body = null; }
    const textContent = (body as { textContent?: unknown } | null)?.textContent;
    if (typeof textContent !== "string" || textContent.trim().length < 50 || textContent.length > 300_000) {
      return new Response(
        JSON.stringify({ error: "Invalid statement text. Please upload a readable CAMS PDF." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are a financial document parser. You will receive text extracted from a CAMS (Computer Age Management Services) mutual fund statement.

Extract ALL mutual fund holdings from the statement and return a JSON object with this exact structure:
{
  "investor_name": "Name from statement",
  "holdings": [
    {
      "fund_name": "Full fund scheme name",
      "amc": "AMC name",
      "folio_number": "Folio number",
      "units": 123.456,
      "nav": 45.67,
      "current_value": 5642.78,
      "cost_value": 5000.00,
      "category": "Equity/Debt/Hybrid"
    }
  ],
  "total_current_value": 100000,
  "total_cost_value": 90000
}

Parse carefully. Extract exact numbers. If a value is not found, use null. Always return valid JSON only, no explanation text.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Parse this CAMS statement:\n\n${textContent}` },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "return_parsed_portfolio",
                description: "Return the parsed CAMS portfolio data",
                parameters: {
                  type: "object",
                  properties: {
                    investor_name: { type: "string" },
                    holdings: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          fund_name: { type: "string" },
                          amc: { type: "string" },
                          folio_number: { type: "string" },
                          units: { type: "number" },
                          nav: { type: "number" },
                          current_value: { type: "number" },
                          cost_value: { type: "number" },
                          category: { type: "string" },
                        },
                        required: ["fund_name", "amc"],
                        additionalProperties: false,
                      },
                    },
                    total_current_value: { type: "number" },
                    total_cost_value: { type: "number" },
                  },
                  required: ["holdings"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "return_parsed_portfolio" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI service error");
    }

    const data = await response.json();
    
    // Extract structured output from tool call
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let portfolioData;
    
    if (toolCall) {
      portfolioData = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try to parse from content
      const content = data.choices?.[0]?.message?.content || "{}";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      portfolioData = jsonMatch ? JSON.parse(jsonMatch[0]) : { holdings: [] };
    }

    return new Response(JSON.stringify(portfolioData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-cams error:", e);
    return new Response(
      JSON.stringify({ error: "Failed to parse document" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
