# LIFEXI 2026

Sitio de la Liga de Fútbol de Ex Alumnos Ignacianos. Misma interfaz que [lifexi.netlify.app](https://lifexi.netlify.app/), preparado para GitHub, Vercel y APIs (Supabase, usuarios) más adelante.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Cómo está armado

La página actual vive en `public/sitio.html` e `public/img/`. Next.js la sirve en `/`. El cliente de Supabase está en `lib/supabase/` (browser, server y admin). Copia `.env.example` a `.env.local` con las keys del proyecto LIFEXI.

## Despliegue en Vercel

El repo se conecta al proyecto de Vercel. Cada push a `main` genera un deploy.
