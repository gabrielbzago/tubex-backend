import Stripe from "stripe";
import { buffer } from "micro";
import { createClient } from "@supabase/supabase-js";

// ======================================================
// 🔥 STRIPE
// ======================================================
const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY
);

// ======================================================
// 🔥 SUPABASE
// ======================================================
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ======================================================
// 🚫 BODY PARSER
// ======================================================
export const config = {
  api: {
    bodyParser: false
  }
};

// ======================================================
// 🔥 PLAN MAP
// ======================================================
// ⚠️ TROQUE PELOS PRICE IDs REAIS
const PLAN_MAP = {

  "price_START_REAL": "start",

  "price_PRO_REAL": "pro",

  "price_EXPERT_REAL": "expert"

};

// ======================================================
// 🚀 HANDLER
// ======================================================
export default async function handler(
  req,
  res
){

  // ====================================================
  // 🚫 METHOD
  // ====================================================
  if(req.method !== "POST"){

    return res
      .status(405)
      .json({
        success:false
      });

  }

  // ====================================================
  // 🔐 SIGNATURE
  // ====================================================
  const signature =
    req.headers["stripe-signature"];

  const rawBody =
    await buffer(req);

  let event;

  // ====================================================
  // 🔒 VERIFY WEBHOOK
  // ====================================================
  try{

    event =
      stripe.webhooks.constructEvent(

        rawBody,

        signature,

        process.env
          .STRIPE_WEBHOOK_SECRET

      );

  }catch(err){

    console.error(
      "❌ webhook inválido:",
      err.message
    );

    return res
      .status(400)
      .send(
        `Webhook Error: ${err.message}`
      );

  }

  // ====================================================
  // 🧠 EVENT
  // ====================================================
  try{

    console.log(
      "🔥 EVENT:",
      event.type
    );

    // ==================================================
    // ✅ CHECKOUT COMPLETED
    // ==================================================
    if(
      event.type ===
      "checkout.session.completed"
    ){

      const session =
        event.data.object;

      // ================================================
      // 📧 EMAIL
      // ================================================
      const email = String(

        session.customer_details?.email ||

        session.customer_email ||

        ""

      )
      .trim()
      .toLowerCase();

      // ================================================
      // 🚫 NO EMAIL
      // ================================================
      if(!email){

        console.warn(
          "⚠ sem email checkout"
        );

        return res.json({
          received:true
        });

      }

      // ================================================
      // 📦 LINE ITEMS
      // ================================================
      const fullSession =
        await stripe
          .checkout
          .sessions
          .retrieve(

            session.id,

            {
              expand:["line_items"]
            }

          );

      // ================================================
      // 💰 PRICE
      // ================================================
      const priceId =

        fullSession
          ?.line_items
          ?.data?.[0]
          ?.price
          ?.id;

      // ================================================
      // 🔥 PLAN
      // ================================================
      const plan =

        PLAN_MAP[priceId] ||

        "free";

      // ================================================
      // 🚀 SAVE USER
      // ================================================
      const { error } =
        await supabase
          .from("users")
          .upsert({

            email,

            plan,

            status:"active",

            stripe_customer_id:
              session.customer || null,

            stripe_subscription_id:
              session.subscription || null,

            updated_at:
              new Date()

          });

      if(error){

        console.error(
          "💥 supabase save:",
          error
        );

      }else{

        console.log(
          "✅ usuário salvo:",
          email,
          plan
        );

      }

    }

    // ==================================================
    // 🔄 SUB UPDATED
    // ==================================================
    if(
      event.type ===
      "customer.subscription.updated"
    ){

      const subscription =
        event.data.object;

      const customerId =
        subscription.customer;

      // ================================================
      // 📧 CUSTOMER
      // ================================================
      const customer =
        await stripe
          .customers
          .retrieve(
            customerId
          );

      const email =
        String(
          customer?.email || ""
        )
        .trim()
        .toLowerCase();

      // ================================================
      // 💰 PRICE
      // ================================================
      const priceId =

        subscription
          ?.items
          ?.data?.[0]
          ?.price
          ?.id;

      // ================================================
      // 🔥 PLAN
      // ================================================
      const plan =

        PLAN_MAP[priceId] ||

        "free";

      // ================================================
      // 🚀 UPDATE USER
      // ================================================
      await supabase
        .from("users")
        .upsert({

          email,

          plan,

          status:"active",

          stripe_customer_id:
            customerId,

          stripe_subscription_id:
            subscription.id,

          updated_at:
            new Date()

        });

      console.log(
        "🔄 plano atualizado:",
        email,
        plan
      );

    }

    // ==================================================
    // ❌ SUB DELETED
    // ==================================================
    if(
      event.type ===
      "customer.subscription.deleted"
    ){

      const subscription =
        event.data.object;

      const customer =
        await stripe
          .customers
          .retrieve(
            subscription.customer
          );

      const email =
        String(
          customer?.email || ""
        )
        .trim()
        .toLowerCase();

      // ================================================
      // 🚫 CANCEL USER
      // ================================================
      await supabase
        .from("users")
        .update({

          status:"canceled",

          updated_at:
            new Date()

        })
        .eq(
          "email",
          email
        );

      console.log(
        "❌ assinatura cancelada:",
        email
      );

    }

    // ==================================================
    // ⚠ PAYMENT FAILED
    // ==================================================
    if(
      event.type ===
      "invoice.payment_failed"
    ){

      const invoice =
        event.data.object;

      const customer =
        await stripe
          .customers
          .retrieve(
            invoice.customer
          );

      const email =
        String(
          customer?.email || ""
        )
        .trim()
        .toLowerCase();

      // ================================================
      // 🚫 PAST DUE
      // ================================================
      await supabase
        .from("users")
        .update({

          status:"past_due",

          updated_at:
            new Date()

        })
        .eq(
          "email",
          email
        );

      console.log(
        "⚠ pagamento falhou:",
        email
      );

    }

    // ==================================================
    // 💰 INVOICE PAID
    // ==================================================
    if(
      event.type ===
      "invoice.paid"
    ){

      const invoice =
        event.data.object;

      const customer =
        await stripe
          .customers
          .retrieve(
            invoice.customer
          );

      const email =
        String(
          customer?.email || ""
        )
        .trim()
        .toLowerCase();

      // ================================================
      // 🔥 PRICE
      // ================================================
      const priceId =

        invoice
          ?.lines
          ?.data?.[0]
          ?.price
          ?.id;

      const plan =

        PLAN_MAP[priceId] ||

        "free";

      // ================================================
      // ✅ REACTIVATE
      // ================================================
      await supabase
        .from("users")
        .upsert({

          email,

          plan,

          status:"active",

          stripe_customer_id:
            invoice.customer,

          updated_at:
            new Date()

        });

      console.log(
        "💰 fatura paga:",
        email,
        plan
      );

    }

  }catch(err){

    console.error(
      "💥 webhook error:",
      err
    );

  }

  // ====================================================
  // ✅ RESPONSE
  // ====================================================
  return res.json({
    received:true
  });

}