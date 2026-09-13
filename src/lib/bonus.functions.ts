import { createServerFn } from "@tanstack/react-start";

export const claimBonusKey = createServerFn({ method: "POST" })
  .validator((d: any) => d)
  .handler(async (): Promise<any> => {
    throw new Error("Bonus system has been removed.");
  });
