"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/app/admin/actions";
import { IconEye, IconEyeOff, IconHome, IconUser } from "@/components/admin/icons";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="adm-btn login-submit" type="submit" disabled={pending} aria-busy={pending}>
      <IconUser />
      {pending ? "Entrando" : "Entrar"}
    </button>
  );
}

export function LoginForm({ error, nextPath }: { error?: string; nextPath: string }) {
  const [state, action] = useActionState(loginAction, {
    error: error ? "1" : undefined,
  } satisfies LoginState);
  const [showPass, setShowPass] = useState(false);
  const [caps, setCaps] = useState(false);
  const [kbPad, setKbPad] = useState(0);
  const userRef = useRef<HTMLInputElement>(null);
  const hasError = Boolean(state.error);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbPad(covered);
    };
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    sync();
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  useEffect(() => {
    if (!hasError) return;
    document.getElementById("login-error")?.scrollIntoView({ block: "nearest" });
  }, [hasError]);

  function onFocusInput(event: React.FocusEvent<HTMLInputElement>) {
    const el = event.currentTarget;
    window.setTimeout(() => {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    }, 50);
  }

  function onKey(event: React.KeyboardEvent<HTMLInputElement>) {
    setCaps(event.getModifierState("CapsLock"));
  }

  return (
    <div className="adm adm-login" style={kbPad ? { paddingBottom: kbPad } : undefined}>
      <form className="box" action={action} autoComplete="on" lang="es">
        <div className="login-brand">
          <a className="login-logo" href="/" title="Inicio" aria-label="Inicio">
            <img
              src="/img/logo-lifexi.png"
              alt=""
              width={88}
              height={88}
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
          </a>
          <h1>LIFEXI</h1>
          <p className="sub">Administración</p>
        </div>
        <a className="login-home" href="/" title="Inicio" aria-label="Inicio">
          <IconHome />
          Inicio
        </a>
        {hasError ? (
          <p className="adm-alert" id="login-error" role="alert" aria-live="assertive">
            Usuario o clave incorrectos
          </p>
        ) : null}
        <input type="hidden" name="next" value={nextPath} />
        <div className="adm-form login-fields">
          <div className="login-field">
            <label htmlFor="username">Usuario</label>
            <input
              ref={userRef}
              id="username"
              name="username"
              type="text"
              inputMode="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              required
              maxLength={64}
              dir="auto"
              aria-invalid={hasError}
              aria-describedby={hasError ? "login-error" : undefined}
              onFocus={onFocusInput}
              onKeyUp={onKey}
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Contraseña</label>
            <span className="login-pass-wrap">
              <input
                id="password"
                name="password"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                required
                maxLength={128}
                aria-invalid={hasError}
                aria-describedby={caps ? "login-caps" : hasError ? "login-error" : undefined}
                onFocus={onFocusInput}
                onKeyUp={onKey}
              />
              <button
                className="login-eye"
                type="button"
                title={showPass ? "Ocultar" : "Mostrar"}
                aria-label={showPass ? "Ocultar" : "Mostrar"}
                aria-pressed={showPass}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowPass((value) => !value)}
              >
                {showPass ? <IconEyeOff /> : <IconEye />}
              </button>
            </span>
          </div>
          {caps ? (
            <p className="login-caps" id="login-caps" role="status">
              Bloq Mayús
            </p>
          ) : null}
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
