export type { TableTypes, Json } from "./lobehub-types.js";
export { tables } from "./lobehub-types.js";
export { PrestClient, TypedPrestClient } from "./index.js";
import type { TableTypes } from "./lobehub-types.js";
import { PrestClient } from "./index.js";

export function lobehubClient(client: PrestClient) {
  return client.forSchema<TableTypes>("lobehub", "public");
}
