export default async function handler(req, res) {

  const origin = req.headers.origin || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {

    const body =
      typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const accessToken =
      body?.accessToken;

    if (!accessToken) {

      return res.status(400).json({

        success:false,

        error:"access_token_required"

      });

    }

    const response =
      await fetch(

        "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",

        {

          headers: {

            Authorization:
              `Bearer ${accessToken}`

          }

        }

      );

    const json =
      await response.json();

    return res.status(200).json({

      success:true,

      channels:
        json.items || []

    });

  }

  catch(err){

    console.error(err);

    return res.status(500).json({

      success:false,

      error:"internal_error"

    });

  }

}