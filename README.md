# Local AI Call Studio

A zero-cost browser demonstration of an outbound AI calling workflow. It simulates the call through your laptop microphone and speakers, so no phone carrier or paid API is required.

## Start

Requirements: Node.js 18 or newer and Microsoft Edge or Google Chrome.

```powershell
npm start
```

Open <http://127.0.0.1:4173> and allow microphone access.

## Test on a mobile phone

Use the private HTTPS deployment URL provided with the project. Open it in Chrome on Android or Safari on iPhone, allow microphone access, and tap **Start demo call**. The mobile version uses the scripted qualification engine and approved knowledge, so it has no API cost and does not require the desktop to have a microphone or speaker.

## Demo flow

1. Choose a sample lead or import `sample-leads.csv`.
2. Select **Start demo call**.
3. Speak as the lead through the laptop microphone.
4. The agent asks qualification questions, answers approved FAQs, and records a structured outcome.
5. Use the keyboard button during a call if browser speech recognition is unavailable.

Everything is stored in browser `localStorage`. No lead data is sent by this app to an external server.

## Optional local Ollama

The scripted conversation works without Ollama. For broader free-form answers, install Ollama and download a small model:

```powershell
ollama pull qwen3:4b
```

Keep Ollama running, open **Agent setup**, and select **Check Ollama**. Requests go only to `127.0.0.1:11434` through the local Node server.

## Notes

- Browser speech recognition support is best in Edge or Chrome. Depending on browser configuration, recognition may use the browser vendor's speech service even though this app has no paid API integration.
- Browser speech synthesis uses voices installed by the operating system. Select the most natural Indian English or Hindi voice under **Agent setup**.
- This is intentionally a call simulation. Connecting real mobile numbers later requires a compliant Indian telephony provider and consent/DND handling.
