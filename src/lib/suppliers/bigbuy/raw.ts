import "server-only";

/**
 * ⚠️ FORMA DE RESPUESTA DE BIGBUY — SUPUESTA (a validar con la key).
 *
 * No hay tipos "crudos" estrictos a propósito: cada respuesta se lee con estos
 * lectores defensivos, así que un campo ausente o con otro tipo produce `null`
 * y no una excepción. Cuando llegue la key y se vea la respuesta real, basta
 * con ajustar `mappers.ts`.
 */

export * from "../raw";
