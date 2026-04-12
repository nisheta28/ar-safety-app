const express = require("express");
const cors = require("cors");
const twilio = require("twilio");
require("dotenv").config();

const path = require("path");
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
const authToken = process.env.TWILIO_AUTH_TOKEN || "";
const toPhoneNumber = process.env.TO_PHONE_NUMBER || "";
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || "";

/** Simulated outbound calls for demos when Twilio is not configured */
const simulatedCalls = new Map();

function getTwilioClient() {
  const hasRealCreds =
    accountSid.startsWith("AC") &&
    Boolean(authToken);

  if (!hasRealCreds) {
    return null;
  }

  return twilio(accountSid, authToken);
}

app.post("/call", async (req, res) => {
  try {
    const client = getTwilioClient();
    if (client && toPhoneNumber && twilioPhoneNumber) {
      const call = await client.calls.create({
        url: "http://demo.twilio.com/docs/voice.xml",
        to: toPhoneNumber,
        from: twilioPhoneNumber
      });
      return res.json({ success: true, sid: call.sid, simulated: false });
    }

    const sid = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    simulatedCalls.set(sid, { startedAt: Date.now() });
    return res.json({ success: true, sid, simulated: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/call-status/:sid", async (req, res) => {
  try {
    const { sid } = req.params;

    if (sid.startsWith("sim_")) {
      const rec = simulatedCalls.get(sid);
      if (!rec) {
        return res.status(404).json({ error: "unknown_call" });
      }
      const elapsed = Date.now() - rec.startedAt;
      if (elapsed < 5000) {
        return res.json({
          status: "ringing",
          duration: 0,
          answered: false,
          terminal: false,
          terminalNotAnswered: false,
          simulated: true
        });
      }
      return res.json({
        status: "completed",
        duration: 0,
        answered: false,
        terminal: true,
        terminalNotAnswered: true,
        callStatus: "no-answer",
        simulated: true
      });
    }

    const client = getTwilioClient();
    if (!client) {
      return res.status(400).json({ error: "twilio_not_configured" });
    }

    const call = await client.calls(sid).fetch();
    const duration = parseInt(call.duration, 10) || 0;
    const st = call.status;

    const answered =
      st === "in-progress" || (st === "completed" && duration > 0);

    const terminalNotAnswered =
      st === "busy" ||
      st === "failed" ||
      st === "no-answer" ||
      st === "canceled" ||
      (st === "completed" && duration === 0);

    const stillPending = st === "queued" || st === "ringing" || st === "initiated";

    res.json({
      status: st,
      duration,
      answered,
      terminal: !stillPending && !answered,
      terminalNotAnswered: terminalNotAnswered && !answered,
      simulated: false
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/call/:sid/hangup", async (req, res) => {
  try {
    const { sid } = req.params;

    if (sid.startsWith("sim_")) {
      simulatedCalls.delete(sid);
      return res.json({ success: true, simulated: true });
    }

    const client = getTwilioClient();
    if (!client) {
      return res.status(400).json({ success: false, error: "twilio_not_configured" });
    }

    await client.calls(sid).update({ status: "completed" });
    res.json({ success: true, simulated: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
