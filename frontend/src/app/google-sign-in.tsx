"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentityServices {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: {
          theme: "outline";
          size: "large";
          shape: "rectangular";
          text: "continue_with";
          logo_alignment: "left";
          width: number;
        },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityServices;
  }
}

export function GoogleSignInButton({ onSuccess }: { onSuccess: () => void }) {
  const buttonHost = useRef<HTMLDivElement>(null);
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState("");
  const [scriptUnavailable, setScriptUnavailable] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !buttonHost.current) return;
    let active = true;
    let scriptElement: HTMLScriptElement | undefined;

    const initialize = () => {
      if (!active || !window.google || !buttonHost.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: (response) => {
          if (!response.credential) {
            setError("Google sign-in did not return a credential.");
            return;
          }
          void signInWithGoogle(response.credential)
            .then(onSuccess)
            .catch((authError: unknown) => {
              setError(
                authError instanceof Error
                  ? authError.message
                  : "Google sign-in could not be completed.",
              );
            });
        },
      });
      window.google.accounts.id.renderButton(buttonHost.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        logo_alignment: "left",
        width: Math.min(buttonHost.current.clientWidth || 340, 340),
      });
    };

    if (window.google) {
      initialize();
    } else {
      const existingScript = document.querySelector<HTMLScriptElement>(
        "script[data-google-identity]",
      );
      scriptElement = existingScript ?? document.createElement("script");
      const handleLoad = () => initialize();
      const handleError = () => setScriptUnavailable(true);
      scriptElement.addEventListener("load", handleLoad);
      scriptElement.addEventListener("error", handleError);
      if (!existingScript) {
        scriptElement.src = "https://accounts.google.com/gsi/client";
        scriptElement.async = true;
        scriptElement.defer = true;
        scriptElement.dataset.googleIdentity = "true";
        document.head.appendChild(scriptElement);
      }
    }

    return () => {
      active = false;
    };
  }, [clientId, onSuccess, signInWithGoogle]);

  if (!clientId) return null;

  return (
    <div className="google-sign-in-wrap">
      <div className="google-button-host" ref={buttonHost} />
      {scriptUnavailable ? (
        <p className="google-sign-in-fallback" role="status">
          Google sign-in needs network access. You can still use your email and password.
        </p>
      ) : null}
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
