export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    service: "tubex-backend",
    time: new Date().toISOString()
  });
}
