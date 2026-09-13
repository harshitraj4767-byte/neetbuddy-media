import { createServerFn } from "@tanstack/react-start";

export const adminListTopWallets = createServerFn({ method: "GET" })
  .validator((d: any) => d)
  .handler(async (): Promise<any[]> => []);
