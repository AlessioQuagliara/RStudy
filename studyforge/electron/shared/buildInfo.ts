/**
 * Data di rilascio della build corrente, in formato ISO (YYYY-MM-DD).
 * Aggiorna questa costante ad ogni release pubblicata (electron-builder /
 * GitHub Release): è il valore confrontato con `license.updatesValidUntil`
 * (electron/services/licenseService.ts) per decidere se questa versione
 * rientra nell'anno di aggiornamenti gratuiti inclusi nella licenza.
 * Non c'è un meccanismo automatico (nessun server di release): un progetto
 * di queste dimensioni non giustifica la complessità di iniettarla a build
 * time via CI, un valore aggiornato a mano ad ogni tag è sufficiente.
 */
export const APP_RELEASE_DATE = "2026-09-16";
