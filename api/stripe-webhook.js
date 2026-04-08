import Stripe from "stripe";
import { buffer } from "micro";
import { supabase } from "../lib/supabase.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: { bodyParser: false },
};

// 🔥 MAPEAMENTO DE PLANOS
const PLAN_MAP = {
  "price_start_123": "start",
  "price_pro_456": "pro",
  "price_expert_789": "expert"
};

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const sig = req.headers["stripe-signature"];
  const buf = await buffer(req);

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook inválido:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {

    // =========================
    // 💰 PAGAMENTO / ASSINATURA
    // =========================
    if (event.type === "checkout.session.completed") {

      const session = event.data.object;

      const email = session.customer_email;
      const customerId = session.customer;

      // 🔥 pega o price_id correto
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const priceId = lineItems.data[0]?.price?.id;

      const plan = PLAN_MAP[priceId] || "free";

      console.log("💰 Pagamento aprovado:", email, plan);

      await supabase
        .from("users")
        .upsert([
          {
            email: email.toLowerCase(),
            plan: plan,
            stripe_customer_id: customerId,
            status: "active"
          }
        ]);

    }

    // =========================
    // 🔁 UPGRADE / DOWNGRADE
    // =========================
    if (event.type === "customer.subscription.updated") {

      const subscription = event.data.object;

      const customerId = subscription.customer;
      const priceId = subscription.items.data[0]?.price?.id;

      const plan = PLAN_MAP[priceId] || "free";

      console.log("🔄 Plano atualizado:", customerId, plan);

      await supabase
        .from("users")
        .update({
          plan: plan,
          status: "active"
        })
        .eq("stripe_customer_id", customerId);

    }

    // =========================
    // ❌ CANCELAMENTO
    // =========================
    if (event.type === "customer.subscription.deleted") {

      const subscription = event.data.object;
      const customerId = subscription.customer;

      console.log("❌ Assinatura cancelada:", customerId);

      await supabase
        .from("users")
        .update({
          plan: "free",
          status: "cancelled"
        })
        .eq("stripe_customer_id", customerId);
    }

    // =========================
    // ⚠️ PAGAMENTO FALHOU
    // =========================
    if (event.type === "invoice.payment_failed") {

      const invoice = event.data.object;
      const customerId = invoice.customer;

      console.log("⚠️ Pagamento falhou:", customerId);

      await supabase
        .from("users")
        .update({
          status: "past_due"
        })
        .eq("stripe_customer_id", customerId);
    }

  } catch (err) {
    console.error("Erro geral webhook:", err);
  }

  res.json({ received: true });
}