import fs from "fs";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

function hasUsableOidcSession(parsed) {
  return Boolean(
    parsed &&
    parsed.key &&
    parsed.value &&
    typeof parsed.value === "object" &&
    (parsed.value.access_token || parsed.value.id_token || parsed.value.refresh_token)
  );
}

async function readJsonIfPresent(path) {
  try {
    const raw = await fs.promises.readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export default async function globalSetup() {
  console.log("[global-setup] Starting authentication setup...");

  const existingSessionAuth = await readJsonIfPresent("session-auth.json");
  const existingStorageState = await readJsonIfPresent("auth.json");

  const defaultOidcKey = existingSessionAuth?.key || "oidc.user:https://login-new.accionbreeze.com/realms/accionlabswebsite:isometric";
  let defaultOidcValue = hasUsableOidcSession(existingSessionAuth)
    ? existingSessionAuth.value
    : {
        id_token: "",
        session_state: "",
        access_token: "",
        refresh_token: "",
        token_type: "Bearer",
        scope: "openid profile email",
        profile: {},
        expires_at: 0
      };

  if (process.env.DEFAULT_OIDC_VALUE) {
    try {
      defaultOidcValue = JSON.parse(process.env.DEFAULT_OIDC_VALUE);
    } catch (e) {
      // Ignore invalid fallback JSON and keep the default structure.
    }
  }

  let oidcKey = process.env.OIDC_KEY ?? defaultOidcKey;
  let oidcValue = process.env.OIDC_VALUE ? defaultOidcValue : defaultOidcValue;

  if (process.env.OIDC_VALUE) {
    try {
      oidcValue = JSON.parse(process.env.OIDC_VALUE);
    } catch (e) {
      console.warn("[global-setup] Failed to parse OIDC_VALUE env var as JSON. Using default OIDC value.");
      oidcValue = defaultOidcValue;
    }
  } else if (!hasUsableOidcSession(existingSessionAuth) && input && input.isTTY) {
    try {
      const rl = createInterface({ input, output });
      const keyAnswer = (await rl.question(`OIDC Key (press Enter to accept default: ${defaultOidcKey}): `)).trim();
      if (keyAnswer) {
        oidcKey = keyAnswer;
      }

      const valueAnswer = (await rl.question("OIDC Value (paste JSON or press Enter to accept default): ")).trim();
      if (valueAnswer) {
        try {
          oidcValue = JSON.parse(valueAnswer);
        } catch (e) {
          console.warn("[global-setup] Provided OIDC JSON invalid, using default.");
          oidcValue = defaultOidcValue;
        }
      }

      rl.close();
    } catch (e) {
      // If interactive prompt fails, fall back to existing/default values silently.
    }
  }

  if (!existingStorageState || process.env.OIDC_VALUE || process.env.OIDC_KEY) {
    await fs.promises.writeFile(
      "auth.json",
      JSON.stringify(existingStorageState ?? { cookies: [], origins: [] }, null, 2),
      "utf-8"
    );
  }

  if (!hasUsableOidcSession(existingSessionAuth) || process.env.OIDC_VALUE || process.env.OIDC_KEY) {
    await fs.promises.writeFile(
      "session-auth.json",
      JSON.stringify({ key: oidcKey, value: oidcValue }),
      "utf-8"
    );
  }

  console.log("[global-setup] auth.json created, setup complete.");
}
