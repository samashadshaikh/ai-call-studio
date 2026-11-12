const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const defaultKnowledge = `How much do custom rugs cost? | Pricing depends on size, material and design complexity. After a short design consultation, we share an exact quotation before any work begins.
How long does delivery take? | Most custom orders are completed in four to six weeks after the design is approved.
Can I choose the colours? | Yes. Colours, size, shape and pattern can all be customised for your space.
Do you deliver across India? | Yes, we deliver across India. Delivery timing is confirmed with the quotation.
Can you make an unusual shape? | Yes. We can create standard and irregular shapes based on a drawing or dimensions.
Is a consultation free? | Yes, the initial design consultation is complimentary and there is no obligation to order.
How do I maintain the rug? | Regular gentle vacuuming is recommended. We also provide care guidance for the selected material.`;

const defaultLeads = [
  { name: "Demo Lead One", phone: "+91 00000 00001", company: "Example Studio", interest: "Custom rug", language: "Hinglish", status: "New" },
  { name: "Demo Lead Two", phone: "+91 00000 00002", company: "Example Residence", interest: "Living room rug", language: "English", status: "New" },
  { name: "Demo Lead Three", phone: "+91 00000 00003", company: "Example Interiors", interest: "Trade partnership", language: "English", status: "Callback" }
];

const state = {
  leads: JSON.parse(localStorage.getItem("callstudio.leads") || "null") || defaultLeads,
  knowledge: localStorage.getItem("callstudio.knowledge") || defaultKnowledge,
  settings: JSON.parse(localStorage.getItem("callstudio.settings") || "null") || {
    business: "The PieCraft", agent: "Maya", language: "en-IN",
    objective: "Qualify interest in a custom rug and arrange a design consultation",
    voice: "", ollama: true, model: "qwen3:4b"
  },
  voices: [], ollamaAvailable: false, currentLead: null, call: null, recognition: null,
  timer: null, seconds: 0, speaking: false, listening: false
};

const isHostedMobileDemo = !["localhost", "127.0.0.1"].includes(location.hostname);

const flow = [
  { field: "requirement", ask: "To understand what would work best, could you tell me a little about the rug or space you have in mind?" },
  { field: "budget", ask: "Thank you. Have you set an approximate budget range for this project?" },
  { field: "timeline", ask: "And when would you ideally like the rug to be ready?" },
  { field: "location", ask: "Which city should we plan delivery for?" },
  { field: "nextStep", ask: "Would you like me to arrange a complimentary design consultation with our specialist?" }
];

function initials(name = "Lead") { return name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase(); }
function escapeHtml(text = "") { return text.replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 2800); }

function saveLeads() { localStorage.setItem("callstudio.leads", JSON.stringify(state.leads)); }

function renderLeads() {
  $("#lead-count").textContent = state.leads.length;
  $("#qualified-count").textContent = state.leads.filter((lead) => lead.status === "Qualified").length;
  $("#leads-body").innerHTML = state.leads.map((lead, index) => `
    <tr>
      <td><div class="lead-name"><span class="mini-avatar">${initials(lead.name)}</span><div><b>${escapeHtml(lead.name)}</b><small>${escapeHtml(lead.phone)}</small></div></div></td>
      <td>${escapeHtml(lead.interest || "General enquiry")}</td>
      <td>${escapeHtml(lead.language || "English")}</td>
      <td><span class="status ${lead.status === "Qualified" ? "qualified" : ""}">${escapeHtml(lead.status || "New")}</span></td>
      <td><button class="call-link" data-call-index="${index}">Call →</button></td>
    </tr>`).join("");
  $$('[data-call-index]').forEach((button) => button.addEventListener("click", () => startCall(Number(button.dataset.callIndex))));
}

function switchView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  $("#page-title").textContent = ({ campaign: "Lead qualification", knowledge: "Knowledge base", settings: "Agent setup" })[name];
}

function parseCSV(text) {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean).map((line) => {
    const cells = []; let value = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) { cells.push(value.trim()); value = ""; }
      else value += char;
    }
    cells.push(value.trim()); return cells;
  });
  const headers = rows.shift().map((header) => header.toLowerCase().trim());
  return rows.map((cells) => Object.fromEntries(headers.map((header, i) => [header, cells[i] || ""]))).filter((lead) => lead.name && lead.phone);
}

function parseKnowledge() {
  return state.knowledge.split(/\r?\n/).map((line) => {
    const separator = line.indexOf("|");
    return separator > 0 ? { q: line.slice(0, separator).trim(), a: line.slice(separator + 1).trim() } : null;
  }).filter(Boolean);
}

function normalize(text) { return text.toLowerCase().replace(/[^a-z0-9\s₹]/g, " ").replace(/\s+/g, " ").trim(); }
function bestKnowledgeMatch(input) {
  const stop = new Set(["the","a","an","is","are","do","does","can","you","i","we","to","of","for","and","how","what"]);
  const words = normalize(input).split(" ").filter((word) => word.length > 2 && !stop.has(word));
  let best = null; let score = 0;
  for (const item of parseKnowledge()) {
    const haystack = normalize(item.q + " " + item.a);
    const current = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
    if (current > score) { score = current; best = item; }
  }
  return score >= 1 ? best : null;
}

function addTurn(role, text) {
  const turn = document.createElement("div");
  turn.className = `turn ${role}`;
  turn.innerHTML = `<b>${role === "agent" ? escapeHtml(state.settings.agent) : "Lead"}</b><p>${escapeHtml(text)}</p>`;
  $("#transcript").append(turn);
  $("#transcript").scrollTop = $("#transcript").scrollHeight;
  if (state.call) state.call.transcript.push({ role, text });
}

function setVoiceState(text, mode = "idle") {
  $("#voice-state").textContent = text;
  $("#voice-orb").classList.toggle("speaking", mode === "speaking");
}

function chosenVoice() {
  return state.voices.find((voice) => voice.name === state.settings.voice)
    || state.voices.find((voice) => voice.lang === state.settings.language)
    || state.voices.find((voice) => voice.lang?.startsWith("en-IN"))
    || state.voices[0];
}

function speak(text, after) {
  stopListening(); state.speaking = true; addTurn("agent", text); setVoiceState(`${state.settings.agent} is speaking`, "speaking");
  if (!("speechSynthesis" in window)) { state.speaking = false; setTimeout(() => { setVoiceState("Listening…"); startListening(); after?.(); }, 400); return; }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = chosenVoice(); utterance.lang = state.settings.language; utterance.rate = 1.02; utterance.pitch = 1.01;
  utterance.onend = () => { state.speaking = false; setVoiceState("Listening…"); startListening(); after?.(); };
  utterance.onerror = () => { state.speaking = false; setVoiceState("Listening…"); startListening(); after?.(); };
  speechSynthesis.speak(utterance);
}

function setupRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognition = new SpeechRecognition();
  recognition.lang = state.settings.language; recognition.continuous = false; recognition.interimResults = true;
  recognition.onstart = () => { state.listening = true; setVoiceState("Listening…"); };
  recognition.onspeechstart = () => { if (state.speaking) speechSynthesis.cancel(); };
  recognition.onresult = (event) => {
    const result = [...event.results].map((item) => item[0].transcript).join(" ");
    setVoiceState(event.results[event.results.length - 1].isFinal ? "Thinking…" : `Heard: “${result}”`);
    if (event.results[event.results.length - 1].isFinal) handleLeadReply(result.trim());
  };
  recognition.onerror = (event) => {
    state.listening = false;
    if (event.error === "not-allowed") { toast("Microphone permission was blocked. Use the keyboard button instead."); $("#text-reply-form").classList.remove("hidden"); }
  };
  recognition.onend = () => { state.listening = false; if (state.call && !state.speaking && !state.call.ended && !state.call.processing) setTimeout(startListening, 350); };
  return recognition;
}

function startListening() {
  if (!state.call || state.call.ended || state.call.processing || state.listening) return;
  if (!state.recognition) state.recognition = setupRecognition();
  if (!state.recognition) { setVoiceState("Microphone speech recognition unavailable — type a reply"); $("#text-reply-form").classList.remove("hidden"); return; }
  try { state.recognition.lang = state.settings.language; state.recognition.start(); } catch {}
}
function stopListening() { if (state.recognition && state.listening) { try { state.recognition.stop(); } catch {} } state.listening = false; }

function extractValue(field, input) {
  const clean = input.replace(/^(yes|yeah|sure|okay|ok|well)[,\s-]*/i, "").trim();
  if (field === "nextStep") return /\b(no|not now|later|don't|do not)\b/i.test(input) ? "Follow up later" : "Design consultation requested";
  return clean.length > 70 ? `${clean.slice(0, 67)}…` : clean;
}

function updateField(field, value) {
  state.call.answers[field] = value;
  const target = $(`[data-field="${field}"]`); if (target) target.textContent = value;
}

async function askOllama(input) {
  const knowledge = parseKnowledge().map((item) => `${item.q}: ${item.a}`).join("\n");
  const messages = [
    { role: "system", content: `You are ${state.settings.agent}, an automated voice assistant for ${state.settings.business}. Speak naturally in at most two short sentences. You must not invent facts. If the knowledge does not contain the answer, say a specialist will confirm it. Your goal: ${state.settings.objective}. Approved knowledge:\n${knowledge}` },
    ...state.call.transcript.slice(-8).map((turn) => ({ role: turn.role === "agent" ? "assistant" : "user", content: turn.text })),
    { role: "user", content: input }
  ];
  const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: state.settings.model, messages }) });
  if (!response.ok) throw new Error("Ollama unavailable");
  return (await response.json()).message.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function handleLeadReply(input) {
  if (!state.call || state.call.processing || !input) return;
  state.call.processing = true; stopListening(); addTurn("lead", input); setVoiceState("Thinking…");

  const current = flow[state.call.step];
  const faq = bestKnowledgeMatch(input);
  const looksLikeQuestion = /\?|\b(how|what|when|where|can|do|does|is|are|price|cost|delivery|custom|material)\b/i.test(input);

  if (looksLikeQuestion && faq) {
    state.call.processing = false;
    return speak(`${faq.a} ${current ? current.ask : "Is there anything else I can help with?"}`);
  }

  if (looksLikeQuestion && state.settings.ollama && state.ollamaAvailable) {
    try {
      const answer = await askOllama(input);
      state.call.processing = false;
      return speak(`${answer} ${current ? current.ask : "Would you like us to arrange the next step?"}`);
    } catch {}
  }

  if (/\b(not interested|stop calling|remove me|do not call|don't call)\b/i.test(input)) {
    state.call.outcome = "Do not call"; state.call.processing = false;
    return speak("Of course. I’ll record that immediately. Thank you for your time.", () => setTimeout(() => finishCall("Do not call"), 700));
  }

  if (state.call.step === -1) {
    if (/\b(no|not now|busy|later|another time)\b/i.test(input)) {
      state.call.outcome = "Callback"; state.call.processing = false;
      return speak("No problem at all. I’ll ask the team to follow up at a better time. Thank you.", () => setTimeout(() => finishCall("Callback"), 700));
    }
    state.call.step = 0; state.call.processing = false;
    return speak(flow[0].ask);
  }

  if (current) {
    updateField(current.field, extractValue(current.field, input)); state.call.step++;
    const next = flow[state.call.step]; state.call.processing = false;
    if (next) return speak(next.ask);
    state.call.outcome = state.call.answers.nextStep === "Design consultation requested" ? "Qualified" : "Callback";
    const closing = state.call.outcome === "Qualified"
      ? "Perfect. I’ve noted that our design specialist should contact you for the complimentary consultation. Thank you for your time."
      : "No problem. I’ll note this for a later follow-up. Thank you for your time.";
    return speak(closing, () => setTimeout(() => finishCall(state.call.outcome), 900));
  }

  state.call.processing = false; speak("Thank you. I’ve recorded that for our specialist.");
}

function startCall(index = 0) {
  const lead = state.leads[index] || state.leads[0]; if (!lead) return toast("Import or add a lead first.");
  state.currentLead = lead; state.seconds = 0;
  state.call = { leadIndex: index, step: -1, answers: {}, transcript: [], processing: true, ended: false, outcome: "Demo ended" };
  $("#call-name").textContent = lead.name; $("#call-number").textContent = lead.phone; $("#call-avatar").textContent = initials(lead.name);
  $("#transcript").innerHTML = ""; $$("#live-fields dd").forEach((dd, i) => dd.textContent = i === 0 ? "Listening…" : "—");
  $("#call-layer").classList.add("open"); $("#call-layer").setAttribute("aria-hidden", "false");
  $("#call-status").textContent = "Connecting"; $("#call-timer").textContent = "00:00"; setVoiceState("Preparing the assistant…");
  clearInterval(state.timer); state.timer = setInterval(() => { state.seconds++; const min = String(Math.floor(state.seconds / 60)).padStart(2,"0"); const sec = String(state.seconds % 60).padStart(2,"0"); $("#call-timer").textContent = `${min}:${sec}`; }, 1000);
  setTimeout(() => {
    $("#call-status").textContent = "Live simulation"; state.call.processing = false;
    const firstName = lead.name.split(" ")[0];
    speak(`Hello ${firstName}, I’m ${state.settings.agent}, an automated assistant calling from ${state.settings.business} regarding your ${lead.interest || "enquiry"}. Is now a convenient time for a quick conversation?`);
  }, 800);
}

function finishCall(outcome = "Demo ended") {
  if (!state.call || state.call.ended) return;
  state.call.ended = true; state.call.outcome = outcome; stopListening(); window.speechSynthesis?.cancel(); clearInterval(state.timer);
  setVoiceState("Call completed"); $("#call-status").textContent = outcome;
  const lead = state.leads[state.call.leadIndex]; lead.status = outcome; lead.lastCall = new Date().toISOString(); lead.summary = { ...state.call.answers, duration: state.seconds, outcome };
  saveLeads(); renderLeads();
  setTimeout(() => { $("#call-layer").classList.remove("open"); $("#call-layer").setAttribute("aria-hidden", "true"); toast(`Demo completed — outcome: ${outcome}`); }, 900);
}

function populateVoices() {
  state.voices = speechSynthesis?.getVoices?.() || [];
  const select = $("#voice-select");
  const useful = state.voices.filter((voice) => /^(en|hi)-/i.test(voice.lang));
  select.innerHTML = useful.map((voice) => `<option value="${escapeHtml(voice.name)}">${escapeHtml(voice.name)} · ${voice.lang}</option>`).join("") || "<option>Browser default</option>";
  if (state.settings.voice) select.value = state.settings.voice;
}

async function checkOllama(showToast = false) {
  if (isHostedMobileDemo) {
    state.ollamaAvailable = false;
    const pill = $("#system-pill"); pill.classList.add("online"); $("b", pill).textContent = "Mobile voice mode";
    if (showToast) toast("The mobile demo uses the reliable scripted agent. Ollama remains available in the laptop version.");
    return;
  }
  try {
    const data = await (await fetch("/api/health")).json(); state.ollamaAvailable = data.ollama;
    const pill = $("#system-pill"); pill.classList.toggle("online", data.ollama); $("b", pill).textContent = data.ollama ? `Ollama ready · ${data.models.length} model${data.models.length === 1 ? "" : "s"}` : "Scripted mode";
    if (showToast) toast(data.ollama ? `Ollama is ready. Models: ${data.models.join(", ") || "none downloaded"}` : "Ollama is not running. Scripted demo mode is ready.");
  } catch { state.ollamaAvailable = false; }
}

function loadSettingsIntoForm() {
  $("#business-name").value = state.settings.business; $("#agent-name").value = state.settings.agent; $("#agent-language").value = state.settings.language;
  $("#agent-objective").value = state.settings.objective; $("#ollama-toggle").checked = state.settings.ollama; $("#ollama-model").value = state.settings.model;
}

function init() {
  if (isHostedMobileDemo) state.settings.ollama = false;
  renderLeads(); $("#knowledge-input").value = state.knowledge; loadSettingsIntoForm(); populateVoices(); checkOllama();
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = populateVoices;
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$('[data-view-jump]').forEach((item) => item.addEventListener("click", () => switchView(item.dataset.viewJump)));
  $("#new-demo-button").addEventListener("click", () => startCall(0));
  $("#import-button").addEventListener("click", () => $("#csv-input").click());
  $("#csv-input").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const leads = parseCSV(await file.text());
    if (!leads.length) return toast("No rows with name and phone columns were found.");
    state.leads = leads.map((lead) => ({ ...lead, status: lead.status || "New" })); saveLeads(); renderLeads(); $("#lead-source").textContent = file.name; toast(`${leads.length} leads imported.`);
  });
  $("#save-knowledge").addEventListener("click", () => { state.knowledge = $("#knowledge-input").value.trim(); localStorage.setItem("callstudio.knowledge", state.knowledge); $("#knowledge-state").textContent = "Saved just now"; toast("Knowledge saved locally."); });
  $("#reset-knowledge").addEventListener("click", () => { $("#knowledge-input").value = defaultKnowledge; state.knowledge = defaultKnowledge; localStorage.setItem("callstudio.knowledge", defaultKnowledge); toast("Sample knowledge restored."); });
  $("#save-settings").addEventListener("click", () => {
    state.settings = { business: $("#business-name").value.trim() || "Your business", agent: $("#agent-name").value.trim() || "Maya", language: $("#agent-language").value, voice: $("#voice-select").value, objective: $("#agent-objective").value.trim(), ollama: $("#ollama-toggle").checked, model: $("#ollama-model").value.trim() || "qwen3:4b" };
    localStorage.setItem("callstudio.settings", JSON.stringify(state.settings)); state.recognition = null; toast("Agent setup saved.");
  });
  $("#check-ollama").addEventListener("click", () => checkOllama(true));
  $("#end-call").addEventListener("click", () => finishCall("Demo ended")); $("#close-call").addEventListener("click", () => finishCall("Demo ended"));
  $("#mute-button").addEventListener("click", (event) => { if (state.listening) { stopListening(); event.currentTarget.classList.add("active"); setVoiceState("Listening paused"); } else { event.currentTarget.classList.remove("active"); startListening(); } });
  $("#type-button").addEventListener("click", () => { $("#text-reply-form").classList.toggle("hidden"); $("#text-reply").focus(); });
  $("#text-reply-form").addEventListener("submit", (event) => { event.preventDefault(); const input = $("#text-reply"); const value = input.value.trim(); input.value = ""; if (value) handleLeadReply(value); });
  if (isHostedMobileDemo) {
    $("#ollama-toggle").disabled = true;
    $("#ollama-model").disabled = true;
    $("#check-ollama").textContent = "Laptop-only option";
    $("#check-ollama").disabled = true;
    $(".mini-note").innerHTML = "On mobile, the dependable scripted engine handles the qualification flow and approved answers. Ollama remains optional in the local laptop version.";
  }
  if (new URLSearchParams(location.search).get("autostart") === "1") setTimeout(() => startCall(0), 250);
}

init();
