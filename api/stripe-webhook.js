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
const PLAN_MAP = {

  "prod_SlRU1DGWgG5nzq": "start",
  "prod_SlRVtiheQa9IZG": "pro",
  "prod_SlRWvDMlS5e9dR": "expert"

};

// ======================================================
// 🚀 SAVE USER
// ======================================================
async function saveUser({

  email,
  plan = "free",
  status = "active",
  stripe_customer_id = null,
  stripe_subscription_id = null

}){

  try{

    if(!email){

      console.warn(
        "⚠ saveUser sem email"
      );

      return;

    }

    email = String(email)
      .trim()
      .toLowerCase();

    // ================================================
    // 🔍 EXISTE?
    // ================================================
    const {
      data: existingUser,
      error: findError
    } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if(findError){

      console.error(
        "💥 erro buscando usuário:",
        findError
      );

      return;

    }

    let saveError = null;

    // ================================================
    // 🔄 UPDATE
    // ================================================
    if(existingUser){

      const { error } =
        await supabase
          .from("users")
          .update({

            plan,
            status,

            stripe_customer_id,

            stripe_subscription_id,

            updated_at:
              new Date().toISOString()

          })
          .eq("email", email);

      saveError = error;

    }

    // ================================================
    // ➕ INSERT
    // ================================================
    else{

      const { error } =
        await supabase
          .from("users")
          .insert({

            email,
            plan,
            status,

            stripe_customer_id,

            stripe_subscription_id,

            created_at:
              new Date().toISOString(),

            updated_at:
              new Date().toISOString()

          });

      saveError = error;

    }

    // ================================================
    // 🚫 ERROR
    // ================================================
    if(saveError){

      console.error(
        "💥 erro salvando usuário:",
        saveError
      );

    }else{

      console.log(
        "✅ usuário salvo:",
        email,
        plan,
        status
      );

    }

  }catch(err){

    console.error(
      "💥 saveUser fatal:",
      err
    );

  }

}

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
  // 🧠 EVENTS
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

      const email = String(

        session.customer_details?.email ||

        session.customer_email ||

        ""

      )
      .trim()
      .toLowerCase();

      if(!email){

        console.warn(
          "⚠ checkout sem email"
        );

        return res.json({
          received:true
        });

      }

      // ================================================
      // 📦 SESSION COMPLETA
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
      // 💰 PRODUCT
      // ================================================
   const product =

  fullSession
    ?.line_items
    ?.data?.[0]
    ?.price
    ?.product;

const productId =

  typeof product === "string"
    ? product
    : product?.id;

      console.log(
        "🔥 PRODUCT ID:",
        productId
      );

      // ================================================
      // 🔥 PLAN
      // ================================================
      const plan =

        PLAN_MAP[productId] ||

        "free";

      console.log(
        "🔥 PLAN:",
        plan
      );

      // ================================================
      // 💾 SAVE
      // ================================================
      await saveUser({

        email,
        plan,
        status:"active",

        stripe_customer_id:
          session.customer || null,

        stripe_subscription_id:
          session.subscription || null

      });

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

      const product =

  subscription
    ?.items
    ?.data?.[0]
    ?.price
    ?.product;

const productId =

  typeof product === "string"
    ? product
    : product?.id;

      const plan =

        PLAN_MAP[productId] ||

        "free";

      await saveUser({

        email,
        plan,
        status:"active",

        stripe_customer_id:
          subscription.customer || null,

        stripe_subscription_id:
          subscription.id || null

      });

      console.log(
        "🔄 assinatura atualizada:",
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

      await saveUser({

        email,
        plan:"free",
        status:"canceled",

        stripe_customer_id:
          subscription.customer || null,

        stripe_subscription_id:
          subscription.id || null

      });

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

      await saveUser({

        email,
        status:"past_due",

        stripe_customer_id:
          invoice.customer || null,

        stripe_subscription_id:
          invoice.subscription || null

      });

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

   const product =

  invoice
    ?.lines
    ?.data?.[0]
    ?.price
    ?.product;

const productId =

  typeof product === "string"
    ? product
    : product?.id;

      const plan =

        PLAN_MAP[productId] ||

        "free";

      await saveUser({

        email,
        plan,
        status:"active",

        stripe_customer_id:
          invoice.customer || null,

        stripe_subscription_id:
          invoice.subscription || null

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