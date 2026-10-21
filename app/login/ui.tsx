"use client";

import { loginAction } from "@/app/admin/actions";
import { IconUser } from "@/components/admin/icons";

export function LoginForm({ error, nextPath }: { error?: string; nextPath: string }) {
  return (
    <div className="adm adm-login">
      <form className="box" action={loginAction}>
        <img src="/img/logo-lifexi.png" alt="" width={72} height={72} />
        <h1>LIFEXI</h1>
        <p className="sub">Administración</p>
        {error ? <p className="adm-alert">Usuario o clave incorrectos</p> : null}
        <input type="hidden" name="next" value={nextPath} />
        <div className="adm-form">
          <label>
            Usuario
            <input name="username" autoComplete="username" />
          </label>
          <label>
            Contraseña
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          <button className="adm-btn" type="submit">
            <IconUser />
            Entrar
          </button>
        </div>
      </form>
    </div>
  );
}
