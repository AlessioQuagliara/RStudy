/**
 * Valori Sandbox reali (creati via API Paddle: prodotto "RStudy", prezzo
 * one-time 39,00 EUR) — bastano per testare l'intero checkout con carte di
 * test Paddle, nessun addebito reale. Prima di andare live, ricrea
 * prodotto/prezzo/client-token nell'ambiente Live (le risorse Sandbox non
 * esistono in produzione) e cambia ENVIRONMENT sotto.
 *
 * Il client-side token NON è un segreto (per design: è pensato per stare in
 * una pagina pubblica). La API key Paddle vera resta solo lato server, in
 * studyforge/.env, usata da electron/services/paddleClient.ts per validare
 * la licenza — non ha nulla a che fare con questo file.
 */
export const PADDLE_CLIENT_TOKEN = "test_5fa6e0b78f4dd44abdf4adef408";
export const PADDLE_PRICE_ID = "pri_01m2navwm0187xakt2y9gsaybs";
export const PADDLE_ENVIRONMENT: "sandbox" | "production" = "sandbox";
