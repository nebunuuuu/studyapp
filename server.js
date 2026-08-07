/* ============================================================
   server.js — punct de intrare. v0.1.1: accesibil pe rețeaua WiFi.
     npm install
     npm start
   Apoi deschizi http://localhost:3000 pe acest calculator, sau
   http://<IP-ul-afișat-mai-jos>:3000 de pe telefon/tabletă din
   aceeași rețea WiFi.
   ============================================================ */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const passport = require("passport");
const path = require("path");
const os = require("os");

require("./db"); // inițializează DB + creează admin la primul start

const { router: authRouter } = require("./auth");
const apiRouter = require("./api");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0"; // ascultă pe toate interfețele de rețea, nu doar localhost

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(passport.initialize());

app.use(express.static(path.join(__dirname, "public")));

app.use("/auth", authRouter);
app.use("/api", apiRouter);

app.get("/health", (req, res) => res.json({ status: "ok", version: "0.1.1" }));

app.use((req, res) => res.status(404).json({ error: "Rută inexistentă." }));

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

app.listen(PORT, HOST, () => {
  const ips = getLocalIPs();
  console.log(`\nStudyApp server v0.1.1 pornit.\n`);
  console.log(`  Pe acest calculator:  http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach((ip) => console.log(`  Pe rețeaua WiFi:      http://${ip}:${PORT}`));
    console.log(`\n  Folosește adresa "Pe rețeaua WiFi" pe telefon/tabletă, conectate la același WiFi.`);
  } else {
    console.log(`  Nu s-a detectat nicio interfață de rețea activă (verifică WiFi-ul).`);
  }
  console.log("");
});
