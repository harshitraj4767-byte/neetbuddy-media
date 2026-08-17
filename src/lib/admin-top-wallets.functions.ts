import { createServerFn } from "@tanstack/react-start";

export const adminListTopWallets = createServerFn({ method: "GET" })
  .inputValidator((d: any) => d)
  .handler(async (): Promise<any[]> => []);
