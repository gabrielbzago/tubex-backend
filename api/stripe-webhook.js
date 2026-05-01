import Stripe from "stripe";
import { buffer } from "micro";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: { bodyParser: false },
};

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

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;

      const email =
        session.customer_details?.email ||
        session.customer_email ||
        "sem-email";

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      const priceId = lineItems.data[0]?.price?.id;

      const plan = PLAN_MAP[priceId] || "free";

      console.log("💰 Pagamento aprovado:", email, plan);
    }

    if (event.type === "customer.subscription.updated") {

      const subscription = event.data.object;

      const customerId = subscription.customer;
      const priceId = subscription.items.data[0]?.price?.id;

      const plan = PLAN_MAP[priceId] || "free";

      console.log("🔄 Plano atualizado:", customerId, plan);
    }

    if (event.type === "customer.subscription.deleted") {

      const subscription = event.data.object;

      console.log("❌ Assinatura cancelada:", subscription.customer);
    }

    if (event.type === "invoice.payment_failed") {

      const invoice = event.data.object;

      console.log("⚠️ Pagamento falhou:", invoice.customer);
    }

  } catch (err) {
    console.error("💥 erro geral webhook:", err);
  }

  return res.json({ received: true });
}