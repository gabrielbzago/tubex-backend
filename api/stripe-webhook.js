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
// 🧠 PLAN FROM STRIPE PRODUCT
// ======================================================
function getPlanFromProduct(productId){

  if(!productId){

    console.error(
      "❌ Stripe sem Product ID"
    );

    return null;
  }

  const plan = PLAN_MAP[productId];

  if(!plan){

    console.error(
      "🚨 PRODUTO STRIPE NÃO MAPEADO:",
      productId
    );

    return null;
  }

  return plan;
}

// ======================================================
// 🧹 NORMALIZE EMAIL
// ======================================================
function normalizeEmail(email){

  return String(email || "")
    .trim()
    .toLowerCase();
}

// ======================================================
// 👤 NORMALIZE NAME
// ======================================================
function normalizeName(name){

  const value = String(name || "")
    .trim();

  return value || null;
}

// ======================================================
// 🚦 SUBSCRIPTION STATUS
// ======================================================
function getUserStatus(subscriptionStatus){

  switch(subscriptionStatus){

    case "past_due":
      return "past_due";

    case "unpaid":
      return "unpaid";

    case "incomplete":
      return "incomplete";

    case "incomplete_expired":
      return "canceled";

    case "canceled":
      return "canceled";

    case "trialing":
      return "active";

    case "active":
    default:
      return "active";

  }
}

// ======================================================
// 📦 GET PRODUCT FROM SUBSCRIPTION
// ======================================================
function getProductFromSubscription(subscription){

  const product =
    subscription
      ?.items
      ?.data?.[0]
      ?.price
      ?.product;

  return typeof product === "string"
    ? product
    : product?.id || null;
}

// ======================================================
// 🚀 SAVE USER
// ======================================================
async function saveUser({

  email,
  name = null,
  plan = null,
  status = null,
  stripe_customer_id = null,
  stripe_subscription_id = null

}){

  try{

    const normalizedEmail =
      normalizeEmail(email);

    if(!normalizedEmail){

      console.warn(
        "⚠ saveUser sem email"
      );

      throw new Error(
        "saveUser: email ausente"
      );
    }

    const normalizedName =
      normalizeName(name);

    // ==================================================
    // 🔍 EXISTE?
    // ==================================================
    const {
      data: existingUser,
      error: findError
    } = await supabase
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if(findError){

      console.error(
        "💥 erro buscando usuário:",
        findError
      );

      throw findError;
    }

    let saveError = null;

    // ==================================================
    // 🔄 UPDATE
    // ==================================================
    if(existingUser){

      const updateData = {

        updated_at:
          new Date().toISOString()

      };

      if(normalizedName !== null){
        updateData.name = normalizedName;
      }

      if(plan !== null){
        updateData.plan = plan;
      }

      if(status !== null){
        updateData.status = status;
      }

      if(stripe_customer_id !== null){
        updateData.stripe_customer_id =
          stripe_customer_id;
      }

      if(stripe_subscription_id !== null){
        updateData.stripe_subscription_id =
          stripe_subscription_id;
      }

      const { error } =
        await supabase
          .from("users")
          .update(updateData)
          .eq("email", normalizedEmail);

      saveError = error;

    }

    // ==================================================
    // ➕ INSERT
    // ==================================================
    else{

      const { error } =
        await supabase
          .from("users")
          .insert({

            email: normalizedEmail,
            name: normalizedName,
            plan: plan !== null
              ? plan
              : "free",
            status: status !== null
              ? status
              : "active",

            stripe_customer_id,
            stripe_subscription_id,

            created_at:
              new Date().toISOString(),

            updated_at:
              new Date().toISOString()

          });

      saveError = error;

    }

    if(saveError){

      console.error(
        "💥 erro salvando usuário:",
        saveError
      );

      throw saveError;
    }

    console.log(
      "✅ usuário salvo:",
      normalizedEmail,
      normalizedName,
      plan,
      status
    );

  }catch(err){

    console.error(
      "💥 saveUser fatal:",
      err
    );

    throw err;
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

  if(!signature){

    return res
      .status(400)
      .json({
        success:false,
        error:"Missing Stripe signature"
      });
  }

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
      event.type,
      event.id
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

      const email =
        normalizeEmail(
          session.customer_details?.email ||
          session.customer_email
        );

      const name =
        normalizeName(
          session.customer_details?.name
        );

      if(!email){

        console.warn(
          "⚠ checkout sem email"
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"missing_email"
        });
      }

      // ==================================================
      // 📦 SESSION COMPLETA
      // ==================================================
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

      const plan =
        getPlanFromProduct(productId);

      if(!plan){

        console.error(
          "🚨 CHECKOUT IGNORADO: produto Stripe não reconhecido",
          {
            email,
            productId,
            sessionId: session.id
          }
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"unknown_product"
        });
      }

      // ==================================================
      // 👤 CUSTOMER NAME FALLBACK
      // ==================================================
      let customerName = name;

      if(
        !customerName &&
        fullSession.customer
      ){

        const customer =
          await stripe
            .customers
            .retrieve(
              fullSession.customer
            );

        customerName =
          normalizeName(
            customer?.name
          );
      }

      await saveUser({

        email,
        name: customerName,
        plan,
        status:"active",

        stripe_customer_id:
          fullSession.customer || null,

        stripe_subscription_id:
          fullSession.subscription || null

      });

      console.log(
        "✅ checkout processado:",
        email,
        customerName,
        plan
      );
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
        normalizeEmail(
          customer?.email
        );

      if(!email){

        console.warn(
          "⚠ subscription sem email:",
          subscription.id
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"missing_email"
        });
      }

      const name =
        normalizeName(
          customer?.name
        );

      const productId =
        getProductFromSubscription(
          subscription
        );

      const plan =
        getPlanFromProduct(productId);

      if(!plan){

        console.error(
          "🚨 SUBSCRIPTION UPDATE IGNORADO: produto Stripe não reconhecido",
          {
            email,
            productId,
            subscriptionId:
              subscription.id
          }
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"unknown_product"
        });
      }

      const userStatus =
        getUserStatus(
          subscription.status
        );

      await saveUser({

        email,
        name,
        plan,
        status:userStatus,

        stripe_customer_id:
          subscription.customer || null,

        stripe_subscription_id:
          subscription.id || null

      });

      console.log(
        "🔄 assinatura atualizada:",
        email,
        name,
        plan,
        userStatus
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
        normalizeEmail(
          customer?.email
        );

      if(!email){

        console.warn(
          "⚠ subscription cancelada sem email:",
          subscription.id
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"missing_email"
        });
      }

      const name =
        normalizeName(
          customer?.name
        );

      await saveUser({

        email,
        name,
        plan:"free",
        status:"canceled",

        stripe_customer_id:
          subscription.customer || null,

        stripe_subscription_id:
          subscription.id || null

      });

      console.log(
        "❌ assinatura cancelada:",
        email,
        name
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
        normalizeEmail(
          customer?.email
        );

      if(!email){

        console.warn(
          "⚠ pagamento falhou sem email:",
          invoice.id
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"missing_email"
        });
      }

      const name =
        normalizeName(
          customer?.name
        );

      // IMPORTANTE:
      // não envia plan, então o plano atual é preservado.
      await saveUser({

        email,
        name,
        status:"past_due",

        stripe_customer_id:
          invoice.customer || null,

        stripe_subscription_id:
          invoice.subscription || null

      });

      console.log(
        "⚠ pagamento falhou:",
        email,
        name
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

      // O invoice.paid não decide o plano.
      // O plano é controlado pelos eventos de assinatura.
      // Aqui apenas confirmamos o pagamento e reativamos
      // o status quando a assinatura realmente está ativa.
      let subscription = null;

      if(invoice.subscription){

        subscription =
          await stripe
            .subscriptions
            .retrieve(
              invoice.subscription
            );
      }

      const customer =
        await stripe
          .customers
          .retrieve(
            invoice.customer
          );

      const email =
        normalizeEmail(
          customer?.email
        );

      if(!email){

        console.warn(
          "⚠ fatura paga sem email:",
          invoice.id
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"missing_email"
        });
      }

      const name =
        normalizeName(
          customer?.name
        );

      // Se não houver assinatura vinculada,
      // não inventamos nem alteramos o plano.
      if(!subscription){

        console.warn(
          "⚠ invoice.paid sem assinatura:",
          invoice.id
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"missing_subscription"
        });
      }

      const subscriptionStatus =
        subscription.status;

      // Apenas assinaturas realmente ativas/trialing
      // podem voltar para active.
      if(
        subscriptionStatus !== "active" &&
        subscriptionStatus !== "trialing"
      ){

        console.warn(
          "⚠ invoice.paid não reativado: assinatura não está ativa",
          {
            email,
            invoiceId: invoice.id,
            subscriptionId:
              subscription.id,
            subscriptionStatus
          }
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"subscription_not_active"
        });
      }

      // Recupera o plano da assinatura ATUAL no Stripe.
      // Isso permite corrigir o banco caso o checkout/session
      // webhook tenha falhado anteriormente, sem usar dados
      // antigos da invoice.
      const productId =
        getProductFromSubscription(
          subscription
        );

      const plan =
        getPlanFromProduct(productId);

      if(!plan){

        console.error(
          "🚨 INVOICE PAID IGNORADO: produto da assinatura não reconhecido",
          {
            email,
            productId,
            invoiceId: invoice.id,
            subscriptionId:
              subscription.id
          }
        );

        return res.json({
          received:true,
          ignored:true,
          reason:"unknown_product"
        });
      }

      await saveUser({

        email,
        name,
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
        name,
        plan
      );
    }

  }catch(err){

    console.error(
      "💥 webhook error:",
      err
    );

    // Retornar 500 é importante para que o Stripe
    // possa reenviar o webhook quando houver falha real.
    return res
      .status(500)
      .json({
        received:false,
        error:"Webhook processing failed"
      });
  }

  // ====================================================
  // ✅ RESPONSE
  // ====================================================
  return res.json({
    received:true
  });
}
